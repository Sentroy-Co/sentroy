"use client"

import { useTranslations } from "next-intl"
import { useParams } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Analytics01Icon,
  DashboardSquare01Icon,
  InboxIcon,
  PlugSocketIcon,
  TaskAdd01Icon,
} from "@hugeicons/core-free-icons"

import {
  ConsoleSidebar,
  type ConsoleSidebarProps,
} from "@workspace/console/components/sidebar/app-sidebar"
import {
  useSharedAdminItems,
  SHARED_ADMIN_SEGMENTS,
  type NavItem,
} from "@workspace/console/nav/shared"
import { useUiFlags } from "@/lib/ui-flags-context"
import { TeamNavGroup } from "@/components/team-nav-group"

const LINEAR_ADMIN_SEGMENTS = new Set([
  ...SHARED_ADMIN_SEGMENTS,
  "linear-settings",
  "metrics",
])

export function AppSidebar(
  props: Omit<
    ConsoleSidebarProps,
    "platformItems" | "adminItems" | "adminSegments"
  >,
) {
  const t = useTranslations("nav")
  const params = useParams()
  const { groupByTeam } = useUiFlags()
  const companySlug = params["company-slug"] as string
  const lang = params.lang as string
  const basePath = `/${lang}/d/${companySlug}`

  const sharedAdmin = useSharedAdminItems(basePath)

  // groupByTeam açıkken overview, TeamNavGroup'a devrolur (grup başlığı +
  // takım linkleri + backlog rozetleri) — platform listesinde tekrarlanmaz.
  const platformItems: NavItem[] = [
    ...(groupByTeam
      ? []
      : [
          {
            segment: "",
            title: t("overview"),
            url: basePath,
            icon: <HugeiconsIcon icon={DashboardSquare01Icon} strokeWidth={2} />,
          } satisfies NavItem,
        ]),
    {
      segment: "requests",
      title: t("requests"),
      url: `${basePath}/requests`,
      icon: <HugeiconsIcon icon={InboxIcon} strokeWidth={2} />,
    },
    {
      segment: "tasks",
      title: t("newTask"),
      url: `${basePath}/tasks/new`,
      icon: <HugeiconsIcon icon={TaskAdd01Icon} strokeWidth={2} />,
    },
  ]

  const adminItems: NavItem[] = [
    ...sharedAdmin,
    // Metrics yönetim grubunda — admin/linear.manage dışındakiler erişemez
    // (ROUTE_PERMISSIONS "metrics" → linear.manage; RouteGuard sayfayı da korur).
    {
      segment: "metrics",
      title: t("metrics"),
      url: `${basePath}/metrics`,
      icon: <HugeiconsIcon icon={Analytics01Icon} strokeWidth={2} />,
    },
    {
      segment: "linear-settings",
      title: t("linearSettings"),
      url: `${basePath}/linear-settings`,
      icon: <HugeiconsIcon icon={PlugSocketIcon} strokeWidth={2} />,
    },
  ]

  return (
    <ConsoleSidebar
      platformItems={platformItems}
      adminItems={adminItems}
      adminSegments={LINEAR_ADMIN_SEGMENTS}
      platformExtra={groupByTeam ? <TeamNavGroup basePath={basePath} /> : undefined}
      {...props}
    />
  )
}
