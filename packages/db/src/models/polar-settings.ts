import { getDb } from "../client"
import type { PolarSettings } from "../types/polar-settings"

const COLLECTION = "system_settings"
const KEY = "polar"

/**
 * Singleton Polar ayarları — sistem genelinde tek doc (key=`polar`).
 * seo-settings.ts ile aynı patern. Model dumb storage'tır: cipher'ları
 * olduğu gibi tutar; şifreleme/maskeleme route katmanında yapılır.
 */
export const DEFAULT_POLAR_SETTINGS: PolarSettings = {
  enabled: false,
  activeMode: "sandbox",
  sandboxAccessTokenCipher: null,
  sandboxAccessTokenPrefix: null,
  sandboxWebhookSecretCipher: null,
  sandboxWebhookSecretPrefix: null,
  productionAccessTokenCipher: null,
  productionAccessTokenPrefix: null,
  productionWebhookSecretCipher: null,
  productionWebhookSecretPrefix: null,
  updatedAt: new Date(0),
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function get(): Promise<PolarSettings> {
  const c = await col()
  const doc = await c.findOne({ key: KEY })
  if (!doc) return DEFAULT_POLAR_SETTINGS
  const { _id: _ignore, key: _ignore2, ...rest } = doc as Record<string, unknown>
  return { ...DEFAULT_POLAR_SETTINGS, ...(rest as object) } as PolarSettings
}

export async function update(
  patch: Partial<PolarSettings>,
): Promise<PolarSettings> {
  const c = await col()
  await c.updateOne(
    { key: KEY },
    { $set: { ...patch, updatedAt: new Date() } },
    { upsert: true },
  )
  return get()
}

export async function ensureIndexes(): Promise<void> {
  // Singleton — `{ key: "polar" }` ile findOne; ek index gerekmiyor.
}
