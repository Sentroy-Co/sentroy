import { getRequestConfig } from "next-intl/server"

/**
 * Studio app — next-intl request config. Console namespace + studio-specific
 * messages. auth2/status pattern'iyle aynı — static imports (turbopack tracer
 * dynamic import'larda workspace alias'larını çözmüyor).
 */

import enConsole from "@workspace/console/messages/en/console.json"
import trConsole from "@workspace/console/messages/tr/console.json"

const SUPPORTED = ["en", "tr"] as const
type Locale = (typeof SUPPORTED)[number]

const bundles: Record<Locale, Record<string, unknown>> = {
  en: enConsole as Record<string, unknown>,
  tr: trConsole as Record<string, unknown>,
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
