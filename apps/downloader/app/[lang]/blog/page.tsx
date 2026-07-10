import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { routing, LOCALES, type Locale } from "@/i18n/routing"
import { PLATFORMS, platformFromHost, siteSection } from "@/lib/platform"
import { SiteHeader, SiteFooter } from "@/components/site-chrome"
import { ToolsHeader } from "@/components/tools/tools-header"
import { ToolsBlogIndex } from "@/components/tools/tools-blog-index"
import { topicsForPlatform } from "@/lib/blog/topics"
import { blogPath, blogIndexPath } from "@/lib/blog/url"

// Dinamik (headers → platform). [lang] layout'u lang param'ını sağlar.

function baseUrl(host: string | null): string {
  const h = host || "youtube.sentroy.com"
  const proto = h.startsWith("localhost") || h.startsWith("127.") ? "http" : "https"
  return `${proto}://${h}`
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const host = (await headers()).get("host")
  const base = baseUrl(host)
  const t = await getTranslations({ locale: lang, namespace: "d" })

  // ── tools.sentroy.com → rehber/blog indeksi ──
  if (siteSection(host) === "tools") {
    const title = t("toolsGuidesTitle")
    const description = t("toolsGuidesDesc")
    const languages: Record<string, string> = { "x-default": `${base}${blogIndexPath(routing.defaultLocale)}` }
    for (const l of LOCALES) languages[l] = `${base}${blogIndexPath(l)}`
    const canonical = `${base}${blogIndexPath(lang as Locale)}`
    return {
      metadataBase: new URL(base),
      title: `${title} — Sentroy Tools`,
      description,
      alternates: { canonical, languages },
      openGraph: { title, description, url: canonical, type: "website" },
      robots: { index: true, follow: true },
    }
  }

  const platform = PLATFORMS[platformFromHost(host)]
  const title = t("blogIndexTitle", { platform: platform.label })
  const description = t("blogIndexDesc", { platform: platform.label })
  const languages: Record<string, string> = { "x-default": `${base}${blogIndexPath(routing.defaultLocale)}` }
  for (const l of LOCALES) languages[l] = `${base}${blogIndexPath(l)}`
  const canonical = `${base}${blogIndexPath(lang as Locale)}`
  return {
    metadataBase: new URL(base),
    title,
    description,
    alternates: { canonical, languages },
    openGraph: { title, description, url: canonical, type: "website" },
    robots: { index: true, follow: true },
  }
}

export default async function BlogIndexPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!(routing.locales as readonly string[]).includes(lang)) notFound()
  const locale = lang as Locale

  const host = (await headers()).get("host")
  // ── tools.sentroy.com → rehber/blog indeksi (arama varyasyonu yakalama) ──
  if (siteSection(host) === "tools") {
    return (
      <>
        <ToolsHeader lang={locale} />
        <ToolsBlogIndex lang={locale} />
        <SiteFooter platform="youtube" lang={lang} section="tools" />
      </>
    )
  }
  const platform = platformFromHost(host)
  const cfg = PLATFORMS[platform]
  const t = await getTranslations({ locale: lang, namespace: "d" })

  const topics = topicsForPlatform(platform, locale)

  return (
    <>
      <SiteHeader platform={platform} lang={lang} />
      <main className="mx-auto flex max-w-3xl flex-col px-4 pb-8">
        <header className="flex flex-col gap-3 py-12 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("blogIndexTitle", { platform: cfg.label })}
          </h1>
          <p className="mx-auto max-w-xl text-muted-foreground">
            {t("blogIndexDesc", { platform: cfg.label })}
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          {topics.map((topic) => {
            const loc = topic.locales[locale]!
            return (
              <a
                key={topic.id}
                href={blogPath(locale, loc.slug)}
                className="group flex flex-col gap-1 rounded-xl border bg-card px-5 py-4 transition-colors hover:border-primary/50"
              >
                <span className="flex items-center justify-between gap-3 font-semibold">
                  {loc.title}
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    strokeWidth={2}
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                  />
                </span>
                <span className="text-sm text-muted-foreground">{loc.keyword}</span>
              </a>
            )
          })}
        </div>
      </main>
      <SiteFooter platform={platform} lang={lang} />
    </>
  )
}
