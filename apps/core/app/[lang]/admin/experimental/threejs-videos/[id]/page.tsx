import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { ThreejsEditor } from "@/components/admin/experimental/threejs-editor"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "experimental" })
  return { title: t("editorTitle") }
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // id="new" → fresh editor, default scene
  return <ThreejsEditor sceneId={id === "new" ? null : id} />
}
