import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { auth } from "@workspace/auth/server/auth"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "companySelection" })
  return { title: t("title") }
}

export default async function CompanySelectionPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    // Login sayfası core'da; cross-subdomain auth cookie ile geri dönüş
    // sorunsuz. callbackUrl olarak mail subdomain'inin /d'sine yönlendirir.
    const coreUrl = process.env.NEXT_PUBLIC_CORE_APP_URL || ""
    const mailUrl = process.env.NEXT_PUBLIC_MAIL_APP_URL || ""
    const callback = encodeURIComponent(`${mailUrl}/${lang}/d`)
    redirect(`${coreUrl}/${lang}/login?callbackUrl=${callback}`)
  }
  // Signed in: company seçim ekranını gösterme; core'un OS ekranına yönlendir.
  const coreUrl = process.env.NEXT_PUBLIC_CORE_APP_URL || "https://sentroy.com"
  redirect(`${coreUrl}/${lang}/d`)
}
