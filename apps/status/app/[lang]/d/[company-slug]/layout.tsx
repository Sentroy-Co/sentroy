import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { auth } from "@workspace/auth/server/auth"
import { companyModel, companyMemberModel } from "@workspace/db/models"
import type { CompanyMember } from "@workspace/db/types"
import { StatusDashboardShell } from "@/components/status-dashboard-shell"

/**
 * status.sentroy.com `/[lang]/d/[company-slug]` dashboard layout.
 *
 * auth2 pattern'iyle aynı: session check + member check + shell.
 * Cross-subdomain better-auth cookie ile core/mail/storage/auth2 ile
 * aynı oturum paylaşılır.
 */
export default async function StatusCompanyDashboardLayout({
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
    const statusUrl =
      process.env.NEXT_PUBLIC_STATUS_APP_URL || "https://status.sentroy.com"
    const callback = encodeURIComponent(`${statusUrl}/${lang}/d/${slug}`)
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

  return (
    <StatusDashboardShell
      company={company}
      membership={membership}
      lang={lang}
    >
      {children}
    </StatusDashboardShell>
  )
}
