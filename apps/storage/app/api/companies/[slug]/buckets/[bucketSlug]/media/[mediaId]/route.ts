export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { bucketModel, mediaModel } from "@workspace/db/models"
import { cdnDelete } from "@workspace/cdn-client"
import {
  storageViewer,
  canViewItem,
  canManageItemAccess,
  callerHasPermission,
  parseStorageAccess,
} from "@/lib/storage-access"

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

  const bucket = await bucketModel.findUserVisibleBySlug(access.companyId, bucketSlug, storageViewer(access))
  if (!bucket) return jsonError("Bucket not found", 404)

  const media = await mediaModel.findById(mediaId)
  if (!media || media.bucketId !== bucket.id)
    return jsonError("Media not found", 404)

  // Erişim tier'ı + kişi-bazlı grant gate'i — yetkisiz izleyiciye 404
  // (varlığını sızdırmamak için 403 değil).
  if (!canViewItem(media.access, media.uploadedBy, access, media.sharedWith)) {
    return jsonError("Media not found", 404)
  }

  return jsonSuccess(media)
}

/**
 * PATCH — dosyanın şirket-içi erişim tier'ını (`access`) değiştirir. Yalnız
 * dosyanın sahibi (uploadedBy) veya şirket sahibi/yöneticisi (notlardaki PATCH
 * gate'iyle aynı). `isPublic` (anonim CDN) bu route'la DEĞİŞTİRİLMEZ.
 */
export async function PATCH(
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

  const bucket = await bucketModel.findUserVisibleBySlug(access.companyId, bucketSlug, storageViewer(access))
  if (!bucket) return jsonError("Bucket not found", 404)

  const media = await mediaModel.findById(mediaId)
  if (!media || media.bucketId !== bucket.id)
    return jsonError("Media not found", 404)

  if (!canManageItemAccess(media.uploadedBy, access)) {
    return jsonError("Cannot change this file's visibility", 403)
  }

  let body: { access?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  if (body.access === undefined) {
    return jsonError("access is required")
  }

  const nextAccess = parseStorageAccess(body.access)
  const updated = await mediaModel.updateById(mediaId, { access: nextAccess })
  if (!updated) return jsonError("Media not found", 404)

  return jsonSuccess(updated)
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
  // Yalnız üyelik iste; silme yetkisini "media.delete VEYA sahiplik" ile
  // aşağıda değerlendir — kullanıcı yetkisi olmasa da KENDİ dosyasını silebilir.
  const access = await resolveCompanyAccess(request, slug)
  if ("error" in access) return access.error

  const bucket = await bucketModel.findUserVisibleBySlug(access.companyId, bucketSlug, storageViewer(access))
  if (!bucket) return jsonError("Bucket not found", 404)

  const media = await mediaModel.findById(mediaId)
  if (!media || media.bucketId !== bucket.id)
    return jsonError("Media not found", 404)

  const permitted = await callerHasPermission(access, slug, "media.delete")
  if (!permitted && media.uploadedBy !== access.callerUserId) {
    return jsonError("Cannot delete this file", 403)
  }

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
