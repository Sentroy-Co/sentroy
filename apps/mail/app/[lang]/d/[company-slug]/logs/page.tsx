import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { LogsContent } from "@/components/logs/logs-content"

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "logs" })
  return { title: t("title") }
}

export default function LogsPage() {
  return <LogsContent />
}
