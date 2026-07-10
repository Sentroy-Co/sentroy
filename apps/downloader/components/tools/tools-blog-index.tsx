import { getTranslations } from "next-intl/server"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import type { Locale } from "@/i18n/routing"
import { TOOL_BLOG_POSTS, blogLocaleOf, toolBlogPath } from "@/lib/tools/blog"
import { ToolsAmbiance } from "./tools-ambiance"

/**
 * tools.sentroy.com rehber/blog indeksi — arama varyasyonlarını (jpg to png,
 * png to jpeg…) yakalayan rehber kartları. Tek-renk değil çok-renk ambiyans.
 */
export async function ToolsBlogIndex({ lang }: { lang: Locale }) {
  const t = await getTranslations({ locale: lang, namespace: "d" })

  return (
    <>
      <section className="relative overflow-hidden border-b border-border/40">
        <ToolsAmbiance className="absolute" />
        <div className="mx-auto w-full max-w-5xl px-4 pb-12 pt-12 text-center">
          <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {t("toolsGuidesBadge")}
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{t("toolsGuidesTitle")}</h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{t("toolsGuidesDesc")}</p>
        </div>
      </section>

      <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-10">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOOL_BLOG_POSTS.map((post) => {
            const loc = blogLocaleOf(post, lang)!
            return (
              <a
                key={post.slug}
                href={toolBlogPath(lang, post.slug)}
                className="group flex flex-col gap-1.5 rounded-2xl border bg-card px-5 py-4 transition-colors hover:border-primary/50"
              >
                <span className="flex items-center justify-between gap-3 font-semibold">
                  {loc.title}
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    strokeWidth={2}
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                  />
                </span>
                <span className="text-sm leading-relaxed text-muted-foreground">{loc.excerpt}</span>
              </a>
            )
          })}
        </div>
      </main>
    </>
  )
}
