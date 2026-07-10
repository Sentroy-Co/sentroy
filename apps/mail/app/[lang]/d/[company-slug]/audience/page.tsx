import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { AudienceContent } from "@/components/audience/audience-content"

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "audience" })
  return { title: t("title") }
}

export default function AudiencePage() {
  return <AudienceContent />
}
