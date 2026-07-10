"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCompanyStore } from "@workspace/console/stores/company"
import { CreateCompanyDialog } from "@workspace/console/components/dialogs/create-company-dialog"
import { CompanyAvatar } from "@workspace/console/components/shared"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@workspace/ui/components/sidebar"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  UnfoldMoreIcon,
  PlusSignIcon,
  Tick02Icon,
  Settings02Icon,
} from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"

export function TeamSwitcher() {
  const { isMobile } = useSidebar()
  const router = useRouter()
  const params = useParams()
  const t = useTranslations("nav")

  const lang = params.lang as string
  const activeCompany = useCompanyStore((s) => s.activeCompany)
  const membership = useCompanyStore((s) => s.membership)
  const companies = useCompanyStore((s) => s.companies)
  const companiesLoading = useCompanyStore((s) => s.companiesLoading)
  const companiesLoaded = useCompanyStore((s) => s.companiesLoaded)
  const fetchCompanies = useCompanyStore((s) => s.fetchCompanies)
  const [createOpen, setCreateOpen] = useState(false)

  // Settings shortcut yalnızca owner/admin için. Diğer rollerin
  // company settings'e erişimi olmaz; butonu tamamen gizliyoruz ki
  // 403/disabled state karışıklık yaratmasın.
  const canManageCompany =
    membership?.role === "owner" || membership?.role === "admin"

  useEffect(() => {
    fetchCompanies()
  }, [fetchCompanies])

  const companyName = activeCompany?.name ?? t("noCompany")

  // Aktif company store listesinde yoksa (race) basa ekle
  const list = (() => {
    if (!activeCompany) return companies
    if (companies.some((c) => c.slug === activeCompany.slug)) return companies
    return [
      {
        id: activeCompany.id,
        name: activeCompany.name,
        slug: activeCompany.slug,
        avatarUrl: activeCompany.avatarUrl ?? null,
      },
      ...companies,
    ]
  })()

  return (
    <SidebarMenu>
      <SidebarMenuItem className="group/team-switcher relative">
        {/* Hover'da beliren settings shortcut — dropdown trigger'ın
             unfold icon'unun ÜZERİNDEKİ alana absolute positioned. Trigger
             içinde nested clickable koymamak için sibling olarak yerleştirdik;
             stopPropagation ile dropdown'u açmaz, sadece settings'e gider.
             Sidebar collapsed (icon mode) iken trigger zaten dar — gizliyoruz. */}
        {canManageCompany && (
          <a
            href={`/${lang}/d/${activeCompany?.slug ?? ""}/settings`}
            onClick={(e) => e.stopPropagation()}
            aria-label={t("settings")}
            title={t("settings")}
            className={cn(
              "absolute end-2 top-1/2 z-10 -translate-y-1/2",
              "inline-flex size-6 items-center justify-center rounded-md",
              "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              // pointer-events-none default — opacity-0 ile invisible olsa
              // da DOM'da olduğu için trigger click'lerini yutabiliyordu;
              // dropdown hiç açılmazdı (bu app picker'da TeamSwitcher
              // "çalışmıyor" sebebiydi). Hover ile birlikte aktif et.
              "pointer-events-none opacity-0 transition-opacity",
              "group-hover/team-switcher:opacity-100 group-hover/team-switcher:pointer-events-auto",
              "focus-visible:opacity-100 focus-visible:pointer-events-auto",
              "group-data-[collapsible=icon]:hidden",
              !activeCompany && "pointer-events-none!",
            )}
          >
            <HugeiconsIcon
              icon={Settings02Icon}
              strokeWidth={2}
              className="size-3.5"
            />
          </a>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
              />
            }
          >
            <CompanyAvatar
              avatarUrl={activeCompany?.avatarUrl}
              name={activeCompany?.name ?? ""}
              size="md"
              rounded="lg"
              className="border-0 bg-sidebar-primary text-sidebar-primary-foreground"
            />
            <div className="grid flex-1 text-start text-sm leading-tight">
              <span className="truncate font-medium">{companyName}</span>
            </div>
            <HugeiconsIcon
              icon={UnfoldMoreIcon}
              strokeWidth={2}
              className={cn(
                "ms-auto",
                // Settings butonu hover'da aynı slot'a geliyor — UnfoldMore'u
                // gizleyip yerini ona bırak. Hover bitince geri görünür.
                canManageCompany &&
                  "group-hover/team-switcher:invisible focus-within:invisible",
              )}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {t("teams")}
              </DropdownMenuLabel>
              {!companiesLoaded && companiesLoading && list.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  {t("loading")}
                </div>
              ) : list.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  {t("noTeams")}
                </div>
              ) : (
                list.map((c) => {
                  const isActive = c.slug === activeCompany?.slug
                  return (
                    <DropdownMenuItem
                      key={c.id}
                      className={cn(
                        "gap-2 p-2",
                        isActive && "bg-muted/50",
                      )}
                      onClick={() => {
                        if (isActive) return
                        router.push(`/${lang}/d/${c.slug}`)
                      }}
                    >
                      <CompanyAvatar
                        avatarUrl={c.avatarUrl}
                        name={c.name}
                        size="sm"
                        rounded="md"
                      />
                      <span className="flex-1 truncate">{c.name}</span>
                      {isActive && (
                        <HugeiconsIcon
                          icon={Tick02Icon}
                          strokeWidth={2}
                          className="size-4 text-muted-foreground"
                        />
                      )}
                    </DropdownMenuItem>
                  )
                })
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                className="gap-2 p-2"
                onClick={(e) => {
                  // Dropdown auto-close + dialog open için event'i sıraya al;
                  // aynı tick'te modal açma çakışırsa Radix focus trap'i
                  // dropdown'la yarışıyor.
                  e.preventDefault()
                  setTimeout(() => setCreateOpen(true), 0)
                }}
              >
                <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                  <HugeiconsIcon
                    icon={PlusSignIcon}
                    strokeWidth={2}
                    className="size-4"
                  />
                </div>
                <div className="font-medium text-muted-foreground">
                  {t("addTeam")}
                </div>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>

      <CreateCompanyDialog open={createOpen} onOpenChange={setCreateOpen} />
    </SidebarMenu>
  )
}
