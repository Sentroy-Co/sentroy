export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { cdnUpload, cdnDelete } from "@workspace/cdn-client"
import { mailTemplateThumbnailModel } from "@workspace/db/models"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"
import { getOrCreateTemplateThumbnailBucket } from "@/lib/template-thumbnails"

/**
 * POST /api/companies/[slug]/templates/[id]/thumbnail
 * multipart/form-data — field "file" (PNG)
 *
 * Save sırasında client html-to-image snapshot üretir → bu endpoint'e POST
 * eder. Per-company hidden bucket'a yazılır, URL ayrı koleksiyona kaydedilir
 * (sentroy template doc'una touch etmeyiz). Eski thumbnail varsa silinir.
 *
 * Template'in gerçekten company'ye ait olduğunu sentroy.templates.get ile
 * doğrularız — aksi halde başka company'nin template id'sine thumbnail
 * basılabilirdi.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params

  const result = await getSentroyForCompany(request, slug, "templates.manage")
  if ("error" in result && result.error) return result.error
  const sentroy = result.sentroy!
  const companyId = result.companyId!

  try {
    const tpl = await sentroy.templates.get(id)
    if (!tpl.data) return jsonError("Template not found", 404)
  } catch {
    return jsonError("Template not found", 404)
  }

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

  const bucket = await getOrCreateTemplateThumbnailBucket(companyId)

  // Eski thumbnail varsa CDN'den sil (idempotent — fail bypass).
  const existing = await mailTemplateThumbnailModel.findByTemplate(
    companyId,
    id,
  )
  if (existing) {
    await cdnDelete(
      {
        companyId,
        bucketId: bucket.id,
        userId: result.callerUserId!,
        userEmail: result.callerEmail,
      },
      existing.mediaId,
    ).catch(() => {})
  }

  const filename = `template-${id}-${Date.now()}.png`
  const uploaded = await cdnUpload(
    {
      companyId,
      bucketId: bucket.id,
      userId: result.callerUserId!,
      userEmail: result.callerEmail,
    },
    file,
    {
      filename,
      folder: `template-thumbnails`,
      isPublic: true,
      alt: `Preview for template ${id}`,
      tags: ["template-thumbnail", id],
    },
  )

  const saved = await mailTemplateThumbnailModel.upsert({
    companyId,
    templateId: id,
    url: uploaded.url,
    mediaId: uploaded.mediaId,
  })

  return jsonSuccess({ thumbnailUrl: saved.url })
}

/**
 * DELETE /api/companies/[slug]/templates/[id]/thumbnail
 * Template silindiğinde frontend bu endpoint'i çağırır → orphan temizler.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const result = await getSentroyForCompany(request, slug, "templates.manage")
  if ("error" in result && result.error) return result.error
  const companyId = result.companyId!

  const existing = await mailTemplateThumbnailModel.findByTemplate(
    companyId,
    id,
  )
  if (!existing) return jsonSuccess({ deleted: false })

  const bucket = await getOrCreateTemplateThumbnailBucket(companyId)
  await cdnDelete(
    {
      companyId,
      bucketId: bucket.id,
      userId: result.callerUserId!,
      userEmail: result.callerEmail,
    },
    existing.mediaId,
  ).catch(() => {})

  await mailTemplateThumbnailModel.deleteByTemplate(companyId, id)
  return jsonSuccess({ deleted: true })
}
