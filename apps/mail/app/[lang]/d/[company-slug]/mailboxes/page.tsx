import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { MailboxesContent } from "@/components/mailboxes/mailboxes-content"

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "mailboxes" })
  return { title: t("title") }
}

export default function MailboxesPage() {
  return <MailboxesContent />
}
