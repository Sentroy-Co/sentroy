import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server/auth"
import { companyMemberModel } from "@workspace/db/models"

/**
 * Root locale page — session varsa kullanıcının aktif company'sinin
 * studio dashboard'una redirect. Yoksa core login'e.
 *
 * Phase 0 — landing yok. Marketing landing v2 epic'inde geliyor.
 */
export default async function LangRoot({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    const coreUrl =
      process.env.NEXT_PUBLIC_CORE_APP_URL || "https://sentroy.com"
    const studioUrl =
      process.env.NEXT_PUBLIC_STUDIO_APP_URL || "https://studio.sentroy.com"
    const callback = encodeURIComponent(`${studioUrl}/${lang}`)
    redirect(`${coreUrl}/${lang}/login?callbackUrl=${callback}`)
  }
  const memberships = await companyMemberModel.findByUser(session.user.id)
  const active = memberships.find((m) => m.status === "active")
  if (!active) {
    const coreUrl =
      process.env.NEXT_PUBLIC_CORE_APP_URL || "https://sentroy.com"
    redirect(`${coreUrl}/${lang}/d`)
  }
  // İlk active membership'in company slug'ına git — basit default; ileride
  // last-visited tracking ile geliştirilir.
  const { companyModel } = await import("@workspace/db/models")
  const company = await companyModel.findById(active.companyId)
  if (!company) {
    const coreUrl =
      process.env.NEXT_PUBLIC_CORE_APP_URL || "https://sentroy.com"
    redirect(`${coreUrl}/${lang}/d`)
  }
  redirect(`/${lang}/d/${company.slug}/studio`)
}
