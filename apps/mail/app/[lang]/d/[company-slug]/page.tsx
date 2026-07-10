import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { DashboardContent } from "@/components/dashboard/dashboard-content"

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "dashboard" })
  return { title: t("title") }
}

export default function DashboardPage() {
  return <DashboardContent />
}
