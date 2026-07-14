import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { localizedAlternates } from "@/lib/seo-alternates"
import { fetchLatestDesktopRelease } from "@/lib/desktop-downloads"
import { DownloadPage } from "@/components/download/download-page"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  setRequestLocale(lang)
  const t = await getTranslations({ locale: lang, namespace: "download" })
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: localizedAlternates(lang, "/download"),
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  setRequestLocale(lang)
  const release = await fetchLatestDesktopRelease()
  return <DownloadPage lang={lang} release={release} />
}
