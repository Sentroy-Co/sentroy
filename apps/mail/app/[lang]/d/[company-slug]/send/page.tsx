import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { SendContent } from "@/components/send/send-content"

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "send" })
  return { title: t("title") }
}

export default function SendPage() {
  return <SendContent />
}
