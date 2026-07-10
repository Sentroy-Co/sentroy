import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { localizedAlternates } from "@/lib/seo-alternates"
import { InvestorsPage } from "@/components/investors/investors-page"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  setRequestLocale(lang)
  const t = await getTranslations({ locale: lang, namespace: "investors" })
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: localizedAlternates(lang, "/investors"),
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  setRequestLocale(lang)
  return <InvestorsPage lang={lang} />
}
