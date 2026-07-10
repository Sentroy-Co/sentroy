import { getRequestConfig } from "next-intl/server"
import { routing, type Locale } from "./routing"

/**
 * Downloader next-intl request config — 10 dil. Her dil kendi
 * messages/<lang>.json'undan beslenir. Eksik anahtarlarda `en`'e düşülür
 * (çeviri tamamlanana kadar İngilizce fallback; SEO hreflang yapısı hazır).
 */
async function load(locale: string): Promise<Record<string, unknown>> {
  try {
    return (await import(`../messages/${locale}.json`)).default
  } catch {
    return (await import(`../messages/en.json`)).default
  }
}

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale
  if (!locale || !(routing.locales as readonly string[]).includes(locale)) {
    locale = routing.defaultLocale
  }
  const en = await load("en")
  const messages =
    locale === "en" ? en : { ...en, ...(await load(locale)) }
  return {
    locale: locale as Locale,
    messages,
  }
})
