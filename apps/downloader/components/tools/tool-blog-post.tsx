import { getTranslations } from "next-intl/server"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import type { Locale } from "@/i18n/routing"
import { cn } from "@workspace/ui/lib/utils"
import { findToolById, localeOf, toolPath } from "@/lib/tools/registry"
import { blogIndexPath } from "@/lib/blog/url"
import { TOOL_BLOG_POSTS, blogLocaleOf, toolBlogPath, type ToolBlogPost as Post } from "@/lib/tools/blog"
import { ToolsAmbiance } from "./tools-ambiance"
import { TOOL_UI } from "./tool-page"

/**
 * tools blog rehber sayfası. Bir arama varyasyonunu hedefler: intro + ilgili
 * aracın GÖMÜLÜ UI'ı (ziyaretçi sayfada hemen işini yapar) + FAQ + diğer
 * rehberlere iç bağlantılar + JSON-LD (Article/FAQ/Breadcrumb).
 */
export async function ToolBlogPostBody({
  post,
  lang,
  base,
}: {
  post: Post
  lang: Locale
  base: string
}) {
  const t = await getTranslations({ locale: lang, namespace: "d" })
  const loc = blogLocaleOf(post, lang)!
  const tool = findToolById(post.toolId)
  const toolLoc = tool ? localeOf(tool, lang)! : null
  const ToolUI = TOOL_UI[post.toolId]

  const related = TOOL_BLOG_POSTS.filter((p) => p.slug !== post.slug).slice(0, 6)
  const canonical = `${base}${toolBlogPath(lang, post.slug)}`

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: loc.title,
        description: loc.excerpt,
        inLanguage: lang,
        mainEntityOfPage: canonical,
        author: { "@type": "Organization", name: "Sentroy" },
        publisher: { "@type": "Organization", name: "Sentroy" },
      },
      {
        "@type": "FAQPage",
        mainEntity: loc.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: t("blogHome"), item: `${base}/` },
          { "@type": "ListItem", position: 2, name: t("toolsGuides"), item: `${base}${blogIndexPath(lang)}` },
          { "@type": "ListItem", position: 3, name: loc.title, item: canonical },
        ],
      },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Full-width başlık band'i — arkada çok-renkli gradient ambiyans */}
      <section className="relative overflow-hidden border-b border-border/40">
        <ToolsAmbiance className="absolute" />
        <div className={cn("mx-auto w-full px-4 pb-10 pt-8", ToolUI ? "max-w-6xl" : "max-w-3xl")}>
          <nav className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <a href="/" className="flex items-center gap-1 hover:text-foreground">
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-3.5" />
              {t("toolsAllTools")}
            </a>
            <span>/</span>
            <a href={blogIndexPath(lang)} className="hover:text-foreground">
              {t("toolsGuides")}
            </a>
          </nav>
          <header className="flex flex-col gap-4 pt-6">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{loc.title}</h1>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">{loc.intro}</p>
          </header>
        </div>
      </section>

      <main className={cn("mx-auto w-full px-4 pb-24", ToolUI ? "max-w-6xl" : "max-w-3xl")}>
        {/* Gömülü araç — ziyaretçi rehber sayfasında hemen yapabilsin */}
        {ToolUI ? (
          <section className="scroll-mt-20">
            <ToolUI />
          </section>
        ) : toolLoc ? (
          <a
            href={toolPath(lang, toolLoc.slug)}
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("toolsOpenTool", { tool: toolLoc.title })}
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-5" />
          </a>
        ) : null}

        {/* Tam araca git */}
        {ToolUI && toolLoc ? (
          <p className="mt-4 text-sm text-muted-foreground">
            <a href={toolPath(lang, toolLoc.slug)} className="font-medium text-primary hover:underline">
              {t("toolsOpenTool", { tool: toolLoc.title })} →
            </a>
          </p>
        ) : null}

        {/* FAQ */}
        {loc.faq.length > 0 ? (
          <section className="mt-14 flex max-w-3xl flex-col gap-3">
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("faqTitle")}</h2>
            <div className="flex flex-col gap-2">
              {loc.faq.map((f, i) => (
                <details
                  key={i}
                  className="group rounded-xl border bg-card px-4 py-3 [&_summary::-webkit-details-marker]:hidden"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-3 font-medium">
                    {f.q}
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      strokeWidth={2}
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                    />
                  </summary>
                  <p className="mt-2 leading-relaxed text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        {/* İlgili rehberler — iç bağlantılar */}
        {related.length > 0 ? (
          <section className="mt-14 flex flex-col gap-4">
            <h2 className="text-lg font-semibold tracking-tight">{t("toolsMoreGuides")}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((r) => {
                const rl = blogLocaleOf(r, lang)!
                return (
                  <a
                    key={r.slug}
                    href={toolBlogPath(lang, r.slug)}
                    className="group flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:border-primary/50"
                  >
                    <span className="font-medium">{rl.title}</span>
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      strokeWidth={2}
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                    />
                  </a>
                )
              })}
            </div>
          </section>
        ) : null}
      </main>
    </>
  )
}
