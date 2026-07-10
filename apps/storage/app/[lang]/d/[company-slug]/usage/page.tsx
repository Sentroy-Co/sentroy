import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { UsageContent } from "@/components/usage/usage-content"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "usage" })
  return { title: t("title") }
}

export default function UsagePage() {
  return <UsageContent />
}
