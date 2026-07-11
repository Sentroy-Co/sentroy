export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import {
  envProjectModel,
  envWebhookModel,
  envAuditLogModel,
} from "@workspace/db/models"
import { encryptValue } from "@workspace/console/lib/env-vault-crypto"

/**
 * Bir project'in webhook'ları.
 *   GET  → liste (secretCipher YOK; sadece prefix + meta + delivery stats)
 *   POST → yeni webhook. Body: { name, environment, url, enabled? }
 *          Plaintext secret tek seferlik response'ta döner — UI
 *          kullanıcıya kopyala-bir-daha-göremezsin uyarısı verir.
 */

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

function safeShape(w: Awaited<ReturnType<typeof envWebhookModel.findById>>) {
  if (!w) return null
  const { secretCipher: _drop, ...rest } = w
  return rest
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await assertAdmin(request)
  if ("error" in auth) return auth.error
  const { id } = await params

  const webhooks = await envWebhookModel.findByProject(id)
  return jsonSuccess(webhooks.map((w) => safeShape(w)))
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await assertAdmin(request)
  if ("error" in auth) return auth.error
  const { id } = await params

  let body: {
    name?: string
    environment?: string
    url?: string
    enabled?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const name = (body.name ?? "").trim()
  const environment = (body.environment ?? "").trim()
  const url = (body.url ?? "").trim()
  if (!name) return jsonError("name required")
  if (!environment) return jsonError("environment required")
  if (!url) return jsonError("url required")
  if (!isHttpUrl(url)) return jsonError("url must be http(s)://")

  const project = await envProjectModel.findById(id)
  if (!project) return jsonError("project not found", 404)

  const plainSecret = envWebhookModel.generatePlaintextSecret()
  let encryptedSecret: string
  try {
    encryptedSecret = encryptValue(plainSecret)
  } catch (err) {
    return jsonError(
      `failed to encrypt webhook secret: ${err instanceof Error ? err.message : String(err)}`,
      500,
    )
  }

  const { webhook } = await envWebhookModel.create({
    projectId: id,
    environment,
    name,
    url,
    encryptedSecret,
    secretPrefix: plainSecret.slice(0, 13), // "whsec_" + 7 hex
    enabled: body.enabled !== false,
    createdBy: auth.session.user.id,
  })

  await envAuditLogModel
    .log({
      action: "webhook.create",
      projectId: id,
      environment,
      actorId: auth.session.user.id,
      actorEmail: auth.session.user.email ?? null,
      meta: { webhookId: webhook.id, name: webhook.name, url: webhook.url },
    })
    .catch(() => {})

  return jsonSuccess({ ...safeShape(webhook), plainSecret }, 201)
}
