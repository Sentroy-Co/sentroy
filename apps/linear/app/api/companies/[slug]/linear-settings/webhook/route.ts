export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import { isVaultConfigured } from "@workspace/console/lib/env-vault-crypto"
import { linearSettingsModel } from "@workspace/db/models"
import { getLinearContext } from "@/lib/linear/context"
import { deleteWebhook, ensureWebhook } from "@/lib/linear/webhooks"
import { AppError } from "@/lib/errors"

/**
 * Şirketin Linear webhook kaydı (linear.manage).
 *
 * POST  → webhook'u kur/yenile (ensureWebhook: eski kaydı siler, taze secret
 *         üretir; secret cipher olarak linear_settings'e yazılır, response'a
 *         ASLA dönmez).
 * DELETE → Linear'daki webhook'u sil + lokal kaydı temizle.
 */

function errorResponse(err: unknown) {
  if (err instanceof AppError) return jsonError(err.message, err.status)
  return jsonError("Linear webhook operation failed", 502)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "linear.manage")
  if ("error" in access) return access.error

  // Secret'ı şifreleyemeyeceksek Linear'da öksüz webhook yaratmayalım.
  if (!isVaultConfigured()) {
    return jsonError(
      "SENTROY_ENV_MASTER_KEY is not configured — webhook secret cannot be stored",
      503,
    )
  }

  const ctx = await getLinearContext(access.companyId)
  if (!ctx) {
    return jsonError("Linear is not connected", 412)
  }

  try {
    const result = await ensureWebhook(ctx)

    await audit({
      userId: access.callerUserId,
      companyId: access.companyId,
      action: "linear.webhook.register",
      resource: "linear-webhook",
      resourceId: result.webhookId,
      details: { endpoint: result.endpoint, replaced: result.replaced },
      request,
    })

    return jsonSuccess({
      endpoint: result.endpoint,
      webhookId: result.webhookId,
      replaced: result.replaced,
    })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "linear.manage")
  if ("error" in access) return access.error

  const settings = await linearSettingsModel.findByCompany(access.companyId)
  if (!settings || (!settings.webhookId && !settings.webhookSecretCipher)) {
    // Silinecek kayıt yok — idempotent davran.
    return jsonSuccess({ deleted: false })
  }

  try {
    const ctx = await getLinearContext(access.companyId)
    let deleted = false

    if (ctx) {
      const result = await deleteWebhook(ctx)
      deleted = result.deleted
    } else {
      // API key kaldırılmış/çözülemiyor — Linear tarafına erişemeyiz ama
      // lokal webhook kaydını yine de temizleriz (bağlantıyı koparmak esas).
      await linearSettingsModel.upsertByCompany(access.companyId, {
        webhookSecretCipher: null,
        webhookId: null,
      })
    }

    await audit({
      userId: access.callerUserId,
      companyId: access.companyId,
      action: "linear.webhook.delete",
      resource: "linear-webhook",
      resourceId: settings.webhookId ?? undefined,
      details: { deleted },
      request,
    })

    return jsonSuccess({ deleted })
  } catch (err) {
    return errorResponse(err)
  }
}
