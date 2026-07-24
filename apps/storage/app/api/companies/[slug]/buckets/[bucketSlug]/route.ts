export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import {
  storageViewer,
  canManageItemAccess,
  callerHasPermission,
  parseStorageAccess,
} from "@/lib/storage-access"
import { bucketModel, mediaModel } from "@workspace/db/models"
import { cdnPurgeBucket } from "@workspace/cdn-client"

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ slug: string; bucketSlug: string }>
  },
) {
  const { slug, bucketSlug } = await params
  const access = await resolveCompanyAccess(request, slug, "storage.view")
  if ("error" in access) return access.error

  const bucket = await bucketModel.findUserVisibleBySlug(access.companyId, bucketSlug, storageViewer(access))
  if (!bucket) return jsonError("Bucket not found", 404)

  return jsonSuccess(bucket)
}

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ slug: string; bucketSlug: string }>
  },
) {
  const { slug, bucketSlug } = await params
  // Üyelik yeter; yetkiyi alana göre değerlendir: meta (ad/açıklama/isPublic)
  // → buckets.edit; access tier → sahip/yönetici (canManageItemAccess).
  const access = await resolveCompanyAccess(request, slug)
  if ("error" in access) return access.error

  const bucket = await bucketModel.findUserVisibleBySlug(access.companyId, bucketSlug, storageViewer(access))
  if (!bucket) return jsonError("Bucket not found", 404)

  let body: {
    name?: string
    description?: string
    isPublic?: boolean
    access?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const wantsMeta =
    body.name !== undefined ||
    body.description !== undefined ||
    body.isPublic !== undefined
  const wantsAccess = body.access !== undefined

  // Meta düzenleme buckets.edit ister; access değişimi sahip/yönetici ister.
  if (wantsMeta && !(await callerHasPermission(access, slug, "buckets.edit"))) {
    return jsonError("Insufficient permissions", 403)
  }
  if (wantsAccess && !canManageItemAccess(bucket.ownerUserId, access)) {
    return jsonError("Cannot change this bucket's visibility", 403)
  }

  const updates: Record<string, unknown> = {}
  let visibilityChanged: boolean | null = null

  if (body.name && typeof body.name === "string" && body.name.trim()) {
    updates.name = body.name.trim()
  }
  if (body.description !== undefined) {
    updates.description =
      typeof body.description === "string" ? body.description.trim() : undefined
  }
  if (body.isPublic !== undefined) {
    const newPublic = Boolean(body.isPublic)
    if (newPublic !== bucket.isPublic) visibilityChanged = newPublic
    updates.isPublic = newPublic
  }
  if (wantsAccess) {
    updates.access = parseStorageAccess(body.access)
  }

  if (Object.keys(updates).length === 0)
    return jsonError("No valid fields to update")

  /**
   * Görünürlük toggle: tamamen DB-driven. Tüm dosya erişimi `/f/:id`
   * proxy'sinden geçtiği için `isPublic` flag'i DB'de tutmak yetiyor —
   * S3 nesne ACL'lerine dokunmuyoruz. (Bazı S3 uyumlu sağlayıcılar
   * `PutObjectAcl` desteklemiyor, ek olarak büyük bucket'larda batch
   * ACL update'i çok yavaş; karar: backend ACL'i sabit private bırakıp
   * görünürlüğü auth gate'inde değerlendirmek.)
   */
  if (visibilityChanged !== null) {
    await mediaModel.setBucketVisibility(bucket.id, visibilityChanged)
  }

  const updated = await bucketModel.updateById(bucket.id, updates as any)
  return jsonSuccess(updated)
}

/**
 * DELETE — dosyası yoksa doğrudan siler. `?force=true` ile (veya body
 * `{ force: true }` ile) bucket'ın tüm dosyalarını önce cdn-server üzerinden
 * temizler, sonra bucket dokümanını düşürür.
 */
export async function DELETE(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ slug: string; bucketSlug: string }>
  },
) {
  const { slug, bucketSlug } = await params
  const access = await resolveCompanyAccess(request, slug, "buckets.delete")
  if ("error" in access) return access.error

  const bucket = await bucketModel.findUserVisibleBySlug(access.companyId, bucketSlug, storageViewer(access))
  if (!bucket) return jsonError("Bucket not found", 404)

  const force =
    request.nextUrl.searchParams.get("force") === "true" ||
    (await request
      .clone()
      .json()
      .then((b: any) => Boolean(b?.force))
      .catch(() => false))

  const fileCount = await mediaModel.countByBucket(bucket.id)

  if (fileCount > 0 && !force) {
    return jsonError(
      `Bucket has ${fileCount} file(s). Pass ?force=true to purge everything.`,
      409,
    )
  }

  if (fileCount > 0) {
    try {
      await cdnPurgeBucket({
        companyId: access.companyId,
        bucketId: bucket.id,
        userId: access.callerUserId,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return jsonError(`CDN purge failed: ${msg}`, 502)
    }
  }

  await bucketModel.deleteById(bucket.id)
  return jsonSuccess({ deleted: true })
}
