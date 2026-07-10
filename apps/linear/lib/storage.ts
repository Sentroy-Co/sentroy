/**
 * Dosya depolama soyutlaması (triage storage.server.ts portu, multi-tenant).
 *
 * Sağlayıcı env yerine şirketin `linear_settings` dokümanından okunur:
 *  - "sentroy" → herkese açık CDN URL (Linear oturumu olmayanlar da önizler)
 *  - "linear"  → Linear'ın iki-adımlı dosya yükleme akışı (varsayılan)
 *
 * İmza kararı (PLAN §4 raporlu): `uploadToStorage(companyId, file, opts?)` —
 * Linear yolu ctx istediğinde İÇERİDE `getLinearContext(companyId)` çözülür;
 * caller'a tek ve basit bir imza kalır. Sentroy yolunda Linear bağlantısı hiç
 * gerekmez (settings'ten Sentroy kimlikleri decrypt edilir).
 *
 * Dönen `url` her iki sağlayıcıda da doğrudan <img src> / attachment URL'i
 * olarak kullanılır.
 */

import { linearGraphQL } from "./linear/client"
import { getLinearContext } from "./linear/context"
import { FILE_UPLOAD_MUTATION } from "./linear/queries"
import { LinearError } from "./errors"
import { getLinearSettings, safeDecrypt } from "./settings"
import type { LinearSettings } from "./settings"
import { logger } from "./logger"

export type UploadedFile = {
  /** Orijinal (tam çözünürlük) dosya URL'i. */
  url: string
  /**
   * Önizleme için optimize edilmiş URL. Sentroy'da görseller için CDN'in
   * ürettiği sıkıştırılmış variant (~960px); görsel değilse veya Linear
   * sağlayıcısında `url` ile aynıdır. UI önizlemelerinde bunu kullan —
   * orijinali yüklemeden bandwidth/performans kazanılır.
   */
  previewUrl: string
  contentType: string
  filename: string
  size: number
}

type SentroyCreds = {
  apiKey: string
  bucketId: string
  companySlug: string
  baseUrl: string
}

/** Sentroy sağlayıcısı için gereken kimlikler tam mı? Eksikse null. */
function resolveSentroyCreds(settings: LinearSettings): SentroyCreds | null {
  const apiKey = safeDecrypt(settings.sentroyApiKeyCipher)
  const bucketId = settings.sentroyBucketId?.trim()
  const companySlug = settings.sentroyCompanySlug?.trim()
  if (!apiKey || !bucketId || !companySlug) return null
  return {
    apiKey,
    bucketId,
    companySlug,
    baseUrl: settings.sentroyBaseUrl?.trim() || "https://sentroy.com",
  }
}

/**
 * Şirket için etkin depolama sağlayıcısı. "sentroy" seçili ama kimlikler
 * eksik/çözülemiyorsa Linear'a düşer (triage davranışı).
 */
export async function activeStorageProvider(
  companyId: string,
): Promise<"linear" | "sentroy"> {
  const settings = await getLinearSettings(companyId)
  if (!settings) return "linear"
  if (settings.storageProvider === "sentroy") {
    if (resolveSentroyCreds(settings)) return "sentroy"
    logger.warn({
      source: "sentroy",
      companyId,
      message:
        "storageProvider=sentroy ama Sentroy API key/bucket/slug eksik — Linear'a düşülüyor",
    })
  }
  return "linear"
}

/**
 * Aktif sağlayıcıya yükle. `makePublic` yalnız Linear sağlayıcısında etkilidir
 * (Sentroy CDN URL'leri zaten herkese açık). Editör görselleri için
 * makePublic=true; Linear ek dosyaları geçmişte false kullanıyordu.
 */
export async function uploadToStorage(
  companyId: string,
  file: File,
  opts?: { makePublic?: boolean },
): Promise<UploadedFile> {
  if (file.size <= 0) throw new LinearError("Boş dosya yüklenemez")
  const settings = await getLinearSettings(companyId)
  if (settings?.storageProvider === "sentroy") {
    const creds = resolveSentroyCreds(settings)
    if (creds) return uploadToSentroy(creds, file)
    logger.warn({
      source: "sentroy",
      companyId,
      message:
        "storageProvider=sentroy ama Sentroy API key/bucket/slug eksik — Linear'a düşülüyor",
    })
  }
  return uploadToLinear(companyId, file, opts?.makePublic ?? true)
}

