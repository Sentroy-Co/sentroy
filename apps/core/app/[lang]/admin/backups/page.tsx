import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { BackupsContent } from "@/components/admin/backups-content"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "admin" })
  return { title: t("backups") }
}

export default function BackupsPage() {
  return <BackupsContent />
}
