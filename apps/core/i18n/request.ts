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
import ruConsole from "@workspace/console/messages/ru/console.json"
import ruAuth from "@workspace/auth/messages/ru/auth.json"
import ruMain from "../messages/ru/main.json"
import ruLanding from "../messages/ru/landing.json"
import ruLandingV2 from "../messages/ru/landing-v2.json"
import ruBilling from "../messages/ru/billing.json"
import ruPricing from "../messages/ru/pricing.json"
import ruOs from "../messages/ru/os.json"
import ruInvestors from "../messages/ru/investors.json"
import ruContact from "../messages/ru/contact.json"
import ruBrand from "../messages/ru/brand.json"
import ruVision from "../messages/ru/vision.json"
import zhConsole from "@workspace/console/messages/zh/console.json"
import zhAuth from "@workspace/auth/messages/zh/auth.json"
import zhMain from "../messages/zh/main.json"
import zhLanding from "../messages/zh/landing.json"
import zhLandingV2 from "../messages/zh/landing-v2.json"
import zhBilling from "../messages/zh/billing.json"
import zhPricing from "../messages/zh/pricing.json"
import zhOs from "../messages/zh/os.json"
import zhInvestors from "../messages/zh/investors.json"
import zhContact from "../messages/zh/contact.json"
import zhBrand from "../messages/zh/brand.json"
import zhVision from "../messages/zh/vision.json"
import esConsole from "@workspace/console/messages/es/console.json"
import esAuth from "@workspace/auth/messages/es/auth.json"
import esMain from "../messages/es/main.json"
import esLanding from "../messages/es/landing.json"
import esLandingV2 from "../messages/es/landing-v2.json"
import esBilling from "../messages/es/billing.json"
import esPricing from "../messages/es/pricing.json"
import esOs from "../messages/es/os.json"
import esInvestors from "../messages/es/investors.json"
import esContact from "../messages/es/contact.json"
import esBrand from "../messages/es/brand.json"
import esVision from "../messages/es/vision.json"

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
  ru: {
    ...ruConsole,
    ...ruAuth,
    ...ruMain,
    landing: ruLanding,
    landingV2: ruLandingV2,
    billing: ruBilling,
    pricing: ruPricing,
    os: ruOs,
    investors: ruInvestors,
    contact: ruContact,
    brand: ruBrand,
    vision: ruVision,
  },
  zh: {
    ...zhConsole,
    ...zhAuth,
    ...zhMain,
    landing: zhLanding,
    landingV2: zhLandingV2,
    billing: zhBilling,
    pricing: zhPricing,
    os: zhOs,
    investors: zhInvestors,
    contact: zhContact,
    brand: zhBrand,
    vision: zhVision,
  },
  es: {
    ...esConsole,
    ...esAuth,
    ...esMain,
    landing: esLanding,
    landingV2: esLandingV2,
    billing: esBilling,
    pricing: esPricing,
    os: esOs,
    investors: esInvestors,
    contact: esContact,
    brand: esBrand,
    vision: esVision,
  },
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
