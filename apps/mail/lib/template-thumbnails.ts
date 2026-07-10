import { bucketModel } from "@workspace/db/models"
import type { Bucket } from "@workspace/db/types"
import { TEMPLATE_THUMBNAIL_BUCKET_SLUG } from "@workspace/db/constants"

/**
 * Per-company hidden bucket — kullanıcı template'lerinin preview snapshot
 * PNG'lerini saklar. Slug `__` prefix'li olduğu için API kanalından
 * (slugify regex) yaratılamaz, sadece server-side burada üretilir; storage
 * UI'sında listelendiğinde hidden filtre uygulanabilir.
 *
 * isPublic: true — thumbnail'ları CDN üzerinden açık URL ile servis
 * etmemiz gerekli, ama bucket içindeki diğer dosyalar (sadece template
 * thumbnail'lar var) hassas değil.
 */
export async function getOrCreateTemplateThumbnailBucket(
  companyId: string,
): Promise<Bucket> {
  const existing = await bucketModel.findBySlug(
    companyId,
    TEMPLATE_THUMBNAIL_BUCKET_SLUG,
  )
  if (existing) return existing

  return bucketModel.create({
    companyId,
    name: "Template thumbnails",
    slug: TEMPLATE_THUMBNAIL_BUCKET_SLUG,
    description:
      "Template preview snapshots — auto-managed by the templates UI.",
    isPublic: true,
    storageUsed: 0,
    fileCount: 0,
  })
}

export { TEMPLATE_THUMBNAIL_BUCKET_SLUG }
