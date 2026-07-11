export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import { audit } from "@workspace/console/lib/audit"
import {
  encryptValue,
  isVaultConfigured,
} from "@workspace/console/lib/env-vault-crypto"
import { polarSettingsModel } from "@workspace/db/models"

/**
 * GET /api/admin/polar — Polar ayarları (plaintext/cipher ASLA dönmez,
 * yalnız enabled/mode + secret prefix'leri).
 */
export async function GET(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  const s = await polarSettingsModel.get()
  return jsonSuccess({
    enabled: s.enabled,
    activeMode: s.activeMode,
    sandboxAccessTokenPrefix: s.sandboxAccessTokenPrefix,
    sandboxWebhookSecretPrefix: s.sandboxWebhookSecretPrefix,
    productionAccessTokenPrefix: s.productionAccessTokenPrefix,
    productionWebhookSecretPrefix: s.productionWebhookSecretPrefix,
    vaultConfigured: isVaultConfigured(),
  })
}

const SECRET_FIELDS = [
  ["sandboxAccessToken", "sandboxAccessTokenCipher", "sandboxAccessTokenPrefix"],
  ["sandboxWebhookSecret", "sandboxWebhookSecretCipher", "sandboxWebhookSecretPrefix"],
  ["productionAccessToken", "productionAccessTokenCipher", "productionAccessTokenPrefix"],
  ["productionWebhookSecret", "productionWebhookSecretCipher", "productionWebhookSecretPrefix"],
] as const

/**
 * PATCH /api/admin/polar — ayarları güncelle. Secret alanları (plaintext)
 * gönderilirse AES-256-GCM ile şifrelenip cipher+prefix saklanır; boş
 * string/null → temizlenir; gönderilmezse dokunulmaz.
 */
export async function PATCH(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (
    !isVaultConfigured() &&
    SECRET_FIELDS.some(([k]) => typeof body[k] === "string" && (body[k] as string).trim())
  ) {
    return jsonError(
      "SENTROY_ENV_MASTER_KEY is not configured — secrets cannot be encrypted",
      400,
    )
  }

  const patch: Record<string, unknown> = {}
  const changed: string[] = []

  if (typeof body.enabled === "boolean") {
    patch.enabled = body.enabled
    changed.push("enabled")
  }
  if (body.activeMode === "sandbox" || body.activeMode === "production") {
    patch.activeMode = body.activeMode
    changed.push("activeMode")
  }

  for (const [inputKey, cipherKey, prefixKey] of SECRET_FIELDS) {
    if (!(inputKey in body)) continue
    const raw = body[inputKey]
    if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
      patch[cipherKey] = null
      patch[prefixKey] = null
      changed.push(inputKey)
    } else if (typeof raw === "string") {
      const val = raw.trim()
      patch[cipherKey] = encryptValue(val)
      patch[prefixKey] = val.slice(0, 12)
      changed.push(inputKey)
    }
  }

  if (changed.length === 0) {
    return jsonError("Nothing to update")
  }

  await polarSettingsModel.update(
    patch as Parameters<typeof polarSettingsModel.update>[0],
  )

  await audit({
    userId: access.session.user.id,
    action: "polar.settings.update",
    resource: "polar-settings",
    details: { changed },
    request,
  }).catch(() => {})

  // Güncel (plaintext'siz) görünümü dön.
  const s = await polarSettingsModel.get()
  return jsonSuccess({
    enabled: s.enabled,
    activeMode: s.activeMode,
    sandboxAccessTokenPrefix: s.sandboxAccessTokenPrefix,
    sandboxWebhookSecretPrefix: s.sandboxWebhookSecretPrefix,
    productionAccessTokenPrefix: s.productionAccessTokenPrefix,
    productionWebhookSecretPrefix: s.productionWebhookSecretPrefix,
    vaultConfigured: isVaultConfigured(),
  })
}
