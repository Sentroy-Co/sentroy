import { bucketModel } from "@workspace/db/models"
import type { Bucket } from "@workspace/db/types"
import {
  COMPANY_AVATAR_BUCKET_SLUG,
  COMPANY_COVER_BUCKET_SLUG,
} from "@workspace/db/constants"

/**
 * Per-company hidden bucket — company avatar (logo/marka görseli) için
 * tek konum. `__` prefix'li slug user-tarafı bucket create regex'ine
 * uymadığı için sadece server-side burada üretilir; storage UI listing
 * bu prefix'i filter etmeli (gelecekte).
 *
 * isPublic: true — avatar CDN üzerinden açık URL'le servis edilir; team
 * switcher / dashboard direkt <img> ile çeker.
 */
export async function getOrCreateCompanyAvatarBucket(
  companyId: string,
): Promise<Bucket> {
  const existing = await bucketModel.findBySlug(
    companyId,
    COMPANY_AVATAR_BUCKET_SLUG,
  )
  if (existing) return existing

  return bucketModel.create({
    companyId,
    name: "Company avatar",
    slug: COMPANY_AVATAR_BUCKET_SLUG,
    description:
      "Company avatar / logo — auto-managed by the company settings UI.",
    isPublic: true,
    storageUsed: 0,
    fileCount: 0,
  })
}

/**
 * Per-company hidden bucket — company cover/banner (geniş kapak görseli)
 * için tek konum. Avatar bucket'ının kardeşi: `__cover` prefix'li slug
 * user-tarafı bucket create regex'ine uymadığı için sadece server-side
 * burada üretilir; storage UI listing bu prefix'i filter eder.
 *
 * isPublic: true — cover CDN üzerinden açık URL'le servis edilir; company
 * profile / settings direkt <img> ile çeker.
 */
export async function getOrCreateCompanyCoverBucket(
  companyId: string,
): Promise<Bucket> {
  const existing = await bucketModel.findBySlug(
    companyId,
    COMPANY_COVER_BUCKET_SLUG,
  )
  if (existing) return existing

  return bucketModel.create({
    companyId,
    name: "Company cover",
    slug: COMPANY_COVER_BUCKET_SLUG,
    description:
      "Company cover / banner — auto-managed by the company settings UI.",
    isPublic: true,
    storageUsed: 0,
    fileCount: 0,
  })
}

export { COMPANY_AVATAR_BUCKET_SLUG, COMPANY_COVER_BUCKET_SLUG }
