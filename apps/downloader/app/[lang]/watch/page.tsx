import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import {
  platformFromHost,
  PLATFORMS,
  youtubeUrlFromId,
} from "@/lib/platform"
import { Downloader } from "@/components/downloader"
import { PlatformTabs } from "@/components/platform-tabs"
import { SiteHeader, SiteFooter } from "@/components/site-chrome"

/**
 * Paylaşılabilir indirme sayfası — `youtube.sentroy.com/watch?v=ID` (as-needed
 * locale prefix sayesinde default `en`). `?url=` da kabul edilir. Video
 * metadata'sı client-side `Downloader` (initialUrl) tarafından çekilir;
 * SSR'da worker çağrısı yapılmaz (bot-koruması + maliyet).
 */
export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>
  searchParams: Promise<{ v?: string; url?: string }>
}) {
  const { lang } = await params
  const sp = await searchParams
  const host = (await headers()).get("host")
  const platform = platformFromHost(host)
  const cfg = PLATFORMS[platform]
  const t = await getTranslations({ locale: lang, namespace: "d" })
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null

  const initialUrl =
    (sp.url && sp.url.trim()) ||
    (sp.v ? (youtubeUrlFromId(sp.v) ?? undefined) : undefined) ||
    undefined

  return (
    <>
      <SiteHeader platform={platform} lang={lang} />
      <main className="mx-auto flex max-w-5xl flex-col items-center px-4">
        <section className="flex w-full flex-col items-center gap-6 py-12">
          <div className="flex max-w-2xl flex-col items-center gap-3 text-center">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {platform === "instagram"
                ? t("igHeroTitle")
                : t("heroTitle", { platform: cfg.label })}
            </h1>
            <p className="text-muted-foreground">
              {platform === "instagram" ? t("igHeroSubtitle") : t("heroSubtitle")}
            </p>
          </div>
          <PlatformTabs active={platform} />
          <Downloader platform={platform} initialUrl={initialUrl} siteKey={siteKey} />
        </section>
      </main>
      <SiteFooter platform={platform} lang={lang} />
    </>
  )
}
