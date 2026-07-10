import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import { uploadToStorage } from "@/lib/storage"
import { registerImageAsset } from "@/lib/image-assets"
import { LinearError } from "@/lib/errors"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BYTES = 25 * 1024 * 1024

/**
 * POST /upload — editör görseli / dosya yükleme (triage api.upload portu).
 * linear.edit. multipart `file` alanı, ≤25MB. Aktif depolama sağlayıcısına
 * (Linear ya da Sentroy CDN) yükler, görsel token'ı üretir.
 *
 * Cevap jsonSuccess zarfı: `{data: {url, previewUrl, contentType, filename,
 * size, imageAlt}}` — editor'ün parseUploadResponse'u zarfı açar. `imageAlt`
 * token'ı editör görselin alt'ına gömer; Linear re-host'unda korunur,
 * render'da Sentroy URL'ine geri çevrilir (bkz. lib/image-assets.ts).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "linear.edit")
  if ("error" in access) return access.error

  const form = await request.formData()
  const fileField = form.get("file")
  if (!(fileField instanceof File) || fileField.size === 0) {
    return jsonError("File is required", 400)
  }
  if (fileField.size > MAX_BYTES) {
    return jsonError("File must be 25 MB or smaller", 413)
  }

  try {
    const result = await uploadToStorage(access.companyId, fileField)
    // Token üret: editör bunu görselin alt'ına gömer; Linear re-host'unda
    // korunur, render'da Sentroy URL'ine geri çevrilir.
    const imageAlt = await registerImageAsset(
      access.companyId,
      result.url,
      result.previewUrl,
    )

    await audit({
      userId: access.callerUserId,
      companyId: access.companyId,
      action: "linear.upload",
      resource: "linear-image-asset",
      resourceId: imageAlt,
      details: {
        filename: result.filename,
        size: result.size,
        contentType: result.contentType,
      },
      request,
    })

    return jsonSuccess({ ...result, imageAlt })
  } catch (err) {
    logger.error({
      source: "storage",
      route: "upload",
      companyId: access.companyId,
      message: (err as Error).message,
    })
    if (err instanceof LinearError) {
      return jsonError(err.message, err.status === 412 ? 412 : 502)
    }
    return jsonError("Upload failed", 502)
  }
}
