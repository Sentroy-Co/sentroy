import { getRequestConfig } from "next-intl/server"

/**
 * apps/status next-intl request config — admin dashboard ve paylaşılan
 * client component'lerin `useTranslations()` çağrılarını besler.
 * apps/auth2/i18n/request.ts ile aynı pattern.
 *
 * Public status page (`/`) statik English içerik; namespace yine de
 * yüklensin diye provider tüm tree'yi sarmalı (auth2 ile aynı reasoning).
 */

import enConsole from "@workspace/console/messages/en/console.json"
import trConsole from "@workspace/console/messages/tr/console.json"
import enMain from "../messages/en/main.json"
import trMain from "../messages/tr/main.json"

const SUPPORTED = ["en", "tr"] as const
type Locale = (typeof SUPPORTED)[number]

const bundles: Record<Locale, Record<string, unknown>> = {
  en: { ...enConsole, ...enMain } as Record<string, unknown>,
  tr: { ...trConsole, ...trMain } as Record<string, unknown>,
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
