import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { TeamContent } from "@workspace/console/components/team/team-content"

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "team" })
  return { title: t("title") }
}

/**
 * Core company Team sayfası — company-level yönetim core'a ait. OS System
 * Settings penceresi bunu `?embed=1` ile iframe eder (mail/storage sidebar'ından
 * kaldırıldı). Aynı `SettingsContent` deseni.
 */
export default function TeamPage() {
  return <TeamContent />
}
