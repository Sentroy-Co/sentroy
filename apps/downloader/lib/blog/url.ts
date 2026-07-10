import { routing, type Locale } from "@/i18n/routing"

/**
 * Blog URL üretimi — as-needed locale prefix farkındalığıyla.
 * en (default) prefix'siz: `/<slug>`; diğerleri `/<lang>/<slug>`.
 */
export function blogPath(lang: Locale, slug: string): string {
  return lang === routing.defaultLocale ? `/${slug}` : `/${lang}/${slug}`
}

export function blogUrl(base: string, lang: Locale, slug: string): string {
  return `${base.replace(/\/+$/, "")}${blogPath(lang, slug)}`
}

/** Blog index yolu (statik "blog" segment'i). */
export function blogIndexPath(lang: Locale): string {
  return lang === routing.defaultLocale ? `/blog` : `/${lang}/blog`
}
