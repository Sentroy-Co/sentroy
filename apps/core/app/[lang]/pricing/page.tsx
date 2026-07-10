import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { PricingPage } from "@/components/pricing/pricing-page"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  setRequestLocale(lang)
  const t = await getTranslations({ locale: lang, namespace: "pricing" })
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  setRequestLocale(lang)
  return <PricingPage lang={lang} />
}
