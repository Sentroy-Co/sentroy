import { NextRequest } from "next/server"
import { jsonSuccess } from "@workspace/console/lib/api-helpers"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { bucketModel, mediaModel } from "@workspace/db/models"
import { getStorageQuota } from "@/lib/quota"

/**
 * GET /api/companies/[slug]/usage
 *
 * Overview/Usage sayfası için toplu breakdown.
 *   - quota: plan kotasi (storage + mail) ve doluluk
 *   - buckets: bucket-bazinda kullanim
 *   - byType: media type dagilimi (image/video/audio/document/other)
 *   - timeSeries: son 30 gunluk upload trendleri (count + bytes)
 *   - recent: son 10 upload (chart altinda thumbnail seridi icin)
 *
 * 30 gun + recent agreggate'lari ucret kotasina ek backend hit getiriyor;
 * frontend tek `useEffect`'te tek seferde tuketir.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "storage.view")
  if ("error" in access) return access.error

  const buckets = await bucketModel.findUserVisibleByCompany(access.companyId)
  const bucketIds = buckets.map((bucket) => bucket.id)

  const [quota, byType, timeSeries, recent] = await Promise.all([
    getStorageQuota(access.companyId),
    mediaModel.aggregateByTypeForCompany(access.companyId, { bucketIds }),
    mediaModel.aggregateUploadsTimeSeries(access.companyId, 30, { bucketIds }),
    mediaModel.findRecentForCompany(access.companyId, 10, { bucketIds }),
  ])

  // Bucket summary — isim + slug + used + fileCount
  const bucketBreakdown = buckets.map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    storageUsed: b.storageUsed,
    fileCount: b.fileCount,
    isPublic: b.isPublic,
  }))

  // Bucket isim lookup'ı recent listesine ekleyebilmek icin (UI'da
  // "in {bucket}" gosterimi).
  const bucketNameById = new Map<string, string>()
  const bucketSlugById = new Map<string, string>()
  for (const b of buckets) {
    bucketNameById.set(b.id, b.name)
    bucketSlugById.set(b.id, b.slug)
  }

  const recentSlim = recent.map((m) => ({
    id: m.id,
    originalName: m.originalName,
    type: m.type,
    mimeType: m.mimeType,
    size: m.size,
    bucketId: m.bucketId,
    bucketName: bucketNameById.get(m.bucketId) ?? null,
    bucketSlug: bucketSlugById.get(m.bucketId) ?? null,
    isPublic: m.isPublic,
    createdAt: m.createdAt,
    hasThumbnail: Boolean(m.imageMeta?.thumbnails?.length),
  }))

  return jsonSuccess({
    quota,
    buckets: bucketBreakdown,
    byType,
    timeSeries,
    recent: recentSlim,
  })
}
