import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { bucketModel, mediaModel } from "@workspace/db/models"
import { cdnReplaceContent } from "@workspace/cdn-client"
import { audit } from "@workspace/console/lib/audit"

/**
 * PUT /api/companies/[slug]/buckets/[bucketSlug]/media/[mediaId]/content
 *
 * Kod/metin editörünün "kaydet" akışı — mevcut metin dosyasının içeriğini
 * in-place overwrite eder (S3 key + public `/f/:id` URL'i değişmez). Yalnız
 * metin-tabanlı dosyalarda; binary media pipeline gerektirir (upload akışı).
 * `media.upload` permission + audit'li.
 *
 * ⚠ Public `/f/:id` edge cache'i (Cloudflare) kısa TTL sonra tazelenir;
 * editör kendi fetch'inde cache-buster kullanır → kaydettiğini anında görür.
 */
const MAX_TEXT_BYTES = 2 * 1024 * 1024 // 2MB — editör için makul üst sınır

const EDITABLE_EXTS = new Set([
  "txt", "log", "md", "markdown", "json", "xml", "yml", "yaml", "csv", "tsv",
  "html", "htm", "css", "scss", "less", "js", "jsx", "mjs", "cjs", "ts", "tsx",
  "py", "rb", "go", "rs", "java", "kt", "c", "cc", "cpp", "h", "hpp", "cs",
  "php", "swift", "sh", "bash", "zsh", "sql", "toml", "ini", "env", "conf",
  "graphql", "gql", "vue", "svelte", "dockerfile",
])

function isEditableText(mimeType: string | undefined, name: string): boolean {
  const m = (mimeType || "").toLowerCase()
  if (m.startsWith("text/") || m === "application/json") return true
  const ext = name.split(".").pop()?.toLowerCase() || ""
  return EDITABLE_EXTS.has(ext)
}

export async function PUT(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ slug: string; bucketSlug: string; mediaId: string }>
  },
) {
  const { slug, bucketSlug, mediaId } = await params
  const access = await resolveCompanyAccess(request, slug, "media.upload")
  if ("error" in access) return access.error

  const bucket = await bucketModel.findUserVisibleBySlug(access.companyId, bucketSlug)
  if (!bucket) return jsonError("Bucket not found", 404)

  const media = await mediaModel.findById(mediaId)
  if (!media || media.bucketId !== bucket.id)
    return jsonError("Media not found", 404)

  if (!isEditableText(media.mimeType, media.originalName || media.fileName))
    return jsonError("This file type is not editable as text", 415)

  let content: string
  try {
    const body = (await request.json()) as { content?: unknown }
    if (typeof body?.content !== "string")
      return jsonError("Missing content string", 400)
    content = body.content
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const bytes = new TextEncoder().encode(content).length
  if (bytes > MAX_TEXT_BYTES) return jsonError("Content too large (max 2MB)", 413)

  let updated
  try {
    updated = await cdnReplaceContent(
      {
        companyId: access.companyId,
        bucketId: bucket.id,
        userId: access.callerUserId,
      },
      media.id,
      content,
      media.mimeType || "text/plain",
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return jsonError(`CDN replace failed: ${msg}`, 502)
  }

  // Boyut değişimini bucket kullanım sayacına yansıt (dosya sayısı sabit).
  const newSize = typeof updated.size === "number" ? updated.size : bytes
  const delta = newSize - media.size
  if (delta !== 0) {
    await bucketModel.incrementUsage(bucket.id, { storageUsed: delta, fileCount: 0 })
  }

  await audit({
    userId: access.callerUserId,
    companyId: access.companyId,
    action: "media.edit",
    resource: "media",
    resourceId: media.id,
    details: { bucketId: bucket.id, bytes },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
  })

  return jsonSuccess(updated)
}
