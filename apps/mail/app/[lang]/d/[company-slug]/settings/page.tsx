import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { SettingsContent } from "@workspace/console/components/settings/settings-content"

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "settings" })
  return { title: t("title") }
}

export default function SettingsPage() {
  return <SettingsContent />
}
