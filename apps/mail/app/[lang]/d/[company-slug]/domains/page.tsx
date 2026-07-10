import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { DomainsContent } from "@/components/domains/domains-content"

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "domains" })
  return { title: t("title") }
}

export default function DomainsPage() {
  return <DomainsContent />
}
