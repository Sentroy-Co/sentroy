import { Polar } from "@polar-sh/sdk"
import { polarSettingsModel } from "@workspace/db/models"
import type { PolarSettings } from "@workspace/db/types"
import { decryptValue } from "@workspace/console/lib/env-vault-crypto"

/**
 * Polar servis katmanı — credential + client çözümleme.
 *
 * Ayarlar `system_settings` key=`polar` singleton'unda; secret'lar
 * AES-256-GCM şifreli (env-vault-crypto). Sandbox/production tamamen izole:
 * her ortamın kendi token + webhook secret'i var. `activeMode` checkout/portal
 * için hangi ortamın kullanılacağını belirler; webhook ise imzadan kendi
 * ortamını çözer.
 */

export type PolarMode = "sandbox" | "production"

export async function getPolarSettings(): Promise<PolarSettings> {
  return polarSettingsModel.get()
}

function safeDecrypt(cipher: string | null | undefined): string | null {
  if (!cipher) return null
  try {
    return decryptValue(cipher)
  } catch (err) {
    console.error(
      "[polar] secret decrypt failed:",
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

export function getAccessToken(
  settings: PolarSettings,
  mode: PolarMode,
): string | null {
  return safeDecrypt(
    mode === "sandbox"
      ? settings.sandboxAccessTokenCipher
      : settings.productionAccessTokenCipher,
  )
}

export function getWebhookSecret(
  settings: PolarSettings,
  mode: PolarMode,
): string | null {
  return safeDecrypt(
    mode === "sandbox"
      ? settings.sandboxWebhookSecretCipher
      : settings.productionWebhookSecretCipher,
  )
}

/**
 * Verilen (ya da aktif) ortam için Polar client. Token yoksa null —
 * caller "Polar yapılandırılmamış" durumunu ele almalı.
 */
export async function getPolarClient(
  mode?: PolarMode,
): Promise<{ client: Polar; mode: PolarMode } | null> {
  const settings = await getPolarSettings()
  const resolved = mode ?? settings.activeMode
  const accessToken = getAccessToken(settings, resolved)
  if (!accessToken) return null
  return { client: new Polar({ accessToken, server: resolved }), mode: resolved }
}
