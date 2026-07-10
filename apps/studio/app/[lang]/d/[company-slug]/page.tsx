import { redirect } from "next/navigation"

export default async function CompanyRoot({
  params,
}: {
  params: Promise<{ "company-slug": string; lang: string }>
}) {
  const { "company-slug": slug, lang } = await params
  redirect(`/${lang}/d/${slug}/studio`)
}
