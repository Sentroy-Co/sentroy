"use client"

import { useEffect, useMemo, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  DashboardSquare01Icon,
  HeadphonesIcon,
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
 * Sentroy Studio dashboard shell.
 *
 * Sadece dashboard route'ları (proje listesi) bu shell'i alır. Editor
 * (`/{lang}/p/{projectId}`) shell'in dışında — header + sidebar tamamen
 * gizli, full-screen DJ deck UI. Editor'dan dashboard'a dönülünce shell
 * tekrar görünür.
 */
export function StudioDashboardShell({
  company,
  membership,
  memberCount,
  lang,
  children,
}: {
  company: Company
  membership: CompanyMember
  memberCount: number
  lang: string
  children: ReactNode
}) {
  const setActiveCompany = useCompanyStore((s) => s.setActiveCompany)
  const pathname = usePathname()
  const tApps = useTranslations("appPicker")
  const tDash = useTranslations("dashboard")

  useEffect(() => {
    setActiveCompany(company, membership)
  }, [company, membership, setActiveCompany])

  const basePath = `/${lang}/d/${company.slug}/studio`
  const isOverview = pathname === basePath || pathname === `${basePath}/`

  const coreUrl =
    process.env.NEXT_PUBLIC_CORE_APP_URL || "https://sentroy.com"

  const _ctx = useMemo(
    () => ({ company, membership, memberCount }),
    [company, membership, memberCount],
  )

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <TeamSwitcher />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{tApps("studio.name")}</SidebarGroupLabel>
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
                  <span>Projects</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip={tApps("title")}
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
                <BreadcrumbPage className="truncate flex items-center gap-2">
                  <HugeiconsIcon icon={HeadphonesIcon} size={14} />
                  {company.name}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <DashboardAppLauncher currentAppId="studio" />
        </header>
        <div className="relative flex flex-1 flex-col gap-4 overflow-hidden p-4 pt-4">
          {/* OS-tarzı ambient gradient — flat görünümü kırar. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(60% 55% at 15% -5%, rgba(236,72,153,0.10), transparent 60%), radial-gradient(55% 50% at 95% 0%, rgba(34,211,238,0.09), transparent 60%), radial-gradient(70% 60% at 50% 120%, rgba(139,92,246,0.07), transparent 60%)",
            }}
          />
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
