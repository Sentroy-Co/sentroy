import { getRequestConfig } from "next-intl/server"
import { routing } from "@workspace/auth/i18n/routing"

import enConsole from "@workspace/console/messages/en/console.json"
import trConsole from "@workspace/console/messages/tr/console.json"
import enAuth from "@workspace/auth/messages/en/auth.json"
import trAuth from "@workspace/auth/messages/tr/auth.json"
import enMain from "../messages/en/main.json"
import trMain from "../messages/tr/main.json"

const bundles = {
  en: { ...enConsole, ...enAuth, ...enMain },
  tr: { ...trConsole, ...trAuth, ...trMain },
} as const

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale
  if (!locale || !routing.locales.includes(locale as "en" | "tr")) {
    locale = routing.defaultLocale
  }
  return {
    locale,
    messages: bundles[locale as "en" | "tr"],
  }
})
