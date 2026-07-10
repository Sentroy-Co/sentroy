import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { SystemMailContent } from "@/components/admin/system-mail-content"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "admin" })
  return { title: t("systemMail") }
}

export default function SystemMailPage() {
  return <SystemMailContent />
}
