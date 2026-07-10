import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { InboxContent } from "@/components/inbox/inbox-content"

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "inbox" })
  return { title: t("title") }
}

export default function InboxPage() {
  return <InboxContent />
}
