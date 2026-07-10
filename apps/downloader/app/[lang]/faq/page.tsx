import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { routing, LOCALES, type Locale } from "@/i18n/routing"
import { PLATFORMS, platformFromHost, siteSection } from "@/lib/platform"
import { SiteHeader, SiteFooter } from "@/components/site-chrome"
import { FaqSection } from "@/components/sections"

function baseUrl(host: string | null): string {
  const h = host || "youtube.sentroy.com"
  const proto = h.startsWith("localhost") || h.startsWith("127.") ? "http" : "https"
  return `${proto}://${h}`
}

function faqPath(lang: Locale): string {
  return lang === routing.defaultLocale ? "/faq" : `/${lang}/faq`
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const host = (await headers()).get("host")
  const base = baseUrl(host)
  const platform = PLATFORMS[platformFromHost(host)]
  const t = await getTranslations({ locale: lang, namespace: "d" })
  const title = `${t("faqTitle")} — ${platform.label} ${t("brand")}`
  const description = t("metaDescription", { platform: platform.label })
  const languages: Record<string, string> = { "x-default": `${base}${faqPath(routing.defaultLocale)}` }
  for (const l of LOCALES) languages[l] = `${base}${faqPath(l)}`
  const canonical = `${base}${faqPath(lang as Locale)}`
  return {
    metadataBase: new URL(base),
    title,
    description,
    alternates: { canonical, languages },
    openGraph: { title, description, url: canonical, type: "website" },
    robots: { index: true, follow: true },
  }
}

export default async function FaqPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!(routing.locales as readonly string[]).includes(lang)) notFound()

  const host = (await headers()).get("host")
  // FAQ yalnız download bölümüne ait — tools host'ta 404.
  if (siteSection(host) === "tools") notFound()
  const platform = platformFromHost(host)
  const t = await getTranslations({ locale: lang, namespace: "d" })

  const faqs = [
    { q: t("faq1Q"), a: t("faq1A") },
    { q: t("faq2Q"), a: t("faq2A") },
    { q: t("faq3Q"), a: t("faq3A") },
    { q: t("faq4Q"), a: t("faq4A") },
  ]
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader platform={platform} lang={lang} />
      <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8">
        <FaqSection />
      </main>
      <SiteFooter platform={platform} lang={lang} />
    </>
  )
}
