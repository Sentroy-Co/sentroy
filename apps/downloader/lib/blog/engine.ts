import type { Locale } from "@/i18n/routing"
import type { Platform } from "@/lib/platform"
import { PLATFORMS } from "@/lib/platform"
import { BANKS, type Bank } from "./banks"
import type { BlogTopic } from "./topics"

/**
 * SEO içerik motoru — "tuzak sayfa" üretici.
 *
 * Her topic (hedef anahtar kelime) için, cümle bankasından (banks/<lang>.ts)
 * deterministik olarak (topic.id + lang ile seed'lenen PRNG) bir makale kurar.
 * Aynı seed → aynı çıktı: SEO için sayfa render'lar arası DEĞİŞMEZ (hydration
 * uyumsuzluğu + crawler tutarlılığı). Farklı topic → farklı seed → farklı
 * cümle kombinasyonu: tuzak sayfalar birbirinin kopyası olmaz (duplicate
 * content cezası yok), ama hepsi aynı şeyi anlatır.
 *
 * `Math.random()` KULLANILMAZ (non-deterministik). Seed'li mulberry32 PRNG.
 */

// ── Seeded PRNG ─────────────────────────────────────────────────────────────
function xfnv1a(str: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Seed'li rastgelelik kaynağı — pick/shuffle yardımcılarıyla birlikte. */
class Rng {
  private next: () => number
  constructor(seed: string) {
    this.next = mulberry32(xfnv1a(seed))
  }
  /** Diziden deterministik bir eleman seç. */
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)] as T
  }
  /** Fisher-Yates — yeni kopya döndürür, orijinali bozmaz. */
  shuffle<T>(arr: readonly T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[a[i], a[j]] = [a[j] as T, a[i] as T]
    }
    return a
  }
  /** Diziden n farklı eleman seç (shuffle + slice). */
  sample<T>(arr: readonly T[], n: number): T[] {
    return this.shuffle(arr).slice(0, Math.min(n, arr.length))
  }
}

// ── Makale modeli ───────────────────────────────────────────────────────────
export interface ArticleSection {
  heading: string
  paragraphs: string[]
  list?: string[]
  steps?: { title: string; body: string }[]
}

export interface Article {
  title: string
  metaTitle: string
  metaDescription: string
  lead: string
  sections: ArticleSection[]
  faq: { q: string; a: string }[]
  cta: { heading: string; body: string; button: string }
}

// ── Placeholder interpolasyon ────────────────────────────────────────────────
function capitalize(s: string, lang: string): string {
  if (!s) return s
  return s.charAt(0).toLocaleUpperCase(lang) + s.slice(1)
}

interface Vars {
  keyword: string
  Keyword: string
  platform: string
  brand: string
  domain: string
}

function fill(tpl: string, v: Vars): string {
  return tpl
    .replaceAll("{Keyword}", v.Keyword)
    .replaceAll("{keyword}", v.keyword)
    .replaceAll("{platform}", v.platform)
    .replaceAll("{brand}", v.brand)
    .replaceAll("{domain}", v.domain)
}

// ── Ana üretici ──────────────────────────────────────────────────────────────
const BRAND = "Sentroy"

export function generateArticle(topic: BlogTopic, lang: Locale): Article | null {
  const loc = topic.locales[lang]
  if (!loc) return null
  // Banka yoksa (henüz çevrilmemiş dil) en'e düş.
  const bank: Bank = BANKS[lang] ?? BANKS.en!
  const platformCfg = PLATFORMS[topic.platform as Platform] ?? PLATFORMS.youtube
  const rng = new Rng(`${topic.id}:${lang}`)

  const vars: Vars = {
    keyword: loc.keyword,
    Keyword: capitalize(loc.keyword, lang),
    platform: platformCfg.label,
    brand: BRAND,
    domain: platformCfg.host,
  }
  const f = (t: string) => fill(t, vars)

  const sections: ArticleSection[] = []

  // 1) Ne / neden
  sections.push({
    heading: f(rng.pick(bank.whatHeadings)),
    paragraphs: rng.sample(bank.whatBodies, 2).map(f),
  })

  // 2) Nasıl (3 adım)
  sections.push({
    heading: f(rng.pick(bank.howHeadings)),
    paragraphs: [f(rng.pick(bank.howIntros))],
    steps: bank.steps.map((s) => ({
      title: f(rng.pick(s.title)),
      body: f(rng.pick(s.body)),
    })),
  })

  // 3) Kalite / formatlar
  sections.push({
    heading: f(rng.pick(bank.qualityHeadings)),
    paragraphs: rng.sample(bank.qualityBodies, 2).map(f),
  })

  // 4) Avantajlar (liste)
  sections.push({
    heading: f(rng.pick(bank.benefitsHeading)),
    paragraphs: [],
    list: rng.sample(bank.benefits, 6).map(f),
  })

  // 5) Güvenlik / yasal
  sections.push({
    heading: f(rng.pick(bank.safetyHeadings)),
    paragraphs: rng.sample(bank.safetyBodies, 2).map(f),
  })

  const faq = rng.sample(bank.faqs, 5).map((qa) => ({
    q: f(qa.q),
    a: f(qa.a),
  }))

  return {
    title: loc.title,
    metaTitle: f(rng.pick(bank.metaTitleSuffix)),
    metaDescription: f(rng.pick(bank.metaDescription)),
    lead: f(rng.pick(bank.leads)),
    sections,
    faq,
    cta: {
      heading: f(rng.pick(bank.ctaHeading)),
      body: f(rng.pick(bank.ctaBody)),
      button: f(rng.pick(bank.ctaButton)),
    },
  }
}
