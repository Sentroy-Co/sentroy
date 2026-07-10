import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { TemplateLibraryContent } from "@/components/admin/template-library-content"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "admin" })
  return { title: t("templateLibrary") }
}

export default function TemplateLibraryPage() {
  return <TemplateLibraryContent />
}
