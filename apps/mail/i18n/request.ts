import { getRequestConfig } from "next-intl/server"
import { routing } from "@workspace/auth/i18n/routing"

// Static imports — bkz. core/i18n/request.ts
import enConsole from "@workspace/console/messages/en/console.json"
import trConsole from "@workspace/console/messages/tr/console.json"
import enAuth from "@workspace/auth/messages/en/auth.json"
import trAuth from "@workspace/auth/messages/tr/auth.json"
import enMain from "../messages/en/main.json"
import trMain from "../messages/tr/main.json"
import ruConsole from "@workspace/console/messages/ru/console.json"
import ruAuth from "@workspace/auth/messages/ru/auth.json"
import ruMain from "../messages/ru/main.json"
import zhConsole from "@workspace/console/messages/zh/console.json"
import zhAuth from "@workspace/auth/messages/zh/auth.json"
import zhMain from "../messages/zh/main.json"
import esConsole from "@workspace/console/messages/es/console.json"
import esAuth from "@workspace/auth/messages/es/auth.json"
import esMain from "../messages/es/main.json"

const bundles = {
  en: { ...enConsole, ...enAuth, ...enMain },
  tr: { ...trConsole, ...trAuth, ...trMain },
  ru: { ...ruConsole, ...ruAuth, ...ruMain },
  zh: { ...zhConsole, ...zhAuth, ...zhMain },
  es: { ...esConsole, ...esAuth, ...esMain },
} as const

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale
  if (!locale || !routing.locales.includes(locale as keyof typeof bundles)) {
    locale = routing.defaultLocale
  }
  return {
    locale,
    messages: bundles[locale as keyof typeof bundles],
  }
})
