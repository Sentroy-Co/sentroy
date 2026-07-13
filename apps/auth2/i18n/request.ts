import { getRequestConfig } from "next-intl/server"

/**
 * auth2 next-intl request config — dashboard shell + AppLauncher gibi
 * paylaşılan client component'lerin `useTranslations()` çağrılarını
 * besler. apps/core'un i18n/request.ts pattern'i ile aynı, ama
 * yalnızca console namespace'i (auth2'nin landing/consent ekranları
 * lib/i18n.ts lightweight `t()` ile devam eder — comment orada).
 *
 * Static imports — Next.js standalone output runtime'da dynamic
 * `import("@workspace/.../{locale}.json")` çağrılarını çözmekte sorun
 * yaşıyor (turbopack tracer workspace alias'larını takip etmiyor).
 */

import enConsole from "@workspace/console/messages/en/console.json"
import trConsole from "@workspace/console/messages/tr/console.json"
import ruConsole from "@workspace/console/messages/ru/console.json"
import zhConsole from "@workspace/console/messages/zh/console.json"
import esConsole from "@workspace/console/messages/es/console.json"

const SUPPORTED = ["en", "tr", "ru", "zh", "es"] as const
type Locale = (typeof SUPPORTED)[number]

const bundles: Record<Locale, Record<string, unknown>> = {
  en: enConsole as Record<string, unknown>,
  tr: trConsole as Record<string, unknown>,
  ru: ruConsole as Record<string, unknown>,
  zh: zhConsole as Record<string, unknown>,
  es: esConsole as Record<string, unknown>,
}

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale
  if (!locale || !(SUPPORTED as readonly string[]).includes(locale)) {
    locale = "en"
  }
  return {
    locale,
    messages: bundles[locale as Locale],
  }
})
