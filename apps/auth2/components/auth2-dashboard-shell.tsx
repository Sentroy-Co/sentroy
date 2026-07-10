"use client"

import { useEffect, useMemo, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  DashboardSquare01Icon,
  Key01Icon,
  ShieldUserIcon,
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
 * auth.sentroy.com dashboard shell — Sentroy Auth ürünleri için tek
 * birleşik UI. İki ana bölüm:
 *
 *   - **OAuth Clients** — "Sign in with Sentroy" federation client'ları
 *     (per-company, mevcut OAuth provider'a karşı kaydedilir)
 *   - **Auth Projects** — Sentroy üzerine end-user pool host eden
 *     uygulamalar (Firebase Auth alternatifi, Phase 2+)
 *
 * Core dashboard shell'i (`CoreCompanyDashboardShell`) mail/storage/vault
 * external app shortcut'larını taşır; auth2 shell'i bunlara yer vermez —
 * "Back to Sentroy" tek external link, kullanıcıyı core'a geri gönderir.
 *
 * Cross-subdomain better-auth cookie (`.sentroy.com`) sayesinde core
 * session'ı auth2'de aynen geçerli; ek bir login akışı yok.
 */
export function Auth2DashboardShell({
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
  const tNav = useTranslations("nav")
  const tDash = useTranslations("dashboard")
  const tApps = useTranslations("appPicker")

  useEffect(() => {
    setActiveCompany(company, membership)
  }, [company, membership, setActiveCompany])

  const basePath = `/${lang}/d/${company.slug}`
  const isOverview = pathname === basePath || pathname === `${basePath}/`
  const isOauthClients = pathname.startsWith(`${basePath}/oauth-clients`)
  const isAuthProjects = pathname.startsWith(`${basePath}/auth-projects`)

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
            <SidebarGroupLabel>{tApps("auth.name")}</SidebarGroupLabel>
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
                  tooltip="OAuth Clients"
                  isActive={isOauthClients}
                  render={<Link href={`${basePath}/oauth-clients`} />}
                >
                  <HugeiconsIcon icon={Key01Icon} strokeWidth={2} />
                  <span>OAuth Clients</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Auth Projects"
                  isActive={isAuthProjects}
                  render={<Link href={`${basePath}/auth-projects`} />}
                >
                  <HugeiconsIcon icon={ShieldUserIcon} strokeWidth={2} />
                  <span>Auth Projects</span>
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
          <DashboardAppLauncher currentAppId="auth" />
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
