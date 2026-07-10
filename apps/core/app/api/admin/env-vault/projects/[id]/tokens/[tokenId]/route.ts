import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import {
  envTokenModel,
  envAuditLogModel,
} from "@workspace/db/models"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tokenId: string }> },
) {
  const auth = await assertAdmin(request)
  if ("error" in auth) return auth.error
  const { id, tokenId } = await params

  const ok = await envTokenModel.remove(tokenId)
  if (!ok) return jsonError("token not found", 404)

  await envAuditLogModel.log({
    action: "token.delete",
    projectId: id,
    actorId: auth.session.user.id,
    actorEmail: auth.session.user.email ?? null,
    meta: { tokenId },
  })

  return jsonSuccess({ ok: true })
}
