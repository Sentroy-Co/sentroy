import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyOwnerOrAdmin } from "@workspace/console/lib/company-access"
import {
  envProjectModel,
  envTokenModel,
  envAuditLogModel,
} from "@workspace/db/models"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string; tokenId: string }> },
) {
  const { slug, id, tokenId } = await params
  const auth = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in auth) return auth.error

  const project = await envProjectModel.findById(id)
  if (!project || project.companyId !== auth.companyId) {
    return jsonError("project not found", 404)
  }

  // IDOR guard: token bu projeye ait olmalı — envTokenModel.remove yalnız
  // _id ile siler, projeye scope etmez (başka projenin/company'nin token'ı).
  const projectTokens = await envTokenModel.findByProject(id)
  if (!projectTokens.some((tok) => tok.id === tokenId)) {
    return jsonError("token not found", 404)
  }

  const ok = await envTokenModel.remove(tokenId)
  if (!ok) return jsonError("token not found", 404)

  await envAuditLogModel.log({
    action: "token.delete",
    projectId: id,
    actorId: auth.session!.user.id,
    actorEmail: auth.session!.user.email ?? null,
    meta: { tokenId },
  })

  return jsonSuccess({ ok: true })
}
