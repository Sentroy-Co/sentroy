"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  DashboardSquare01Icon,
  Settings05Icon,
  Mail01Icon,
  FolderLibraryIcon,
  ShieldUserIcon,
  KeyIcon,
  Wallet01Icon,
  Store01Icon,
} from "@hugeicons/core-free-icons"
import { useSession } from "@workspace/auth/client/auth-client"
import { useCompanyStore } from "@workspace/console/stores/company"
import { TeamSwitcher } from "@workspace/console/components/sidebar/team-switcher"
import {
  canAccessRoute,
  hasAnyMailAccessClient,
  hasAnyStorageAccessClient,
} from "@workspace/auth/server/route-permissions"
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
  SidebarSeparator,
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

export type CompanyDashboardLayoutValue = {
  company: Company
  membership: CompanyMember
  memberCount: number
}

const CompanyDashboardContext =
  createContext<CompanyDashboardLayoutValue | null>(null)

export function useCompanyDashboard(): CompanyDashboardLayoutValue {
  const v = useContext(CompanyDashboardContext)
  if (!v) {
    throw new Error("useCompanyDashboard must be used within CoreCompanyDashboardShell")
  }
  return v
}

export function CoreCompanyDashboardShell({
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
  const tDash = useTranslations("dashboard")
  const tNav = useTranslations("nav")
  const tApps = useTranslations("appPicker")
  // Suppressing unused-var warning for tSocial → kaldırıldı; feed
  // entry sidebar'dan çıkarıldı, social başlığı sadece feed
  // section'ında kullanılıyordu.
  const { data: session } = useSession()
  const systemRole = (session?.user as { role?: string } | undefined)?.role
  const isAdmin = systemRole === "admin"
  // Sidebar item visibility — yetki yokken link hiç render edilmesin.
  // canAccessRoute("settings") = owner/admin/system-admin (settings: null
  // owner-only). hasAnyMail/Storage cross-app shortcut'lar için inclusive
  // check; member spesifik permission'a sahipse görür.
  const canSettings = canAccessRoute(membership, "settings", systemRole)
  const canMail = hasAnyMailAccessClient(membership, systemRole)
  const canStorage = hasAnyStorageAccessClient(membership, systemRole)
  const mailUrl =
    process.env.NEXT_PUBLIC_MAIL_APP_URL || "https://mail.sentroy.com"
  const storageUrl =
    process.env.NEXT_PUBLIC_STORAGE_APP_URL || "https://storage.sentroy.com"
  const vaultUrl =
    process.env.NEXT_PUBLIC_VAULT_APP_URL || "https://vault.sentroy.com"
  const authUrl =
    process.env.NEXT_PUBLIC_AUTH_APP_URL || "https://auth.sentroy.com"
  // Vault yetkisi: şu an owner/admin only (env-vault end-user için
  // sensitive — secret'lar tutulur, member'a default yok). Ileride
  // member'a granular access açılabilir.
  const canVault =
    isAdmin ||
    membership.role === "owner" ||
    membership.role === "admin"
  // OAuth client management — aynı policy: owner/admin only. client_secret
  // hassas, member'a default yok.
  const canAuth = canVault
  // App Store geliştirici konsolu — app-store.manage (owner/admin bypass).
  const canApps = canAccessRoute(membership, "apps", systemRole)

  useEffect(() => {
    setActiveCompany(company, membership)
  }, [company, membership, setActiveCompany])

  const basePath = `/${lang}/d/${company.slug}`
  const isOverview = pathname === basePath || pathname === `${basePath}/`
  const isSettings = pathname.startsWith(`${basePath}/settings`)
  const isBilling = pathname.startsWith(`${basePath}/billing`)

  const ctx = useMemo(
    () => ({ company, membership, memberCount }),
    [company, membership, memberCount],
  )

  return (
    <CompanyDashboardContext.Provider value={ctx}>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            {/* Team switcher sidebar header'da — kullanıcı sidebar üstünden
                aktif şirketi görür ve bir tıkla başka şirkete geçer.
                Önceki sürümde burada statik şirket logosu vardı (link
                mevcut sayfaya, işlevsiz); switcher mail/storage app'lerinin
                pattern'iyle de uyumlu. */}
            <TeamSwitcher />
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>{tDash("title")}</SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip={tDash("overview")}
                    isActive={isOverview}
                    render={<Link href={basePath} />}
                  >
                    <HugeiconsIcon icon={DashboardSquare01Icon} strokeWidth={2} />
                    <span>{tDash("overview")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {canSettings ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip={tNav("settings")}
                      isActive={isSettings}
                      render={<Link href={`${basePath}/settings`} />}
                    >
                      <HugeiconsIcon icon={Settings05Icon} strokeWidth={2} />
                      <span>{tNav("settings")}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                {canSettings ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip={tNav("billing")}
                      isActive={isBilling}
                      render={<Link href={`${basePath}/billing`} />}
                    >
                      <HugeiconsIcon icon={Wallet01Icon} strokeWidth={2} />
                      <span>{tNav("billing")}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
              </SidebarMenu>
            </SidebarGroup>
            {/* Apps — cross-subdomain shortcuts to mail/storage (and
                admin for elevated users). External links so the user
                hops out of the core dashboard into the dedicated app
                shell. Erişim yetkisi olmayan link'ler hiç render
                edilmez — kullanıcının "permission denied" toast'ı
                görmesinin kaynağını proaktif olarak elimine eder. Hiçbir
                app'e erişim yoksa group başlığı bile gizli (gürültü). */}
            {canMail || canStorage || canVault || canAuth || isAdmin ? (
              <SidebarGroup>
                <SidebarGroupLabel>{tApps("title")}</SidebarGroupLabel>
                <SidebarMenu>
                  {canMail ? (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        tooltip={tApps("mail.name")}
                        render={
                          <a href={`${mailUrl}/${lang}/d/${company.slug}`} />
                        }
                      >
                        <HugeiconsIcon icon={Mail01Icon} strokeWidth={2} />
                        <span>{tApps("mail.name")}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ) : null}
                  {canStorage ? (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        tooltip={tApps("storage.name")}
                        render={
                          <a href={`${storageUrl}/${lang}/d/${company.slug}`} />
                        }
                      >
                        <HugeiconsIcon
                          icon={FolderLibraryIcon}
                          strokeWidth={2}
                        />
                        <span>{tApps("storage.name")}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ) : null}
                  {canVault ? (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        tooltip={tApps("vault.name")}
                        render={
                          <a href={`${vaultUrl}/${lang}/d/${company.slug}`} />
                        }
                      >
                        <HugeiconsIcon icon={KeyIcon} strokeWidth={2} />
                        <span>{tApps("vault.name")}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ) : null}
                  {canAuth ? (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        tooltip={tApps("auth.name")}
                        render={
                          <a href={`${authUrl}/${lang}/d/${company.slug}`} />
                        }
                      >
                        <HugeiconsIcon icon={ShieldUserIcon} strokeWidth={2} />
                        <span>{tApps("auth.name")}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ) : null}
                  {canApps ? (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        tooltip="App Store"
                        render={<Link href={`${basePath}/apps`} />}
                      >
                        <HugeiconsIcon icon={Store01Icon} strokeWidth={2} />
                        <span>App Store</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ) : null}
                  {isAdmin ? (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        tooltip={tApps("admin.name")}
                        render={<Link href={`/${lang}/admin`} />}
                      >
                        <HugeiconsIcon icon={ShieldUserIcon} strokeWidth={2} />
                        <span>{tApps("admin.name")}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ) : null}
                </SidebarMenu>
              </SidebarGroup>
            ) : null}
            <SidebarGroup>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip={tNav("teams")}
                    render={<Link href={`/${lang}/d`} />}
                  >
                    <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
                    <span>{tNav("teams")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarUpgradeCard
              company={company}
              billingHref={`${basePath}/billing`}
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
            {/* Breadcrumb header'ı dolduruyor; TeamSwitcher artık
                SidebarHeader'da, header sağ tarafı temiz kaldı (ileride
                global search / notification bell vb. için yer açık). */}
            <Breadcrumb className="flex-1">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage className="truncate">{company.name}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            {/* Pathname-aware current-app: vault subroute aktifken launcher
                vault'u üstte açar; aksi halde "core" (Sentroy ana). */}
            <DashboardAppLauncher
              currentAppId={
                pathname?.endsWith(`/d/${company.slug}/vault`) ? "vault" : "core"
              }
              permissions={{
                canMail,
                canStorage,
                canVault,
                canAuth,
                isAdmin,
              }}
            />
          </header>
          <div className="flex flex-1 flex-col gap-4 p-4 pt-4">{children}</div>
        </SidebarInset>
      </SidebarProvider>
      {/* Floating "Compose mail" FAB core'dan kaldırıldı — yalnız mail
          app'inde görünür (apps/mail dashboard layout'unda mount). */}
    </CompanyDashboardContext.Provider>
  )
}
