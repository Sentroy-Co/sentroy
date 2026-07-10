"use client"

import * as React from "react"
import { useParams, usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  DashboardSquare01Icon,
  ArrowLeft01Icon,
  Building06Icon,
  Home01Icon
} from "@hugeicons/core-free-icons"

import { NavMain } from "@workspace/console/components/sidebar/nav-main"
import { NavUser } from "@workspace/console/components/sidebar/nav-user"
import { TeamSwitcher } from "@workspace/console/components/sidebar/team-switcher"
import { VersionTag } from "@workspace/console/components/sidebar/version-tag"
import { SidebarUpgradeCard } from "@workspace/console/components/sidebar/upgrade-card"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
  SidebarGroupLabel,
  SidebarGroup,
} from "@workspace/ui/components/sidebar"
import { useCompanyDataStore } from "@workspace/console/stores/company-data"
import { useCompanyStore } from "@workspace/console/stores/company"
import { useSession } from "@workspace/auth/client/auth-client"
import { canAccessRoute } from "@workspace/auth/server/route-permissions"
import { AnimatePresence, motion } from "framer-motion"
import type { NavItem } from "@workspace/console/nav/shared"

export interface ConsoleSidebarProps
  extends React.ComponentProps<typeof Sidebar> {
  /**
   * App'in kendi platform nav öğeleri (mail: inbox/templates/domains,
   * storage: buckets vb.). Sidebar bunları filtreleyip yetkiye göre gösterir.
   */
  platformItems: NavItem[]
  /**
   * App'in admin öğeleri — genelde @workspace/console/nav/shared'den
   * gelen ortak öğelerle birleştirip geçirilir.
   */
  adminItems: NavItem[]
  /**
   * Admin moduna otomatik geçmesi gereken segment'ler. Ortak segment'ler
   * (access-tokens, team, settings) `SHARED_ADMIN_SEGMENTS` üzerinden gelir,
   * app kendi admin segment'lerini ekler.
   */
  adminSegments: Set<string>
  /**
   * Platform nav öğelerini, doğrulanmış domain olmadığında ne göstereceğini
   * app'in kararına bırakmak için — default true döner (hepsini göster).
   * Mail hasDomains true iken admin-only "domains/logs/webhooks/mailboxes"
   * item'larını platform listesinden gizliyor; bu hook o logic'i sağlar.
   */
  filterPlatformItem?: (item: NavItem, hasDomains: boolean) => boolean
  /**
   * Platform grubunun ÜSTÜNE render edilen app'e özel dinamik grup(lar) —
   * örn. Linear'ın takım navigasyonu (Overview grup başlığı + takım linkleri).
   * Admin modunda gösterilmez.
   */
  platformExtra?: React.ReactNode
}

export function ConsoleSidebar({
  platformItems,
  adminItems,
  adminSegments,
  filterPlatformItem,
  platformExtra,
  ...props
}: ConsoleSidebarProps) {
  const t = useTranslations("nav")
  const params = useParams()
  const pathname = usePathname()
  const companySlug = params["company-slug"] as string
  const lang = params.lang as string

  const basePath = `/${lang}/d/${companySlug}`

  // Yükseltme her zaman CORE app'in billing sayfasına gider; mail/storage
  // ayrı subdomain olduğu için absolute URL kullanırız (companyHub link'leri
  // ile aynı patern).
  const coreUrl = process.env.NEXT_PUBLIC_CORE_APP_URL || "https://sentroy.com"

  const activeCompany = useCompanyStore((s) => s.activeCompany)

  const { hasVerifiedDomain, domainsLoaded } = useCompanyDataStore()
  const hasDomains = domainsLoaded && hasVerifiedDomain

  const membership = useCompanyStore((s) => s.membership)
  const { data: session } = useSession()
  const systemRole = (session?.user as { role?: string } | undefined)?.role

  const isAdminUser =
    systemRole === "admin" ||
    membership?.role === "owner" ||
    membership?.role === "admin"

  const activeSegment = React.useMemo(() => {
    const prefix = `${basePath}/`
    if (!pathname.startsWith(prefix)) return ""
    return pathname.slice(prefix.length).split("/")[0] || ""
  }, [pathname, basePath])

  const [adminMode, setAdminMode] = React.useState(false)

  React.useEffect(() => {
    if (adminSegments.has(activeSegment) && isAdminUser) {
      setAdminMode(true)
    }
  }, [activeSegment, isAdminUser, adminSegments])

  const filteredAdminItems = adminItems.filter((item) =>
    canAccessRoute(membership, item.segment, systemRole),
  )
  const navItems = React.useMemo(() => {
    return platformItems.filter((item) => {
      if (item.requiresDomain && !hasDomains) return false
      if (filterPlatformItem && !filterPlatformItem(item, hasDomains)) return false
      return canAccessRoute(membership, item.segment, systemRole)
    })
  }, [platformItems, membership, systemRole, hasDomains, filterPlatformItem])

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher />
      </SidebarHeader>
      <SidebarContent>
        {/* Cross-app: aktif şirketin core uygulamasındaki profil/feed
            sayfasına dış link. mail ve storage app'leri kendi alt
            domain'lerinde çalıştığı için Next router yerine doğrudan
            absolute URL ile gidiyoruz. Sidebar collapsed olunca tooltip
            yine doğru metni gösteriyor. */}
        {companySlug ? (
          <SidebarGroup>
            <SidebarGroupLabel>{t("companyHub")}</SidebarGroupLabel>

            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip={t("dashboard")}
                  render={
                    <a
                      href={`${
                        process.env.NEXT_PUBLIC_CORE_APP_URL ||
                        "https://sentroy.com"
                      }/${lang}/d`}
                    />
                  }
                >
                  <HugeiconsIcon icon={Home01Icon} strokeWidth={2} />
                  <span>{t("dashboard")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip={t("companyProfile")}
                  render={
                    <a
                      href={`${
                        process.env.NEXT_PUBLIC_CORE_APP_URL ||
                        "https://sentroy.com"
                      }/${lang}/d/${companySlug}`}
                    />
                  }
                >
                  <HugeiconsIcon icon={Building06Icon} strokeWidth={2} />
                  <span>{t("companyProfile")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        ) : null}
        {adminMode ? (
          <>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip={t("backToApp")}
                  onClick={() => setAdminMode(false)}
                  className="text-muted-foreground"
                >
                  <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
                  <span>{t("backToApp")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarSeparator />
            <NavMain items={filteredAdminItems} label={t("administration")} />
          </>
        ) : (
          <>
            {platformExtra}
            <NavMain items={navItems} label={t("platform")} />
            {isAdminUser && (
              <SidebarGroup>
                <SidebarGroupLabel>{t("administration")}</SidebarGroupLabel>
                <SidebarMenu>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={t("administration")}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                    >
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          tooltip={t("admin")}
                          onClick={() => setAdminMode(true)}
                        >
                          <HugeiconsIcon
                            icon={DashboardSquare01Icon}
                            strokeWidth={2}
                          />
                          <span>{t("admin")}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </motion.div>
                  </AnimatePresence>
                </SidebarMenu>
              </SidebarGroup>
            )}
          </>
        )}
      </SidebarContent>
      <SidebarFooter>
        {activeCompany && companySlug ? (
          <SidebarUpgradeCard
            company={activeCompany}
            billingHref={`${coreUrl}/${lang}/d/${companySlug}/billing`}
          />
        ) : null}
        <NavUser />
        <VersionTag />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
