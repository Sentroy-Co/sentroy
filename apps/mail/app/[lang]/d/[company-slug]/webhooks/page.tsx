import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { WebhooksContent } from "@/components/webhooks/webhooks-content"

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "webhooks" })
  return { title: t("title") }
}

export default function WebhooksPage() {
  return <WebhooksContent />
}
