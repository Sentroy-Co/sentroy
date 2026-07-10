import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { TemplatesContent } from "@/components/templates/templates-content"

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "templates" })
  return { title: t("title") }
}

export default function TemplatesPage() {
  return <TemplatesContent />
}
