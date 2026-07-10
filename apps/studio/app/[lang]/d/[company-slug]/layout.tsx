import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { auth } from "@workspace/auth/server/auth"
import { companyModel, companyMemberModel } from "@workspace/db/models"
import type { CompanyMember } from "@workspace/db/types"
import { StudioDashboardShell } from "@/components/studio-dashboard-shell"

/**
 * studio.sentroy.com `/[lang]/d/[company-slug]` dashboard layout.
 *
 * Session check: yoksa core'un login sayfasına yönlendir (cross-subdomain
 * cookie sayesinde aynı better-auth session her iki app'te paylaşılır).
 *
 * Editor route'u (`/[lang]/p/[projectId]`) bu layout'un dışında — header
 * + sidebar gizli, full-screen DJ deck. Çıkıldığında bu shell tekrar görünür.
 */
export default async function StudioDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ "company-slug": string; lang: string }>
}) {
  const { "company-slug": slug, lang } = await params

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    const coreUrl =
      process.env.NEXT_PUBLIC_CORE_APP_URL || "https://sentroy.com"
    const studioUrl =
      process.env.NEXT_PUBLIC_STUDIO_APP_URL || "https://studio.sentroy.com"
    const callback = encodeURIComponent(`${studioUrl}/${lang}/d/${slug}/studio`)
    redirect(`${coreUrl}/${lang}/login?callbackUrl=${callback}`)
  }

  const company = await companyModel.findBySlug(slug)
  if (!company) notFound()

  const member = await companyMemberModel.findByCompanyAndUser(
    company.id,
    session.user.id,
  )
  const isSystemAdmin = (session.user as { role?: string }).role === "admin"
  if (!member && !isSystemAdmin) notFound()

  const membership: CompanyMember =
    member ??
    ({
      id: "system-admin",
      companyId: company.id,
      userId: session.user.id,
      role: "owner",
      status: "active",
      permissions: [],
      joinedAt: new Date(),
      updatedAt: new Date(),
    } satisfies CompanyMember)

  const allMembers = await companyMemberModel.findByCompany(company.id)
  const memberCount = allMembers.filter((m) => m.status === "active").length

  return (
    <StudioDashboardShell
      company={company}
      membership={membership}
      memberCount={memberCount}
      lang={lang}
    >
      {children}
    </StudioDashboardShell>
  )
}
