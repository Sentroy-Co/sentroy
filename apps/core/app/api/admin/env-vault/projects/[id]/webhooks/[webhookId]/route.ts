import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import {
  envWebhookModel,
  envAuditLogModel,
} from "@workspace/db/models"

/**
 *   PATCH  → toggle enabled, edit url/name. Body: { name?, url?, enabled? }
 *   DELETE → kalıcı sil
 */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; webhookId: string }> },
) {
  const auth = await assertAdmin(request)
  if ("error" in auth) return auth.error
  const { id, webhookId } = await params

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

  const updated = await envWebhookModel.update(webhookId, patch)
  if (!updated) return jsonError("webhook not found", 404)

  await envAuditLogModel
    .log({
      action: "webhook.update",
      projectId: id,
      environment: updated.environment,
      actorId: auth.session.user.id,
      actorEmail: auth.session.user.email ?? null,
      meta: { webhookId, patch },
    })
    .catch(() => {})

  const { secretCipher: _drop, ...safe } = updated
  return jsonSuccess(safe)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; webhookId: string }> },
) {
  const auth = await assertAdmin(request)
  if ("error" in auth) return auth.error
  const { id, webhookId } = await params

  const existing = await envWebhookModel.findById(webhookId)
  const ok = await envWebhookModel.remove(webhookId)
  if (!ok) return jsonError("webhook not found", 404)

  await envAuditLogModel
    .log({
      action: "webhook.delete",
      projectId: id,
      environment: existing?.environment ?? null,
      actorId: auth.session.user.id,
      actorEmail: auth.session.user.email ?? null,
      meta: { webhookId, name: existing?.name },
    })
    .catch(() => {})

  return jsonSuccess({ ok: true })
}
