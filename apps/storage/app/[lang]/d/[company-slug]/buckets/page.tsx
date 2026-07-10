import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { BucketsContent } from "@/components/buckets/buckets-content"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "buckets" })
  return { title: t("title") }
}

export default function BucketsPage() {
  return <BucketsContent />
}
