"use client"

import { useEffect, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  DashboardSquare01Icon,
  ChartBarLineIcon,
} from "@hugeicons/core-free-icons"
import { useCompanyStore } from "@workspace/console/stores/company"
import { TeamSwitcher } from "@workspace/console/components/sidebar/team-switcher"
import { NavUser } from "@workspace/console/components/sidebar/nav-user"
import { VersionTag } from "@workspace/console/components/sidebar/version-tag"
import { SidebarUpgradeCard } from "@workspace/console/components/sidebar/upgrade-card"
import { DashboardAppLauncher } from "@workspace/console/components/layout/app-launcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
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

/**
 * status.sentroy.com dashboard shell — auth2 pattern, sidebar'da yalnız
 * tek "Status Page" entry. Phase 5+'ta incident, maintenance, subscribers,
 * restart-targets ek menu item'ları eklenir.
 */
export function StatusDashboardShell({
  company,
  membership,
  lang,
  children,
}: {
  company: Company
  membership: CompanyMember
  lang: string
  children: ReactNode
}) {
  const setActiveCompany = useCompanyStore((s) => s.setActiveCompany)
  const pathname = usePathname()
  const tNav = useTranslations("nav")
  const tDash = useTranslations("dashboard")
  const tApps = useTranslations("appPicker")

  useEffect(() => {
    setActiveCompany(company, membership)
  }, [company, membership, setActiveCompany])

  const basePath = `/${lang}/d/${company.slug}`
  const isOverview = pathname === basePath || pathname === `${basePath}/`
  const isStatusPage = pathname.startsWith(`${basePath}/status`)

  const coreUrl =
    process.env.NEXT_PUBLIC_CORE_APP_URL || "https://sentroy.com"

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <TeamSwitcher />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Status</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip={tDash("overview")}
                  isActive={isOverview}
                  render={<Link href={basePath} />}
                >
                  <HugeiconsIcon
                    icon={DashboardSquare01Icon}
                    strokeWidth={2}
                  />
                  <span>{tDash("overview")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Status Page"
                  isActive={isStatusPage}
                  render={<Link href={`${basePath}/status`} />}
                >
                  <HugeiconsIcon icon={ChartBarLineIcon} strokeWidth={2} />
                  <span>Status Page</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip={tNav("teams")}
                  render={<a href={`${coreUrl}/${lang}/d/${company.slug}`} />}
                >
                  <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
                  <span>{tApps("title")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarUpgradeCard
            company={company}
            billingHref={`${coreUrl}/${lang}/d/${company.slug}/billing`}
          />
          <NavUser />
          <VersionTag />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ms-1" />
          <Separator orientation="vertical" className="me-2 h-4" />
          <Breadcrumb className="flex-1">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage className="truncate">
                  {company.name}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <DashboardAppLauncher currentAppId="status" />
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
