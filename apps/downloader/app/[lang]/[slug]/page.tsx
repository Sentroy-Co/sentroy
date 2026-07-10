import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons"
import { routing, LOCALES, type Locale } from "@/i18n/routing"
import { PLATFORMS, platformFromHost, siteSection } from "@/lib/platform"
import { Downloader } from "@/components/downloader"
import { SiteHeader, SiteFooter } from "@/components/site-chrome"
import { ToolsHeader } from "@/components/tools/tools-header"
import { ToolPageBody } from "@/components/tools/tool-page"
import { ToolBlogPostBody } from "@/components/tools/tool-blog-post"
import { findTool, toolPath, toolLocales, localeOf } from "@/lib/tools/registry"
import { findToolBlogPost, blogLocaleOf, toolBlogPath } from "@/lib/tools/blog"
import {
  findTopic,
  topicsForPlatform,
  topicLocales,
  type BlogTopic,
} from "@/lib/blog/topics"
import { generateArticle } from "@/lib/blog/engine"
import { blogPath, blogIndexPath } from "@/lib/blog/url"

// headers() (host → platform) kullanıldığı için route dinamik. Geçersiz
// slug'lar findTopic → notFound() ile 404 olur (generateStaticParams gerekmez,
// mevcut home/watch sayfalarıyla aynı desen).

function baseUrl(host: string | null): string {
  const h = host || "youtube.sentroy.com"
  const proto = h.startsWith("localhost") || h.startsWith("127.") ? "http" : "https"
  return `${proto}://${h}`
}

