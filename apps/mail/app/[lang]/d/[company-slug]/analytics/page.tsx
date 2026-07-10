import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { AnalyticsContent } from "@/components/analytics/analytics-content"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "analytics" })
  return { title: t("title") }
}

export default function AnalyticsPage() {
  return <AnalyticsContent />
}
