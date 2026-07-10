import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server/auth"
import { CompanyBillingContent } from "@/components/company/company-billing-content"
import { SentroyOS } from "@/components/os/sentroy-os"

/**
 * /d/[slug]/billing — OS modunda (SENTROY_OS=1) web dashboard'a düşmek yerine
 * OS ekranını açıp System Settings penceresini Billing sekmesinde gösterir
 * (kardeş [company-slug]/page.tsx ile aynı gate). Polar checkout başarı URL'i
 * de bu route'a döndüğünden, plan yükseltme sonrası kullanıcı OS'ta kalır —
 * web görünümüne aktarılmaz. Flag kapalıyken klasik CompanyBillingContent.
 */
export default async function CompanyBillingPage({
  params,
}: {
  params: Promise<{ "company-slug": string; lang: string }>
}) {
  const { "company-slug": slug, lang } = await params

  if (process.env.SENTROY_OS !== "1") {
    return <CompanyBillingContent slug={slug} lang={lang} />
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect(`/${lang}/login`)
  }
  const user = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
  }
  const isAdmin = (session.user as { role?: string }).role === "admin"
  return (
    <SentroyOS
      lang={lang}
      user={user}
      isAdmin={isAdmin}
      initialCompanySlug={slug}
      initialSettingsCategory="billing"
    />
  )
}