function isLocale(l: string): l is Locale {
  return (LOCALES as readonly string[]).includes(l)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}): Promise<Metadata> {
  const { lang, slug } = await params
  if (!isLocale(lang)) return {}

  const host = (await headers()).get("host")
  const base = baseUrl(host)

  // ── tools.sentroy.com → araç meta'sı (canonical + hreflang) ──
  if (siteSection(host) === "tools") {
    const tool = findTool(lang, slug)
    if (!tool) {
      // Araç değilse rehber/blog post olabilir (arama varyasyonu sayfası).
      const post = findToolBlogPost(slug)
      if (!post) return {}
      const ploc = blogLocaleOf(post, lang)!
      const languages: Record<string, string> = {}
      for (const l of LOCALES) languages[l] = `${base}${toolBlogPath(l, post.slug)}`
      languages["x-default"] = `${base}${toolBlogPath(routing.defaultLocale, post.slug)}`
      const canonical = `${base}${toolBlogPath(lang, post.slug)}`
      return {
        metadataBase: new URL(base),
        title: `${ploc.title} — Sentroy Tools`,
        description: ploc.excerpt,
        alternates: { canonical, languages },
        openGraph: { title: ploc.title, description: ploc.excerpt, url: canonical, type: "article" },
        twitter: { card: "summary_large_image", title: ploc.title, description: ploc.excerpt },
        robots: { index: true, follow: true },
      }
    }
    const loc = localeOf(tool, lang)!
    const languages: Record<string, string> = {}
    for (const l of toolLocales(tool)) {
      languages[l] = `${base}${toolPath(l, tool.locales[l]!.slug)}`
    }
    const enLoc = tool.locales[routing.defaultLocale]
    if (enLoc) languages["x-default"] = `${base}${toolPath(routing.defaultLocale, enLoc.slug)}`
    // Canonical HER ZAMAN eşleşen dilin slug'ı — yanlış-dil slug'ıyla (fallback)
    // gelinse bile duplicate content olmasın.
    const canonical = `${base}${toolPath(lang, loc.slug)}`
    return {
      metadataBase: new URL(base),
      title: `${loc.title} — Sentroy Tools`,
      description: loc.description,
      alternates: { canonical, languages },
      openGraph: { title: loc.title, description: loc.description, url: canonical, type: "website" },
      twitter: { card: "summary_large_image", title: loc.title, description: loc.description },
      // "soon" araçlar henüz indexlenmesin (sitemap'te de yok); live olunca açılır.
      robots: { index: tool.status === "live", follow: true },
    }
  }

  const topic = findTopic(lang, slug)
  if (!topic) return {}
  const article = generateArticle(topic, lang)
  if (!article) return {}

  // hreflang — topic'in kayıtlı olduğu her dil, kendi yerelleştirilmiş slug'ıyla.
  const languages: Record<string, string> = {}
  for (const l of topicLocales(topic)) {
    languages[l] = `${base}${blogPath(l, topic.locales[l]!.slug)}`
  }
  const enLoc = topic.locales[routing.defaultLocale]
  if (enLoc) languages["x-default"] = `${base}${blogPath(routing.defaultLocale, enLoc.slug)}`

  const canonical = `${base}${blogPath(lang, slug)}`
  return {
    metadataBase: new URL(base),
    title: article.metaTitle,
    description: article.metaDescription,
    alternates: { canonical, languages },
    openGraph: {
      title: article.metaTitle,
      description: article.metaDescription,
      url: canonical,
      type: "article",
    },
    twitter: { card: "summary_large_image", title: article.metaTitle, description: article.metaDescription },
    robots: { index: true, follow: true },
  }
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}) {
  const { lang, slug } = await params
  if (!isLocale(lang)) notFound()

  const host = (await headers()).get("host")

  // ── tools.sentroy.com → araç sayfası (slug host-gated; blog slug'ı 404) ──
  if (siteSection(host) === "tools") {
    const tool = findTool(lang, slug)
    if (tool) {
      // Dil-öncelikli kanonikleştirme: araca yanlış-dil slug'ıyla gelindiyse
      // (örn. dil değiştirici /tr/merge-pdf üretti) eşleşen dilin slug'ına
      // 307 redirect et → URL kendini düzeltir, 404 olmaz, tek kanonik kalır.
      const canonicalSlug = localeOf(tool, lang)?.slug
      if (canonicalSlug && canonicalSlug !== slug) {
        redirect(toolPath(lang, canonicalSlug))
      }
      return (
        <>
          <ToolsHeader lang={lang} />
          <ToolPageBody tool={tool} lang={lang} />
          <SiteFooter platform="youtube" lang={lang} section="tools" />
        </>
      )
    }
    // Araç değilse rehber/blog post dene (jpg-to-png vb. arama varyasyonu).
    const post = findToolBlogPost(slug)
    if (!post) notFound()
    return (
      <>
        <ToolsHeader lang={lang} />
        <ToolBlogPostBody post={post} lang={lang} base={baseUrl(host)} />
        <SiteFooter platform="youtube" lang={lang} section="tools" />
      </>
    )
  }

  const topic = findTopic(lang, slug)
  if (!topic) notFound()

  // Host platform'u topic platformuyla eşleşmeli (instagram topic'i
  // youtube.sentroy.com'da görünmez).
  const hostPlatform = platformFromHost(host)
  if (topic.platform !== hostPlatform) notFound()

  const article = generateArticle(topic, lang)
  if (!article) notFound()

  const base = baseUrl(host)
  const cfg = PLATFORMS[topic.platform]
  const t = await getTranslations({ locale: lang, namespace: "d" })
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null

  const related = topicsForPlatform(topic.platform, lang)
    .filter((r) => r.id !== topic.id)
    .slice(0, 6)

  // JSON-LD: Article + FAQPage + BreadcrumbList
  const canonical = `${base}${blogPath(lang, slug)}`
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: article.title,
        description: article.metaDescription,
        inLanguage: lang,
        mainEntityOfPage: canonical,
        author: { "@type": "Organization", name: "Sentroy" },
        publisher: { "@type": "Organization", name: "Sentroy" },
      },
      {
        "@type": "FAQPage",
        mainEntity: article.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: t("blogHome"), item: `${base}/` },
          { "@type": "ListItem", position: 2, name: t("blogGuides"), item: `${base}${blogIndexPath(lang)}` },
          { "@type": "ListItem", position: 3, name: article.title, item: canonical },
        ],
      },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader platform={topic.platform} lang={lang} />
      <main className="mx-auto flex max-w-3xl flex-col px-4 pb-8">
        {/* Breadcrumb */}
        <nav data-app-chrome className="flex flex-wrap items-center gap-1.5 pt-8 text-xs text-muted-foreground">
          <a href={blogPath(lang, "").replace(/\/$/, "") || "/"} className="hover:text-foreground">
            {t("blogHome")}
          </a>
          <span>/</span>
          <a href={blogIndexPath(lang)} className="hover:text-foreground">
            {t("blogGuides")}
          </a>
          <span>/</span>
          <span className="text-foreground">{article.title}</span>
        </nav>

        {/* H1 + lead */}
        <header className="flex flex-col gap-4 pt-6">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{article.title}</h1>
          <p className="text-lg leading-relaxed text-muted-foreground">{article.lead}</p>
        </header>

        {/* Fonksiyonel dönüştürücü — ziyaretçi hemen indirebilsin */}
        <section id="top" className="mt-8 scroll-mt-20">
          <Downloader platform={topic.platform} siteKey={siteKey} />
        </section>

        {/* İçerik bölümleri */}
        <article className="mt-12 flex flex-col gap-10">
          {article.sections.map((s, i) => (
            <section key={i} className="flex flex-col gap-3">
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{s.heading}</h2>
              {s.paragraphs.map((p, j) => (
                <p key={j} className="leading-relaxed text-muted-foreground">
                  {p}
                </p>
              ))}
              {s.steps ? (
                <ol className="mt-2 flex flex-col gap-4">
                  {s.steps.map((step, k) => (
                    <li key={k} className="flex gap-3">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                        {k + 1}
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-foreground">{step.title}</span>
                        <span className="text-sm leading-relaxed text-muted-foreground">{step.body}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : null}
              {s.list ? (
                <ul className="mt-1 flex flex-col gap-2">
                  {s.list.map((item, k) => (
                    <li key={k} className="flex items-start gap-2.5 text-muted-foreground">
                      <HugeiconsIcon
                        icon={CheckmarkCircle02Icon}
                        strokeWidth={2}
                        className="mt-0.5 size-5 shrink-0 text-primary"
                      />
                      <span className="leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}

          {/* FAQ — <details> ile JS'siz, erişilebilir, SEO dostu akordeon */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("faqTitle")}</h2>
            <div className="flex flex-col gap-2">
              {article.faq.map((f, i) => (
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
        </article>

        {/* CTA */}
        <section className="mt-12 flex flex-col items-center gap-3 rounded-2xl border bg-card px-6 py-10 text-center">
          <h2 className="text-2xl font-bold tracking-tight">{article.cta.heading}</h2>
          <p className="max-w-xl text-muted-foreground">{article.cta.body}</p>
          <a
            href="#top"
            className="mt-2 inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-8 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {article.cta.button}
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-5" />
          </a>
        </section>

        {/* İlgili rehberler — iç bağlantılar (SEO interlinking) */}
        {related.length > 0 ? (
          <section className="mt-12 flex flex-col gap-4">
            <h2 className="text-lg font-semibold tracking-tight">{t("blogRelated")}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {related.map((r: BlogTopic) => {
                const loc = r.locales[lang]!
                return (
                  <a
                    key={r.id}
                    href={blogPath(lang, loc.slug)}
                    className="group flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:border-primary/50"
                  >
                    <span className="font-medium">{loc.title}</span>
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
      <SiteFooter platform={topic.platform} lang={lang} />
    </>
  )
}
