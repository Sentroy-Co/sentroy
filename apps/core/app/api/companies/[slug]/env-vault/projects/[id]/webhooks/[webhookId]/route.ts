export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyOwnerOrAdmin } from "@workspace/console/lib/company-access"
import {
  envProjectModel,
  envWebhookModel,
  envAuditLogModel,
} from "@workspace/db/models"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string; webhookId: string }> },
) {
  const { slug, id, webhookId } = await params
  const auth = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in auth) return auth.error

  const project = await envProjectModel.findById(id)
  if (!project || project.companyId !== auth.companyId) {
    return jsonError("project not found", 404)
  }

  let body: { name?: string; url?: string; enabled?: boolean }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const patch: Partial<{ name: string; url: string; enabled: boolean }> = {}
  if (typeof body.name === "string") patch.name = body.name.trim()
  if (typeof body.url === "string") {
    const url = body.url.trim()
    try {
      const u = new URL(url)
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return jsonError("url must be http(s)://")
      }
    } catch {
      return jsonError("url must be a valid URL")
    }
    patch.url = url
  }
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled

  // IDOR guard: webhook bu projeye ait olmalı (update yalnız _id ile çalışır).
  const target = await envWebhookModel.findById(webhookId)
  if (!target || target.projectId !== id) {
    return jsonError("webhook not found", 404)
  }

  const updated = await envWebhookModel.update(webhookId, patch)
  if (!updated) return jsonError("webhook not found", 404)

  await envAuditLogModel
    .log({
      action: "webhook.update",
      projectId: id,
      environment: updated.environment,
      actorId: auth.session!.user.id,
      actorEmail: auth.session!.user.email ?? null,
      meta: { webhookId, patch },
    })
    .catch(() => {})

  const { secretCipher: _drop, ...safe } = updated
  return jsonSuccess(safe)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string; webhookId: string }> },
) {
  const { slug, id, webhookId } = await params
  const auth = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in auth) return auth.error

  const project = await envProjectModel.findById(id)
  if (!project || project.companyId !== auth.companyId) {
    return jsonError("project not found", 404)
  }

  // IDOR guard: webhook bu projeye ait olmalı (remove yalnız _id ile çalışır).
  const existing = await envWebhookModel.findById(webhookId)
  if (!existing || existing.projectId !== id) {
    return jsonError("webhook not found", 404)
  }
  const ok = await envWebhookModel.remove(webhookId)
  if (!ok) return jsonError("webhook not found", 404)

  await envAuditLogModel
    .log({
      action: "webhook.delete",
      projectId: id,
      environment: existing?.environment ?? null,
      actorId: auth.session!.user.id,
      actorEmail: auth.session!.user.email ?? null,
      meta: { webhookId, name: existing?.name },
    })
    .catch(() => {})

  return jsonSuccess({ ok: true })
}
