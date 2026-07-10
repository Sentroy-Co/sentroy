"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  FolderLibraryIcon,
  Analytics01Icon,
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

const STORAGE_ADMIN_SEGMENTS = new Set([...SHARED_ADMIN_SEGMENTS])

export function AppSidebar(
  props: Omit<ConsoleSidebarProps, "platformItems" | "adminItems" | "adminSegments">,
) {
  const t = useTranslations("nav")
  const params = useParams()
  const companySlug = params["company-slug"] as string
  const lang = params.lang as string
  const basePath = `/${lang}/d/${companySlug}`

  const sharedAdmin = useSharedAdminItems(basePath)

  // Overview (`/usage`) artık ilk item — kullanıcı sidebar'a göz attığı
  // anda önce şirketin storage tüketimini ve trendlerini görsün, sonra
  // bucket detayına insin. `/usage` zaten root redirect hedefi olduğu
  // için sidebar sırasıyla URL davranışı uyumlu.
  const platformItems: NavItem[] = [
    {
      segment: "usage",
      title: t("usage"),
      url: `${basePath}/usage`,
      icon: <HugeiconsIcon icon={Analytics01Icon} strokeWidth={2} />,
    },
    {
      segment: "buckets",
      title: t("buckets"),
      url: `${basePath}/buckets`,
      icon: <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={2} />,
    },
  ]

  return (
    <ConsoleSidebar
      platformItems={platformItems}
      adminItems={sharedAdmin}
      adminSegments={STORAGE_ADMIN_SEGMENTS}
      {...props}
    />
  )
}
