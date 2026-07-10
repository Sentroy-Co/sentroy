import type { Metadata } from "next"
import { StudioProjectsContent } from "@/components/studio-projects-content"

export const metadata: Metadata = {
  title: "Projects",
}

export default async function StudioProjectsPage({
  params,
}: {
  params: Promise<{ "company-slug": string; lang: string }>
}) {
  const { "company-slug": slug, lang } = await params
  return <StudioProjectsContent companySlug={slug} lang={lang} />
}
