import { routing } from "@workspace/auth/i18n/routing"

const SITE_URL = "https://sentroy.com"

/**
 * Self-referential canonical + per-path hreflang, STATIK route param'lardan
 * türetilir (request header'a bağımlı DEĞİL). Bu sayede sayfa static prerender
 * edilebilir kalır (edge/CDN cache). `subPath` = locale-içi yol (örn "/investors";
 * home için ""). Her sayfa kendi generateMetadata'sında bunu çağırır → canonical
 * kendine işaret eder; layout'un tek sabit canonical'ı tüm sayfalara miras kalmaz.
 *
 * ⚠ `headers()` KULLANMA — Dynamic API tüm route'u static-dışı yapar (landing TTFB
 * regresyonu). subPath'i route'un kendi `params`'ından/sabit yolundan ver.
 */
export function localizedAlternates(lang: string, subPath = "") {
  const clean = subPath ? "/" + subPath.replace(/^\/+|\/+$/g, "") : ""
  return {
    canonical: `${SITE_URL}/${lang}${clean}`,
    languages: {
      en: `${SITE_URL}/en${clean}`,
      tr: `${SITE_URL}/tr${clean}`,
      // x-default = varsayılan locale'in aynı sayfası (Google onaylı).
      "x-default": `${SITE_URL}/${routing.defaultLocale}${clean}`,
    },
  }
}

export const seoSiteUrl = SITE_URL
