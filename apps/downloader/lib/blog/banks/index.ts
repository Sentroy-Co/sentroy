import type { Locale } from "@/i18n/routing"
import { en } from "./en"
import { tr } from "./tr"
import { es } from "./es"
import { pt } from "./pt"
import { de } from "./de"
import { fr } from "./fr"
import { ru } from "./ru"
import { ar } from "./ar"
import { hi } from "./hi"
import { id } from "./id"

/**
 * Cümle bankası — SEO makale motorunun ham içerik kaynağı (banks/<lang>.ts).
 *
 * Her alan, aynı şeyi farklı şekilde söyleyen ALTERNATİF cümleler havuzudur;
 * motor bunlardan deterministik olarak seçip karıştırır. Placeholder'lar:
 *   {keyword}  → hedef anahtar kelime (örn. "youtube video indir")
 *   {Keyword}  → baş harfi büyük hâli
 *   {platform} → "YouTube" / "Instagram" / "SoundCloud"
 *   {brand}    → "Sentroy"
 *   {domain}   → "youtube.sentroy.com"
 *
 * Türkçe (tr) + İngilizce (en) elle yazıldı. Diğer 8 dil çeviri workflow'u ile
 * eklenir; eklenene kadar motor en'e düşer (engine.ts BANKS[lang] ?? BANKS.en).
 */
export interface Bank {
  /** Giriş paragrafı (lead) alternatifleri. */
  leads: string[]
  whatHeadings: string[]
  whatBodies: string[]
  howHeadings: string[]
  howIntros: string[]
  /** 3 adım — her adımın başlık + gövde alternatif havuzu. */
  steps: { title: string[]; body: string[] }[]
  qualityHeadings: string[]
  qualityBodies: string[]
  benefitsHeading: string[]
  /** Madde listesi havuzu — karıştırılıp 6 tanesi seçilir. */
  benefits: string[]
  safetyHeadings: string[]
  safetyBodies: string[]
  faqs: { q: string; a: string }[]
  ctaHeading: string[]
  ctaBody: string[]
  ctaButton: string[]
  /** Meta title kalıpları (genelde "{Keyword} | ..."). */
  metaTitleSuffix: string[]
  metaDescription: string[]
}

export const BANKS: Partial<Record<Locale, Bank>> = {
  en,
  tr,
  es,
  pt,
  de,
  fr,
  ru,
  ar,
  hi,
  id,
}
