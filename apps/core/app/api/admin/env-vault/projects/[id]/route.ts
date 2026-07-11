export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import {
  envProjectModel,
  envVariableModel,
  envTokenModel,
  envWebhookModel,
  envAuditLogModel,
} from "@workspace/db/models"

/**
 * Tek bir project'e CRUD:
 *   GET    → project + environment listesi (variable count'ları ekstra)
 *   PATCH  → name/description/defaultEnvironment update
 *   DELETE → project + tüm bağlı variable + token cascade
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await assertAdmin(request)
  if ("error" in auth) return auth.error
  const { id } = await params

  const project = await envProjectModel.findById(id)
  if (!project) return jsonError("project not found", 404)

  const environments = await envVariableModel.listEnvironments(id)
  return jsonSuccess({ ...project, environments })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await assertAdmin(request)
  if ("error" in auth) return auth.error
  const { id } = await params

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

  const ok = await envProjectModel.update(id, body)
  if (!ok) return jsonError("project not found", 404)

  await envAuditLogModel.log({
    action: "project.update",
    projectId: id,
    actorId: auth.session.user.id,
    actorEmail: auth.session.user.email ?? null,
    meta: body as Record<string, unknown>,
  })
  return jsonSuccess({ ok: true })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await assertAdmin(request)
  if ("error" in auth) return auth.error
  const { id } = await params

  const project = await envProjectModel.findById(id)
  if (!project) return jsonError("project not found", 404)

  const removedVars = await envVariableModel.removeByProject(id)
  const removedTokens = await envTokenModel.removeByProject(id)
  const removedWebhooks = await envWebhookModel.removeByProject(id)
  await envProjectModel.remove(id)

  await envAuditLogModel.log({
    action: "project.delete",
    projectId: id,
    actorId: auth.session.user.id,
    actorEmail: auth.session.user.email ?? null,
    meta: { slug: project.slug, removedVars, removedTokens, removedWebhooks },
  })

  return jsonSuccess({ ok: true, removedVars, removedTokens, removedWebhooks })
}
