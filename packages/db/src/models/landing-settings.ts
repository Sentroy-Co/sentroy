import { getDb } from "../client"

const COLLECTION = "system_settings"
const KEY = "landing"

export interface LandingSettings {
  trustMessage: Record<string, string>
  showPricing: boolean
  showTestimonials: boolean
  showLogos: boolean
  showZSections: boolean
  showApps: boolean
  showMetrics: boolean
  sectionOrder: string[]
  pricingTitle: Record<string, string>
  pricingSubtitle: Record<string, string>
  updatedAt?: Date
}

export const DEFAULT_SETTINGS: LandingSettings = {
  trustMessage: {
    en: "Trusted by growing teams",
    tr: "Buyuyen ekipler tarafindan tercih ediliyor",
  },
  showPricing: false,
  showTestimonials: true,
  showLogos: true,
  showZSections: true,
  showApps: true,
  showMetrics: true,
  sectionOrder: [
    "logos",
    "security",
    "apps",
    "features",
    "zsections",
    "metrics",
    "testimonials",
    "pricing",
    "sdk",
    "faq",
    "finalCta",
    "newsletter",
  ],
  pricingTitle: {
    en: "Simple, transparent pricing",
    tr: "Basit ve seffaf fiyatlandirma",
  },
  pricingSubtitle: {
    en: "Start free. Scale when you need to. No hidden fees.",
    tr: "Ucretsiz basla. Ihtiyacin oldugunda olceklendir. Gizli ucret yok.",
  },
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function get(): Promise<LandingSettings> {
  const c = await col()
  const doc = await c.findOne({ key: KEY })
  if (!doc) return DEFAULT_SETTINGS
  const {
    _id: _ignore,
    key: _ignore2,
    ...rest
  } = doc as Record<string, unknown>
  return { ...DEFAULT_SETTINGS, ...(rest as object) } as LandingSettings
}

export async function update(
  patch: Partial<LandingSettings>
): Promise<LandingSettings> {
  const c = await col()
  const now = new Date()
  await c.updateOne(
    { key: KEY },
    { $set: { ...patch, updatedAt: now } },
    { upsert: true }
  )
  return get()
}
