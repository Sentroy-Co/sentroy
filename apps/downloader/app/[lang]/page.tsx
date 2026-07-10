import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { platformFromHost, siteSection, PLATFORMS } from "@/lib/platform"
import { Downloader } from "@/components/downloader"
import { PlatformTabs } from "@/components/platform-tabs"
import { SiteHeader, SiteFooter } from "@/components/site-chrome"
import { HowItWorks } from "@/components/sections"
import { SmoothScroll } from "@/components/smooth-scroll"
import { ScrollIndicator } from "@/components/scroll-indicator"
import { Ambiance } from "@/components/ambiance"
import { ToolsHeader } from "@/components/tools/tools-header"
import { ToolsLanding } from "@/components/tools/tools-landing"
import { ToolsAmbiance } from "@/components/tools/tools-ambiance"
import type { Locale } from "@/i18n/routing"

export default async function LandingPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  const host = (await headers()).get("host")

  // tools.sentroy.com → araçlar landing'i (mega menü + kategori gridi).
  if (siteSection(host) === "tools") {
    return (
      <>
        <SmoothScroll />
        {/* Fixed çok-renkli yumuşak gradient ambiyans (hue-rotate ile soft kayar). */}
        <ToolsAmbiance />
        <ToolsHeader lang={lang as Locale} />
        <ToolsLanding lang={lang as Locale} />
        <SiteFooter platform="youtube" lang={lang} section="tools" />
      </>
    )
  }

  const platform = platformFromHost(host)
  const cfg = PLATFORMS[platform]
  const t = await getTranslations({ locale: lang, namespace: "d" })
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null

  // SoftwareApplication JSON-LD (FAQ ayrı /faq sayfasına taşındı).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: `${cfg.label} Downloader`,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SmoothScroll />
      <SiteHeader platform={platform} lang={lang} />

      {/* 1. ekran — indirme formu (75svh) + nasıl indirilir (25svh) */}
      <main>
        <section className="relative flex min-h-[100svh] snap-start flex-col">
          <Ambiance />
          <div className="mx-auto flex min-h-[75svh] w-full max-w-5xl flex-col items-center justify-center gap-7 px-4 pt-16">
            <div className="flex max-w-2xl flex-col items-center gap-4 text-center">
              <h1 className="bg-gradient-to-b from-foreground to-foreground/55 bg-clip-text pb-1 text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
                {platform === "instagram"
                  ? t("igHeroTitle")
                  : t("heroTitle", { platform: cfg.label })}
              </h1>
              <p className="text-lg text-muted-foreground">
                {platform === "instagram" ? t("igHeroSubtitle") : t("heroSubtitle")}
              </p>
            </div>
            <PlatformTabs active={platform} />
            <Downloader platform={platform} siteKey={siteKey} />
          </div>

          <div className="mx-auto flex min-h-[25svh] w-full max-w-5xl items-center px-4 pb-16">
            <HowItWorks />
          </div>

          <ScrollIndicator />
        </section>
      </main>

      {/* 2. ekran — premium footer */}
      <SiteFooter platform={platform} lang={lang} fullHeight />
    </>
  )
}
