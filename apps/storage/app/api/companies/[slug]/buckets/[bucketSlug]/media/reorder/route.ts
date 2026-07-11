export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { bucketModel, mediaModel } from "@workspace/db/models"

/**
 * Bucket içindeki dosya sıralamasını günceller. UI tarafında dnd-kit ile
 * drag-drop yapan kullanıcı, bucket'taki tüm media id'lerini yeni sırayla
 * gönderir. `mediaModel.reorderInBucket` her id'ye 0..N-1 displayOrder
 * yazar; payload dışı kayıtlar (filter/pagination ile gizlenmiş olabilir)
 * dokunulmaz.
 *
 * Permission: `media.reorder`.
 */
export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ slug: string; bucketSlug: string }>
  },
) {
  const { slug, bucketSlug } = await params
  const access = await resolveCompanyAccess(request, slug, "media.reorder")
  if ("error" in access) return access.error

  const bucket = await bucketModel.findUserVisibleBySlug(access.companyId, bucketSlug)
  if (!bucket) return jsonError("Bucket not found", 404)

  let body: { ids?: string[] }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return jsonError("ids array required (non-empty)")
  }
  if (body.ids.some((id) => typeof id !== "string" || !id)) {
    return jsonError("ids must be non-empty strings")
  }

  const modified = await mediaModel.reorderInBucket(bucket.id, body.ids)
  return jsonSuccess({ modified, total: body.ids.length })
}