/* ------------------------------- Sentroy -------------------------------- */

/**
 * Resmi SDK (@sentroy-co/client-sdk) ile yükler. SDK companySlug + baseUrl +
 * accessToken ile doğru gateway URL'ini kendi kurar. CJS paket; boot'u
 * etkilememek için LAZY dynamic import edilir (yalnız sentroy yüklemesinde
 * yüklenir). `media.url` public bucket'ın direct CDN URL'idir — Linear oturumu
 * olmayanlar da bununla önizler (bucket'ın Sentroy'da public olması gerekir).
 */
async function uploadToSentroy(
  creds: SentroyCreds,
  file: File,
): Promise<UploadedFile> {
  const { Sentroy, pickPresetThumbnailUrl } = await import(
    "@sentroy-co/client-sdk"
  )
  const client = new Sentroy({
    baseUrl: creds.baseUrl,
    companySlug: creds.companySlug,
    accessToken: creds.apiKey,
  })
  const media = await client.media.upload(creds.bucketId, {
    body: file,
    filename: file.name,
    isPublic: true,
  })
  const url = media.url ?? media.downloadUrl
  if (!url) {
    logger.warn({
      source: "sentroy",
      message:
        "Sentroy media.url boş — bucket public değil olabilir; downloadUrl da yok",
      mediaId: media.id,
    })
    throw new LinearError(
      "Sentroy yüklemesi başarısız: public URL dönmedi (bucket public mi?)",
      { status: 502 },
    )
  }
  // Görseller için CDN'in ürettiği ~960px optimize variant; görsel değilse
  // (ya da thumbnail yoksa) orijinale düşer. Önizlemelerde performans için.
  const previewUrl = pickPresetThumbnailUrl(media, "preview") ?? url
  return {
    url,
    previewUrl,
    contentType: media.mimeType || file.type || "application/octet-stream",
    filename: media.fileName || file.name,
    size: media.size || file.size,
  }
}

/* -------------------------------- Linear -------------------------------- */

type FileUploadResponse = {
  fileUpload: {
    success: boolean
    uploadFile: {
      uploadUrl: string
      assetUrl: string
      contentType: string
      filename: string
      size: number
      headers: { key: string; value: string }[]
    } | null
  }
}

/**
 * Linear'ın iki-adımlı yüklemesi: (1) fileUpload ile imzalı PUT URL al,
 * (2) baytları sunucudan PUT et (tarayıcı CORS'unu atlar). Dönen assetUrl
 * Linear deposundadır (önizleme Linear oturumu gerektirir).
 */
async function uploadToLinear(
  companyId: string,
  file: File,
  makePublic: boolean,
): Promise<UploadedFile> {
  const ctx = await getLinearContext(companyId)
  if (!ctx) {
    throw new LinearError("Linear bağlantısı yok — dosya yüklenemez", {
      status: 412,
    })
  }
  const upload = await linearGraphQL<FileUploadResponse>(
    ctx,
    FILE_UPLOAD_MUTATION,
    {
      contentType: file.type || "application/octet-stream",
      filename: file.name,
      size: file.size,
      makePublic,
    },
  )
  if (!upload.fileUpload.success || !upload.fileUpload.uploadFile) {
    throw new LinearError("Linear fileUpload başarısız")
  }
  const u = upload.fileUpload.uploadFile

  const headers = new Headers()
  for (const h of u.headers) headers.set(h.key, h.value)
  headers.set("Content-Type", u.contentType)

  const buf = await file.arrayBuffer()
  const putRes = await fetch(u.uploadUrl, {
    method: "PUT",
    body: buf,
    headers,
  })
  if (!putRes.ok) {
    const excerpt = await putRes.text().catch(() => "")
    logger.error({
      source: "linear",
      message: "asset PUT failed",
      status: putRes.status,
      body: excerpt.slice(0, 200),
    })
    throw new LinearError(`Dosya yüklenemedi (${putRes.status})`)
  }

  return {
    url: u.assetUrl,
    // Linear tarafında optimize variant yok; önizleme = orijinal.
    previewUrl: u.assetUrl,
    contentType: u.contentType,
    filename: u.filename,
    size: u.size,
  }
}
