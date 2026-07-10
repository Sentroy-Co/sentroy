"use client"

import { useTranslations } from "next-intl"
import { useParams } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Message01Icon,
  DashboardSquare01Icon,
  TextCreationIcon,
  UserGroupIcon,
  File01Icon,
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

const WHATSAPP_ADMIN_SEGMENTS = new Set([...SHARED_ADMIN_SEGMENTS])

export function AppSidebar(
  props: Omit<
    ConsoleSidebarProps,
    "platformItems" | "adminItems" | "adminSegments"
  >,
) {
  const t = useTranslations("nav")
  const params = useParams()
  const companySlug = params["company-slug"] as string
  const lang = params.lang as string
  const basePath = `/${lang}/d/${companySlug}`

  const sharedAdmin = useSharedAdminItems(basePath)

  const platformItems: NavItem[] = [
    {
      segment: "",
      title: t("overview"),
      url: basePath,
      icon: <HugeiconsIcon icon={DashboardSquare01Icon} strokeWidth={2} />,
    },
    {
      segment: "chats",
      title: t("chats"),
      url: `${basePath}/chats`,
      icon: <HugeiconsIcon icon={Message01Icon} strokeWidth={2} />,
    },
    {
      segment: "templates",
      title: t("templates"),
      url: `${basePath}/templates`,
      icon: <HugeiconsIcon icon={TextCreationIcon} strokeWidth={2} />,
    },
    {
      segment: "audiences",
      title: t("audiences"),
      url: `${basePath}/audiences`,
      icon: <HugeiconsIcon icon={UserGroupIcon} strokeWidth={2} />,
    },
    {
      segment: "logs",
      title: t("logs"),
      url: `${basePath}/logs`,
      icon: <HugeiconsIcon icon={File01Icon} strokeWidth={2} />,
    },
  ]

  return (
    <ConsoleSidebar
      platformItems={platformItems}
      adminItems={sharedAdmin}
      adminSegments={WHATSAPP_ADMIN_SEGMENTS}
      {...props}
    />
  )
}
