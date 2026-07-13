import { defineRouting } from "next-intl/routing"
import { createNavigation } from "next-intl/navigation"

/**
 * Downloader'a ÖZEL i18n routing — 10 dil, SEO erişimi için.
 * `localePrefix: "as-needed"` → default `en` prefix'siz servisedilir, böylece
 * `youtube.sentroy.com/watch?v=ID` (prefix yok) = en; `.../tr/watch` = tr.
 *
 * Paylaşılan packages/auth routing'i (en/tr) DEĞİL — bu app kendi diline sahip,
 * diğer app'leri etkilemez.
 */
export const LOCALES = [
  "en",
  "tr",
  "es",
  "pt",
  "de",
  "fr",
  "ru",
  "ar",
  "hi",
  "id",
  "zh",
] as const

export type Locale = (typeof LOCALES)[number]

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: "en",
  localePrefix: "as-needed",
})

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing)
