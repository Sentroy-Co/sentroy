import { getTranslations } from "next-intl/server"
import type { Locale } from "@/i18n/routing"
import {
  toolsByCategory,
  categoryLabel,
  toolPath,
  localeOf,
} from "@/lib/tools/registry"
import { LanguageSwitcher } from "../language-switcher"
import { HeaderShell } from "../header-shell"
import { MegaMenu, type MegaMenuCategory } from "./mega-menu"
import { ToolsAuthButton } from "./auth-button"

/**
 * tools.sentroy.com header — logo + kategori mega menüsü + dil. Mega menü
 * verisi registry'den (lang'a göre) burada kurulup client component'e geçer.
 */
export async function ToolsHeader({ lang }: { lang: Locale }) {
  const t = await getTranslations({ locale: lang, namespace: "d" })

  const categories: MegaMenuCategory[] = toolsByCategory(lang).map((g) => ({
    key: g.category,
    label: categoryLabel(g.category, lang),
    tools: g.tools.map((tool) => {
      const loc = localeOf(tool, lang)!
      return {
        slug: loc.slug,
        title: loc.title,
        description: loc.description,
        href: toolPath(lang, loc.slug),
        status: tool.status,
      }
    }),
  }))

  return (
    <HeaderShell
      collapsible
      left={<MegaMenu categories={categories} soonLabel={t("toolSoon")} />}
      right={
        <>
          <LanguageSwitcher />
          <ToolsAuthButton />
          <a
            href="/"
            className="rounded-3xl px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted md:hidden"
          >
            {t("toolsAllTools")}
          </a>
        </>
      }
    />
  )
}
