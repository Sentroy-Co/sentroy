export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { inboxBlockModel } from "@workspace/db/models"

/**
 * DELETE /api/companies/[slug]/inbox-blocks/[id]
 * Block kaydını siler. id parametresi inbox_blocks koleksiyonunun
 * doc id'si. Permission: `inbox.view`.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const access = await resolveCompanyAccess(request, slug, "inbox.view")
  if ("error" in access) return access.error

  // IDOR guard: companyId'ye scope'lu silme — başka company'nin block'u
  // _id tahminiyle silinemez.
  const ok = await inboxBlockModel.unblock(id, access.companyId)
  if (!ok) return jsonError("Block not found", 404)
  return jsonSuccess({ removed: true })
}
