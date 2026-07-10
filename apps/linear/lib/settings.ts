/**
 * Şirket bazlı Linear Lite ayar çözümleyicileri (server-only kullanım).
 *
 * Triage'daki env + SQLite karışımı burada DB-only'ye indirgendi: her şey
 * `linear_settings` koleksiyonundan (bkz. packages/db/src/models/linear-settings.ts)
 * gelir, env fallback YOK — tenant başına config.
 *
 * Secret'lar AES-256-GCM ile şifreli saklanır (env-vault-crypto, master key
 * `SENTROY_ENV_MASTER_KEY`). Plaintext ASLA response'a/log'a yazılmaz.
 */

import { linearSettingsModel } from "@workspace/db/models"
import type { LinearSettings } from "@workspace/db/models/linear-settings"
import {
  decryptValue,
  isVaultConfigured,
} from "@workspace/console/lib/env-vault-crypto"
import { DEFAULT_UI_FLAGS, UI_FLAG_KEYS, type UiFlags } from "./ui-flags"

export type { LinearSettings }

/**
 * Cipher'ı decrypt etmeyi dener; master key yoksa/bozuksa/format eskiyse
 * null döner — endpoint'ler "not connected" gibi davranır, 500 fırlatmaz.
 */
export function safeDecrypt(cipher: string | null | undefined): string | null {
  if (!cipher) return null
  if (!isVaultConfigured()) return null
  try {
    return decryptValue(cipher)
  } catch {
    return null
  }
}

/** Şirketin linear_settings dokümanı (yoksa null). */
export async function getLinearSettings(
  companyId: string,
): Promise<LinearSettings | null> {
  return linearSettingsModel.findByCompany(companyId)
}

/** Decrypt edilmiş Linear API key (bağlı değilse/çözülemezse null). */
export async function getDecryptedApiKey(
  companyId: string,
): Promise<string | null> {
  const settings = await getLinearSettings(companyId)
  return safeDecrypt(settings?.apiKeyCipher)
}

/** Decrypt edilmiş webhook secret'ı (kayıtlı değilse null). */
export async function getDecryptedWebhookSecret(
  companyId: string,
): Promise<string | null> {
  const settings = await getLinearSettings(companyId)
  return safeDecrypt(settings?.webhookSecretCipher)
}

/**
 * UI flag çözümlemesi: default hepsi `true`, doküman'daki kısmi override
 * (yalnız bilinen anahtarlar) üstüne yazılır.
 */
export function resolveUiFlags(
  overrides?: Record<string, boolean> | null,
): UiFlags {
  const flags: UiFlags = { ...DEFAULT_UI_FLAGS }
  if (overrides) {
    for (const key of UI_FLAG_KEYS) {
      const value = overrides[key]
      if (typeof value === "boolean") flags[key] = value
    }
  }
  return flags
}

/** Şirket için çözülmüş UI flag seti (settings dokümanını kendisi okur). */
export async function getUiFlagsForCompany(companyId: string): Promise<UiFlags> {
  const settings = await getLinearSettings(companyId)
  return resolveUiFlags(settings?.uiFlags)
}
