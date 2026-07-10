import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { SystemMailEventsContent } from "@/components/admin/system-mail-events-content"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "systemMail" })
  return { title: `${t("eventsTitle")} · ${t("title")}` }
}

export default function SystemMailEventsPage() {
  return <SystemMailEventsContent />
}
