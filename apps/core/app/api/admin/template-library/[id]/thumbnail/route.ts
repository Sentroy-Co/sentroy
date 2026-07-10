import { NextRequest } from "next/server"
import {
  jsonError,
  jsonSuccess,
  getAuthSession,
} from "@workspace/console/lib/api-helpers"
import { cdnUpload, cdnDelete } from "@workspace/cdn-client"
import { mediaModel, systemEmailTemplateModel } from "@workspace/db/models"
import { getOrCreateSystemBucket } from "@/lib/system-mail"

/**
 * POST /api/admin/template-library/[id]/thumbnail
 * multipart/form-data — field "file" (PNG)
 *
 * Admin template-library save sırasında client html-to-image ile snapshot
 * üretir → bu endpoint'e POST eder. Thumbnail system bucket'a yazılır,
 * URL template doc'a eklenir. Eski thumbnail varsa silinir (cleanup).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const { id } = await params
  const tpl = await systemEmailTemplateModel.findById(id)
  if (!tpl) return jsonError("Template not found", 404)

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return jsonError("Expected multipart/form-data body")
  }
  const file = form.get("file")
  if (!(file instanceof Blob) || file.size === 0) {
    return jsonError("No thumbnail file provided")
  }

  let bucket
  try {
    bucket = await getOrCreateSystemBucket(session.user.id)
  } catch (err) {
    console.error("[template-thumbnail] system bucket provisioning failed:", err)
    return jsonError(
      `System bucket unavailable: ${err instanceof Error ? err.message : "unknown"}`,
      503,
    )
  }

  // Eski thumbnail varsa sil (idempotent — fail olursa bypass).
  if (tpl.thumbnailUrl) {
    const oldMedia = await mediaModel
      .findByBucket(bucket.id, { limit: 200 })
      .then((items) =>
        items.find((m) => tpl.thumbnailUrl?.includes(m.fileName)),
      )
      .catch(() => null)
    if (oldMedia) {
      await cdnDelete(
        {
          companyId: bucket.companyId,
          bucketId: bucket.id,
          userId: session.user.id,
          userEmail: session.user.email ?? undefined,
        },
        oldMedia.id,
      ).catch(() => {})
    }
  }

  const filename = `template-${tpl.key}-${Date.now()}.png`
  let result
  try {
    result = await cdnUpload(
      {
        companyId: bucket.companyId,
        bucketId: bucket.id,
        userId: session.user.id,
        userEmail: session.user.email ?? undefined,
      },
      file,
      {
        filename,
        folder: `template-thumbnails`,
        isPublic: true,
        alt: `Preview for ${tpl.key}`,
        tags: ["template-thumbnail", tpl.category, tpl.key],
      },
    )
  } catch (err) {
    console.error("[template-thumbnail] cdnUpload failed:", {
      err,
      bucketId: bucket.id,
      filename,
      fileSize: file.size,
    })
    return jsonError(
      `CDN upload failed: ${err instanceof Error ? err.message : "unknown"}`,
      502,
    )
  }

  if (!result?.url) {
    console.error("[template-thumbnail] cdnUpload returned no url:", result)
    return jsonError("CDN returned no url", 502)
  }

  try {
    await systemEmailTemplateModel.updateById(id, {
      thumbnailUrl: result.url,
    })
  } catch (err) {
    console.error("[template-thumbnail] DB update failed:", err)
    return jsonError(
      `DB update failed: ${err instanceof Error ? err.message : "unknown"}`,
      500,
    )
  }

  return jsonSuccess({ thumbnailUrl: result.url })
}
