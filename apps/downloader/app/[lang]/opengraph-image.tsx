import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { PLATFORMS, platformFromHost, siteSection } from "@/lib/platform"
import { ogResponse, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og"

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = "Sentroy"

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  const host = (await headers()).get("host")
  const platform = platformFromHost(host)
  const t = await getTranslations({ locale: lang, namespace: "d" })

  // tools.sentroy.com → araçlar landing OG'si.
  if (siteSection(host) === "tools") {
    return ogResponse({
      platform,
      platformLabel: "Sentroy Tools",
      eyebrow: "Sentroy Tools",
      title: t("toolsHeroTitle"),
      footer: "tools.sentroy.com",
    })
  }

  const cfg = PLATFORMS[platform]
  return ogResponse({
    platform,
    platformLabel: cfg.label,
    eyebrow: `${cfg.label} Downloader`,
    title: t("heroTitle", { platform: cfg.label }),
    footer: cfg.host,
  })
}
