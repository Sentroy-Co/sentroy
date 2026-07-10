import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { SystemStatusContent } from "@/components/admin/system-status-content"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "admin" })
  return { title: t("systemStatus") }
}

export default function SystemStatusPage() {
  // Layout zaten admin auth gate'i çalıştırıyor — burada tekrar check'e gerek
  // yok. Tüm UI client-side, 30sn auto-refresh ile probe yapar.
  return <SystemStatusContent />
}
