import { getDb } from "../client"

const COLLECTION = "system_settings"
const KEY = "seo"

/**
 * Singleton SEO/analytics ayarları — sistem genelinde tek bir doc.
 * Tüm tracking ID/site verification field'ları nullable; sadece set
 * edilenler runtime'da gerçekten enjekte edilir (analytics script tag,
 * meta head verification). Per-locale default meta (`defaultDescription`,
 * `defaultOgTitle`, `defaultKeywords`) `{ en, tr, ... }` formunda saklanır.
 */
export interface SeoSettings {
  gaId: string | null
  gtmId: string | null
  metaPixelId: string | null
  plausibleDomain: string | null
  hotjarId: string | null
  twitterHandle: string | null
  defaultOgImageUrl: string | null
  defaultDescription: Record<string, string>
  defaultOgTitle: Record<string, string>
  defaultKeywords: Record<string, string[]>
  robotsOverride: string | null
  googleSiteVerification: string | null
  bingSiteVerification: string | null
  updatedAt: Date
}

export const DEFAULT_SEO_SETTINGS: SeoSettings = {
  gaId: null,
  gtmId: null,
  metaPixelId: null,
  plausibleDomain: null,
  hotjarId: null,
  twitterHandle: "sentroy",
  defaultOgImageUrl: null,
  defaultDescription: {
    en: "Sentroy is an open, self-hostable backend platform — transactional email, S3-compatible object storage, auth-as-a-service, and an env vault, all behind one SDK.",
    tr: "Sentroy, kendi sunucunda host edebileceğin açık bir backend platformu — transactional email, S3 uyumlu obje storage, auth-as-a-service ve env vault, hepsi tek SDK arkasında.",
  },
  defaultOgTitle: {
    en: "Sentroy — Mail, storage, auth & secrets in one SDK",
    tr: "Sentroy — Mail, storage, auth ve secret'lar tek SDK'da",
  },
  defaultKeywords: {
    en: [
      "transactional email API",
      "Resend alternative",
      "Firebase alternative",
      "Auth0 alternative",
      "S3 alternative",
      "Doppler alternative",
      "self-hosted backend",
      "all-in-one backend",
    ],
    tr: [
      "transactional email API",
      "Resend alternatifi",
      "Firebase alternatifi",
      "Auth0 alternatifi",
      "S3 alternatifi",
      "Doppler alternatifi",
      "self-hosted backend",
      "all-in-one backend",
    ],
  },
  robotsOverride: null,
  googleSiteVerification: null,
  bingSiteVerification: null,
  updatedAt: new Date(0),
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

// Singleton doc, nadiren değişir; her render'da (özellikle dynamic d/admin
// route'ları) tekrar findOne'lamak soğuk TTFB'ye Mongo roundtrip ekliyordu
// (React cache() yalnız tek request içinde dedup eder). 60sn TTL'li modül-seviyesi
// cache request'ler arası paylaşır; update() invalidate eder.
let _seoCache: { at: number; value: SeoSettings } | null = null
const SEO_CACHE_TTL_MS = 60_000

export async function get(): Promise<SeoSettings> {
  if (_seoCache && Date.now() - _seoCache.at < SEO_CACHE_TTL_MS) return _seoCache.value
  const c = await col()
  const doc = await c.findOne({ key: KEY })
  let value: SeoSettings
  if (!doc) {
    value = DEFAULT_SEO_SETTINGS
  } else {
    const { _id: _ignore, key: _ignore2, ...rest } = doc as Record<string, unknown>
    value = { ...DEFAULT_SEO_SETTINGS, ...(rest as object) } as SeoSettings
  }
  _seoCache = { at: Date.now(), value }
  return value
}

export async function update(
  patch: Partial<SeoSettings>
): Promise<SeoSettings> {
  const c = await col()
  const now = new Date()
  await c.updateOne(
    { key: KEY },
    { $set: { ...patch, updatedAt: now } },
    { upsert: true }
  )
  _seoCache = null // admin güncelledi → cache'i düşür, get() taze okusun
  return get()
}

export async function ensureIndexes(): Promise<void> {
  // Singleton doc — anahtar `{ key: "seo" }` ile findOne; ek index gerekmiyor.
}
