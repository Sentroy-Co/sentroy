"use client"

import { useLocale } from "next-intl"
import { LanguageCombobox } from "@workspace/console/components/shared"
import { usePathname, useRouter, LOCALES } from "@/i18n/routing"

export function LanguageSwitcher() {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  return (
    <LanguageCombobox
      current={locale}
      locales={LOCALES}
      onSelect={(l) =>
        router.replace(pathname, { locale: l as (typeof LOCALES)[number] })
      }
    />
  )
}
