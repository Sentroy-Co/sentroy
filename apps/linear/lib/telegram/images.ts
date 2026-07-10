/**
 * Telegram fotoğraflarını Linear talebine ek olarak yükler (triage
 * images.server.ts portu). Triage'da görseller Sentroy token/remap hattına
 * gidip markdown'a gömülüyordu; Linear Lite'ta issue oluşturulduktan SONRA
 * mevcut `uploadAttachmentFile` yoluyla (aktif storage provider'a) attachment
 * olarak bağlanır — ek render kodu yazılmaz.
 *
 * Aynen korunan davranışlar: getFile file_size ÖN-kontrolü, magic-byte
 * doğrulama (Content-Type'a güvenme), 25MB sınırı, kısmi başarı kabulü.
 */

import { logger } from "../logger"
import { uploadAttachmentFile } from "../linear/issues"
import type { LinearContext } from "../linear/context"
import type { TelegramApi } from "./api"

const MAX_BYTES = 25 * 1024 * 1024

/** İlk byte'lardan görsel tipi (Content-Type'a güvenme). */
function sniffImage(b: Uint8Array): string | null {
  if (b.length < 12) return null
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg"
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return "image/png"
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif"
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  )
    return "image/webp"
  return null
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
}

async function attachOne(
  ctx: LinearContext,
  api: TelegramApi,
  issueId: string,
  fileId: string,
  index: number,
): Promise<boolean> {
  // 1) getFile: indirme ÖNCESİ boyut kontrolü
  const file = await api.getFile(fileId)
  if (file.file_size && file.file_size > MAX_BYTES) {
    logger.warn({
      source: "telegram",
      message: "foto 25MB üstü, atlandı",
      fileId,
    })
    return false
  }
  if (!file.file_path) return false

  // 2) indir
  const { buffer } = await api.downloadFile(file.file_path)
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) return false

  // 3) magic-byte doğrula
  const bytes = new Uint8Array(buffer)
  const mime = sniffImage(bytes)
  if (!mime) {
    logger.warn({
      source: "telegram",
      message: "görsel imzası tanınmadı, atlandı",
      fileId,
    })
    return false
  }

  // 4) mevcut attachment upload yoluyla issue'ya bağla
  const blob = new File([buffer], `tg-${Date.now()}-${index}.${EXT[mime]}`, {
    type: mime,
  })
  await uploadAttachmentFile(ctx, { issueId, file: blob })
  return true
}

/**
 * Bir dizi photo file_id'sini issue'ya ek olarak yükler. Kısmi başarı kabul:
 * başarısızlar loglanır, talep zaten açılmıştır (triage semantiği korunur).
 */
export async function attachTelegramPhotos(
  ctx: LinearContext,
  api: TelegramApi,
  issueId: string,
  fileIds: string[],
): Promise<{ uploaded: number; failed: number }> {
  let uploaded = 0
  let failed = 0
  for (let i = 0; i < fileIds.length; i++) {
    try {
      if (await attachOne(ctx, api, issueId, fileIds[i]!, i)) uploaded++
      else failed++
    } catch (e) {
      failed++
      logger.error({
        source: "telegram",
        message: "foto işlenemedi",
        error: (e as Error).message,
      })
    }
  }
  return { uploaded, failed }
}
