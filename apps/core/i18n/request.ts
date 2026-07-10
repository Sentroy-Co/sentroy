import { getRequestConfig } from "next-intl/server"
import { routing } from "@workspace/auth/i18n/routing"

// Static imports — Next.js standalone output runtime'da dynamic
// `import("@workspace/.../{locale}.json")` çağrılarını çözmekte sorun
// yaşıyor (turbopack tracer workspace alias'ları takip etmiyor). Statik
// import'larda dosyalar bundle'a doğrudan dahil olur, runtime resolution
// gerekmez.
import enConsole from "@workspace/console/messages/en/console.json"
import trConsole from "@workspace/console/messages/tr/console.json"
import enAuth from "@workspace/auth/messages/en/auth.json"
import trAuth from "@workspace/auth/messages/tr/auth.json"
import enMain from "../messages/en/main.json"
import trMain from "../messages/tr/main.json"
import enLanding from "../messages/en/landing.json"
import trLanding from "../messages/tr/landing.json"
import enLandingV2 from "../messages/en/landing-v2.json"
import trLandingV2 from "../messages/tr/landing-v2.json"
import enBilling from "../messages/en/billing.json"
import trBilling from "../messages/tr/billing.json"
import enPricing from "../messages/en/pricing.json"
import trPricing from "../messages/tr/pricing.json"
import enOs from "../messages/en/os.json"
import trOs from "../messages/tr/os.json"
import enInvestors from "../messages/en/investors.json"
import trInvestors from "../messages/tr/investors.json"
import enContact from "../messages/en/contact.json"
import trContact from "../messages/tr/contact.json"
import enBrand from "../messages/en/brand.json"
import trBrand from "../messages/tr/brand.json"
import enVision from "../messages/en/vision.json"
import trVision from "../messages/tr/vision.json"

const bundles = {
  en: {
    ...enConsole,
    ...enAuth,
    ...enMain,
    landing: enLanding,
    landingV2: enLandingV2,
    billing: enBilling,
    pricing: enPricing,
    os: enOs,
    investors: enInvestors,
    contact: enContact,
    brand: enBrand,
    vision: enVision,
  },
  tr: {
    ...trConsole,
    ...trAuth,
    ...trMain,
    landing: trLanding,
    landingV2: trLandingV2,
    billing: trBilling,
    pricing: trPricing,
    os: trOs,
    investors: trInvestors,
    contact: trContact,
    brand: trBrand,
    vision: trVision,
  },
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
