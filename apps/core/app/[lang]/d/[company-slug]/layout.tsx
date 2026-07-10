import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { auth } from "@workspace/auth/server/auth"
import {
  companyModel,
  companyMemberModel,
} from "@workspace/db/models"
import type { CompanyMember } from "@workspace/db/types"
import { CoreCompanyDashboardShell } from "@/components/company/core-company-dashboard-shell"

export default async function CompanyDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ "company-slug": string; lang: string }>
}) {
  const { "company-slug": slug, lang } = await params

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect(`/${lang}/login`)

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
    <CoreCompanyDashboardShell
      company={company}
      membership={membership}
      memberCount={memberCount}
      lang={lang}
    >
      {children}
    </CoreCompanyDashboardShell>
  )
}
