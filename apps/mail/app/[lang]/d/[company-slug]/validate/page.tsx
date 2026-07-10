import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { ValidateContent } from "@/components/validate/validate-content"

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "validate" })
  return { title: t("title") }
}

export default function ValidatePage() {
  return <ValidateContent />
}
