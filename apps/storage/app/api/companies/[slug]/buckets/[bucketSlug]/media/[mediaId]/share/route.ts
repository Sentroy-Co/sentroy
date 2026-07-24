export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import {
  bucketModel,
  mediaModel,
  companyMemberModel,
  authUserModel,
} from "@workspace/db/models"
import { audit } from "@workspace/console/lib/audit"
import { storageViewer, canViewItem } from "@/lib/storage-access"
import {
  notifyStorageShare,
  type ShareRecipient,
} from "@/lib/storage-share-notify"

/**
 * POST — dosyayı şirket-içi kişilerle paylaş. Body: `{ userIds: string[] }`.
 * Alıcı dosyayı göremiyorsa erişim otomatik verilir (kişi-bazlı grant:
 * media.sharedWith'e eklenir — tier'a dokunmadan). Sonra "X seninle Y'yi
 * paylaştı" bildirimi (in-app + e-posta + push) gider.
 *
 * Yetki: paylaşan dosyayı görebiliyor olmalı (canViewItem). Alıcılar aktif
 * şirket üyesi olmalı.
 */
export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ slug: string; bucketSlug: string; mediaId: string }>
  },
) {
  const { slug, bucketSlug, mediaId } = await params
  const access = await resolveCompanyAccess(request, slug)
  if ("error" in access) return access.error

  const bucket = await bucketModel.findUserVisibleBySlug(
    access.companyId,
    bucketSlug,
    storageViewer(access),
  )
  if (!bucket) return jsonError("Bucket not found", 404)

  const media = await mediaModel.findById(mediaId)
  if (!media || media.bucketId !== bucket.id)
    return jsonError("Media not found", 404)

  // Paylaşan dosyayı görebilmeli (aksi halde varlığını sızdırmamak için 404).
  if (!canViewItem(media.access, media.uploadedBy, access, media.sharedWith)) {
    return jsonError("Media not found", 404)
  }

  let body: { userIds?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  const requestedIds = Array.isArray(body.userIds)
    ? [
        ...new Set(
          body.userIds.filter(
            (v): v is string => typeof v === "string" && v.length > 0,
          ),
        ),
      ]
    : []
  if (requestedIds.length === 0) {
    return jsonError("userIds (non-empty string[]) required")
  }

  // Alıcıları aktif şirket üyeleriyle sınırla (kendini çıkar).
  const members = await companyMemberModel.findByCompany(access.companyId)
  const activeIds = new Set(
    members
      .filter((m) => m.status === "active")
      .map((m) => m.userId),
  )
  const targetIds = requestedIds.filter(
    (id) => activeIds.has(id) && id !== access.callerUserId,
  )
  if (targetIds.length === 0) {
    return jsonError("No valid recipients (must be active company members)")
  }

  // Kişi-bazlı erişim grant'i — alıcı zaten göremiyorsa artık görebilir.
  await mediaModel.addSharedWith(mediaId, targetIds)

  // Alıcı e-postaları + paylaşan adı.
  const users = await authUserModel.findByIds(targetIds)
  const recipients: ShareRecipient[] = targetIds.map((id) => ({
    userId: id,
    email: users.get(id)?.email ?? null,
  }))
  const sharerName =
    access.session?.user?.name ||
    access.callerEmail ||
    "A colleague"

  await notifyStorageShare({
    recipients,
    sharerName,
    fileName: media.originalName,
    companySlug: slug,
    bucketSlug,
    folder: media.folder,
    fileId: media.id,
  })

  await audit({
    userId: access.callerUserId,
    companyId: access.companyId,
    action: "media.share",
    resource: "media",
    resourceId: media.id,
    details: { recipients: targetIds.length },
  })

  return jsonSuccess({ shared: targetIds.length })
}
