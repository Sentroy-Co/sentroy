import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { headers } from "next/headers"
import { NextIntlClientProvider } from "next-intl"
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server"
import { routing, LOCALES, type Locale } from "@/i18n/routing"
import { PLATFORMS, platformFromHost, siteSection } from "@/lib/platform"

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }))
}

function baseUrl(host: string | null): string {
  const h = host || "youtube.sentroy.com"
  const proto = h.startsWith("localhost") || h.startsWith("127.") ? "http" : "https"
  return `${proto}://${h}`
}

/** Locale başına hreflang — as-needed: en prefix'siz, diğerleri /<lang>. */
function languageAlternates(base: string): Record<string, string> {
  const out: Record<string, string> = { "x-default": `${base}/` }
  for (const l of LOCALES) {
    out[l] = l === routing.defaultLocale ? `${base}/` : `${base}/${l}`
  }
  return out
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
  const canonical = lang === routing.defaultLocale ? `${base}/` : `${base}/${lang}`

  // tools.sentroy.com → araçlar metası (platform "Downloader" başlığı değil).
  const isTools = siteSection(host) === "tools"
  const title = isTools
    ? t("toolsMetaTitle")
    : t("metaTitle", { platform: PLATFORMS[platformFromHost(host)].label })
  const description = isTools
    ? t("toolsMetaDescription")
    : t("metaDescription", { platform: PLATFORMS[platformFromHost(host)].label })
  const siteName = isTools ? "Sentroy Tools" : PLATFORMS[platformFromHost(host)].label + " Downloader"

  return {
    metadataBase: new URL(base),
    title,
    description,
    alternates: { canonical, languages: languageAlternates(base) },
    openGraph: { title, description, url: canonical, siteName, type: "website" },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: true, follow: true },
  }
}

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!(routing.locales as readonly string[]).includes(lang)) notFound()
  setRequestLocale(lang)
  const messages = await getMessages()
  return (
    <NextIntlClientProvider messages={messages} locale={lang as Locale}>
      {/* Sentroy OS embed mode — iframe'de (?embed=1) tools header'ını gizler. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `try{var e=new URLSearchParams(window.location.search).has('embed');if(e)sessionStorage.setItem('os-embed','1');var f=window.self!==window.top;if(e||(f&&sessionStorage.getItem('os-embed')))document.documentElement.dataset.embedded='1'}catch(e){}`,
        }}
      />
      {children}
    </NextIntlClientProvider>
  )
}
