import { defineRouting } from "next-intl/routing"
import { createNavigation } from "next-intl/navigation"

export const routing = defineRouting({
  // en/tr + ru/zh/es. ⚠ Bu listeye dil eklemek, bu routing'i kullanan HER app'in
  // i18n/request.ts `bundles` objesine o dilin mesajlarını eklemeyi ZORUNLU kılar
  // (aksi halde `bundles[locale]` undefined → o dilde app çöker).
  locales: ["en", "tr", "ru", "zh", "es"],
  defaultLocale: "en",
})

export const { Link, redirect, usePathname, useRouter } =
  createNavigation(routing)
