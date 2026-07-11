export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import { userPasskeyModel, auditLogModel } from "@workspace/db/models"

/** DELETE /api/passkey/:id — sadece sahibi silebilir. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  const { id } = await params
  const ok = await userPasskeyModel.deleteByIdForUser(session.user.id, id)
  if (!ok) return jsonError("Passkey not found", 404)
  await auditLogModel
    .insert({
      userId: session.user.id,
      action: "passkey.delete",
      resource: "passkey",
      resourceId: id,
      details: {},
    })
    .catch(() => {})
  return jsonSuccess({ deleted: true })
}
