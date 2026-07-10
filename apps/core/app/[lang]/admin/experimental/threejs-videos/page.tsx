import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { ThreejsVideosListContent } from "@/components/admin/experimental/threejs-videos-list"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "experimental" })
  return { title: t("threejsVideos") }
}

export default function Page() {
  return <ThreejsVideosListContent />
}
