import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@workspace/auth/server/auth"
import { getDb } from "@workspace/db/client"
import { AppSidebar } from "@/components/app-sidebar"
import { CompanyProvider } from "@workspace/console/components/layout/company-provider"
import { RouteGuard } from "@workspace/console/components/layout/route-guard"
import { NotificationsProvider } from "@workspace/console/components/layout/notifications-provider"
import { NotificationsSheet } from "@workspace/console/components/layout/notifications-sheet"
import { CrossAppLink } from "@workspace/console/components/layout/cross-app-link"
import { DashboardAppLauncher } from "@workspace/console/components/layout/app-launcher"
import { FloatingComposeButton } from "@workspace/console/components/layout/floating-compose-button"
import { GlobalComposeMount } from "@/components/inbox/global-compose-mount"
import { MailTour } from "@/components/tour/mail-tour"
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
import { ensureMailProvisioned } from "@/lib/provision"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ "company-slug": string; lang: string }>
}): Promise<Metadata> {
  const { "company-slug": slug } = await params
  const db = await getDb()
  const company = await db.collection("companies").findOne({ slug })
  return {
    title: company?.name || "Dashboard",
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

  const session = await auth.api.getSession({
    headers: headersList,
  })

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

  let companyData: Company = {
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
    // Billing — sidebar upsell kartı abone/free ayrımını buradan okur.
    polarCustomerId: company.polarCustomerId ?? null,
    subscription: company.subscription ?? null,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
  }

  // Lazy provision — sentroyApiKey yoksa burada bir kez denenir.
  // Idempotent. Fail olursa render bloklanmaz; ileride domain/mailbox
  // çağrılarında ikinci kez denenir (`getSentroyForCompany` defansif
  // olarak da provision yapar). Mail-server slow/down'a karşı
  // dashboard'u açık tutmak öncelikli.
  if (!companyData.sentroyApiKey) {
    try {
      companyData = await ensureMailProvisioned(companyData)
    } catch (err) {
      console.warn(
        `[mail/layout] provisioning failed for ${slug}:`,
        err instanceof Error ? err.message : err,
      )
    }
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
    <CompanyProvider company={companyData} membership={memberData}>
      <RouteGuard />
      <MailTour />
      <NotificationsProvider />
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
                <CrossAppLink app="storage" />
                <DashboardAppLauncher currentAppId="mail" />
                <NotificationsSheet />
              </div>
            </div>
          </header>
          <div className="flex flex-1 flex-col p-4 pt-0">{children}</div>
        </SidebarInset>
      </SidebarProvider>
      <FloatingComposeButton isMailApp label="Compose mail" />
      <GlobalComposeMount />
    </CompanyProvider>
  )
}
