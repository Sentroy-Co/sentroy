import { headers } from "next/headers"
import { PLATFORMS, platformFromHost, siteSection } from "@/lib/platform"
import { LOCALES, type Locale } from "@/i18n/routing"
import { findTopic } from "@/lib/blog/topics"
import { findTool, localeOf } from "@/lib/tools/registry"
import { ogResponse, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og"

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = "Sentroy Downloader"

function isLocale(l: string): l is Locale {
  return (LOCALES as readonly string[]).includes(l)
}

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}) {
  const { lang, slug } = await params
  const host = (await headers()).get("host")
  const platform = platformFromHost(host)
  const cfg = PLATFORMS[platform]

  // tools.sentroy.com → araç başlıklı OG.
  if (siteSection(host) === "tools") {
    const tool = isLocale(lang) ? findTool(lang, slug) : null
    const tloc = tool ? localeOf(tool, lang as Locale) : null
    return ogResponse({
      platform,
      platformLabel: "Sentroy Tools",
      eyebrow: "Sentroy Tools",
      title: tloc?.title ?? "Sentroy Tools",
      footer: "tools.sentroy.com",
    })
  }

  const topic = isLocale(lang) ? findTopic(lang, slug) : null
  const loc = topic?.locales[lang as Locale]

  return ogResponse({
    platform,
    platformLabel: cfg.label,
    eyebrow: `${cfg.label} Downloader`,
    title: loc?.title ?? `${cfg.label} Downloader`,
    footer: cfg.host,
  })
}
