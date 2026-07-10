import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { bucketModel, mediaModel } from "@workspace/db/models"
import { cdnDelete } from "@workspace/cdn-client"

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ slug: string; bucketSlug: string; mediaId: string }>
  },
) {
  const { slug, bucketSlug, mediaId } = await params
  const access = await resolveCompanyAccess(request, slug, "storage.view")
  if ("error" in access) return access.error

  const bucket = await bucketModel.findUserVisibleBySlug(access.companyId, bucketSlug)
  if (!bucket) return jsonError("Bucket not found", 404)

  const media = await mediaModel.findById(mediaId)
  if (!media || media.bucketId !== bucket.id)
    return jsonError("Media not found", 404)

  return jsonSuccess(media)
}

/**
 * DELETE — cdn-server'a forward eder; cdn-server hem S3 key'lerini hem de
 * Media dokümanını siler. Biz sadece bucket sayaçlarını düşürürüz.
 */
export async function DELETE(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ slug: string; bucketSlug: string; mediaId: string }>
  },
) {
  const { slug, bucketSlug, mediaId } = await params
  const access = await resolveCompanyAccess(request, slug, "media.delete")
  if ("error" in access) return access.error

  const bucket = await bucketModel.findUserVisibleBySlug(access.companyId, bucketSlug)
  if (!bucket) return jsonError("Bucket not found", 404)

  const media = await mediaModel.findById(mediaId)
  if (!media || media.bucketId !== bucket.id)
    return jsonError("Media not found", 404)

  try {
    await cdnDelete(
      {
        companyId: access.companyId,
        bucketId: bucket.id,
        userId: access.callerUserId,
      },
      media.id,
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return jsonError(`CDN delete failed: ${msg}`, 502)
  }

  await bucketModel.incrementUsage(bucket.id, {
    storageUsed: -media.size,
    fileCount: -1,
  })

  return jsonSuccess({ deleted: true })
}
