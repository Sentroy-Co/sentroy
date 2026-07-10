import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyOwnerOrAdmin } from "@workspace/console/lib/company-access"
import {
  envProjectModel,
  envVariableModel,
  envTokenModel,
  envWebhookModel,
  envAuditLogModel,
} from "@workspace/db/models"

/**
 * Tek bir company-scoped project'e CRUD. Project'in companyId'si
 * caller'ın access ettiği şirketle eşleşmek zorunda — başka şirketin
 * proje id'sini geçen istek 404 alır.
 */

async function loadOwnedProject(projectId: string, companyId: string) {
  const project = await envProjectModel.findById(projectId)
  if (!project || project.companyId !== companyId) return null
  return project
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const auth = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in auth) return auth.error

  const project = await loadOwnedProject(id, auth.companyId!)
  if (!project) return jsonError("project not found", 404)

  const environments = await envVariableModel.listEnvironments(id)
  return jsonSuccess({ ...project, environments })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const auth = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in auth) return auth.error

  const project = await loadOwnedProject(id, auth.companyId!)
  if (!project) return jsonError("project not found", 404)

  let body: {
    name?: string
    description?: string | null
    defaultEnvironment?: string
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  await envProjectModel.update(id, body)
  await envAuditLogModel.log({
    action: "project.update",
    projectId: id,
    actorId: auth.session!.user.id,
    actorEmail: auth.session!.user.email ?? null,
    meta: body as Record<string, unknown>,
  })
  return jsonSuccess({ ok: true })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const auth = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in auth) return auth.error

  const project = await loadOwnedProject(id, auth.companyId!)
  if (!project) return jsonError("project not found", 404)

  const removedVars = await envVariableModel.removeByProject(id)
  const removedTokens = await envTokenModel.removeByProject(id)
  const removedWebhooks = await envWebhookModel.removeByProject(id)
  await envProjectModel.remove(id)

  await envAuditLogModel.log({
    action: "project.delete",
    projectId: id,
    actorId: auth.session!.user.id,
    actorEmail: auth.session!.user.email ?? null,
    meta: { slug: project.slug, removedVars, removedTokens, removedWebhooks },
  })

  return jsonSuccess({ ok: true, removedVars, removedTokens, removedWebhooks })
}
