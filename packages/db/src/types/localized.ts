/**
 * Localized text shape — { tr, en, ... }. Public-facing RP-girilen tüm
 * metinler bu shape'te saklanır (incident title/body, maintenance
 * title/description, branding tagline gibi).
 *
 * Read-time'da `normalizeLocalized` mevcut `string` kayıtları sarmalar
 * (geriye uyumluluk için).
 *
 * Render-time'da `pickLocalized(value, lang)` istenen locale'i seçer;
 * yoksa fallback chain.
 */

export type LocalizedText = Record<string, string>

const DEFAULT_LOCALES = ["tr", "en"] as const

/**
 * Veriyi LocalizedText shape'ine normalize et.
 * - `string` ise her locale'a aynı value (eski single-string kayıtlar)
 * - object ise olduğu gibi döner (LocalizedText kabul edilir)
 * - null/undefined ise boş object
 */
export function normalizeLocalized(
  value: unknown,
  locales: readonly string[] = DEFAULT_LOCALES,
): LocalizedText {
  if (typeof value === "string") {
    const out: LocalizedText = {}
    for (const lang of locales) out[lang] = value
    return out
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as LocalizedText
  }
  return { tr: "", en: "" }
}

/**
 * Render-time'da istenen locale'i seç. Yoksa fallback ("en" → ilk dolu
 * value → boş string).
 */
export function pickLocalized(
  value: LocalizedText | string | null | undefined,
  lang: string,
  fallback = "en",
): string {
  if (!value) return ""
  if (typeof value === "string") return value
  if (value[lang]) return value[lang]
  if (value[fallback]) return value[fallback]
  const firstNonEmpty = Object.values(value).find((v) => typeof v === "string" && v.length > 0)
  return firstNonEmpty ?? ""
}

/**
 * Localized text doğrulama — en az bir locale'da içerik var mı?
 */
export function hasAnyLocalizedContent(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.values(value as Record<string, unknown>).some(
      (v) => typeof v === "string" && v.trim().length > 0,
    )
  }
  return false
}

/**
 * Input sanitize — UI'dan gelen kullanıcı girdisini { tr, en, ... } shape
 * dışında reddetme; yabancı key'leri (örn. "fr") koru ama trim et + non-string
 * value'ları drop et.
 */
export function sanitizeLocalizedInput(input: unknown): LocalizedText {
  if (typeof input === "string") {
    return normalizeLocalized(input)
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { tr: "", en: "" }
  }
  const out: LocalizedText = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = value.trim()
  }
  // En az iki default locale key'i bulunsun (boş bile olsa) — UI'da daima render
  for (const lang of DEFAULT_LOCALES) {
    if (out[lang] === undefined) out[lang] = ""
  }
  return out
}
