import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { TeamContent } from "@workspace/console/components/team/team-content"

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "team" })
  return { title: t("title") }
}

export default function TeamPage() {
  return <TeamContent />
}
