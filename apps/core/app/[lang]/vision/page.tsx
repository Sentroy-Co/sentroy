import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { localizedAlternates } from "@/lib/seo-alternates"
import { VisionPage } from "@/components/vision/vision-page"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  setRequestLocale(lang)
  const t = await getTranslations({ locale: lang, namespace: "vision" })
  return { title: t("metaTitle"), description: t("metaDescription"), alternates: localizedAlternates(lang, "/vision") }
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  setRequestLocale(lang)
  return <VisionPage lang={lang} />
}
