import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@workspace/auth/server/auth"
import { getDb } from "@workspace/db/client"
import { AppSidebar } from "@/components/app-sidebar"
import { CompanyProvider } from "@workspace/console/components/layout/company-provider"
import { RouteGuard } from "@workspace/console/components/layout/route-guard"
import { DashboardAppLauncher } from "@workspace/console/components/layout/app-launcher"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"
import { Separator } from "@workspace/ui/components/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@workspace/ui/components/breadcrumb"
import type { Company, CompanyMember } from "@workspace/db/types"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ "company-slug": string; lang: string }>
}): Promise<Metadata> {
  const { "company-slug": slug } = await params
  const db = await getDb()
  const company = await db.collection("companies").findOne({ slug })
  return {
    title: company?.name || "WhatsApp Santral",
  }
}

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ "company-slug": string; lang: string }>
}) {
  const { "company-slug": slug } = await params
  const headersList = await headers()

  const session = await auth.api.getSession({ headers: headersList })
  if (!session) {
    notFound()
  }

  const db = await getDb()

  const company = (await db
    .collection("companies")
    .findOne({ slug })) as (Company & { _id: any }) | null

  if (!company) {
    notFound()
  }

  const companyId = company._id.toString()

  const member = (await db.collection("company_members").findOne({
    companyId,
    userId: session.user.id,
    status: "active",
  })) as (CompanyMember & { _id: any }) | null

  if (!member && session.user.role !== "admin") {
    notFound()
  }

  const companyData: Company = {
    id: companyId,
    name: company.name,
    slug: company.slug,
    ownerId: company.ownerId,
    planId: company.planId,
    mailStorageLimit: company.mailStorageLimit,
    mailStorageUsed: company.mailStorageUsed,
    maxDomains: company.maxDomains,
    maxMembers: company.maxMembers,
    maxMailboxes: company.maxMailboxes,
    maxContacts: company.maxContacts,
    trashRetentionDays: company.trashRetentionDays,
    monthlyEmailLimit: company.monthlyEmailLimit,
    monthlyEmailsSent: company.monthlyEmailsSent,
    sentroyApiKey: company.sentroyApiKey,
    avatarUrl: company.avatarUrl ?? null,
    polarCustomerId: company.polarCustomerId ?? null,
    subscription: company.subscription ?? null,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
  }

  const memberData: CompanyMember = member
    ? {
        id: member._id.toString(),
        companyId,
        userId: member.userId,
        role: member.role,
        status: member.status,
        permissions: member.permissions,
        joinedAt: member.joinedAt,
        updatedAt: member.updatedAt,
      }
    : {
        id: "system-admin",
        companyId,
        userId: session.user.id,
        role: "owner",
        status: "active",
        permissions: [],
        joinedAt: new Date(),
        updatedAt: new Date(),
      }

  return (
    <CompanyProvider
      company={companyData}
      membership={memberData}
      fetchDomains={false}
    >
      <RouteGuard />
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
            <div className="flex flex-1 items-center gap-2 px-4">
              <SidebarTrigger className="-ms-1" />
              <Separator
                orientation="vertical"
                className="me-2 data-vertical:h-4 data-vertical:self-auto"
              />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbPage>{company.name}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <div className="ms-auto flex items-center gap-1">
                <DashboardAppLauncher currentAppId="whatsapp" />
              </div>
            </div>
          </header>
          <div className="flex flex-1 flex-col p-4 pt-0">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </CompanyProvider>
  )
}
