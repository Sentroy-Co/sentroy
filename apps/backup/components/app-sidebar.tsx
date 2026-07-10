"use client"

import { useTranslations } from "next-intl"
import { useParams } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import { DatabaseIcon } from "@hugeicons/core-free-icons"

import {
  ConsoleSidebar,
  type ConsoleSidebarProps,
} from "@workspace/console/components/sidebar/app-sidebar"
import {
  useSharedAdminItems,
  SHARED_ADMIN_SEGMENTS,
  type NavItem,
} from "@workspace/console/nav/shared"

/**
 * MongoDB Backuper sidebar. Tek-ekran ürün (bağlantılar + yedekler aynı
 * sayfada tab'larla) — OS embed'de sidebar zaten gizli ([data-embedded]),
 * bu sidebar yalnız standalone erişimde görünür. Admin nav paylaşımlı.
 */
export function AppSidebar(
  props: Omit<
    ConsoleSidebarProps,
    "platformItems" | "adminItems" | "adminSegments"
  >,
) {
  const t = useTranslations("backup")
  const params = useParams()
  const companySlug = params["company-slug"] as string
  const lang = params.lang as string
  const basePath = `/${lang}/d/${companySlug}`

  const sharedAdmin = useSharedAdminItems(basePath)

  const platformItems: NavItem[] = [
    {
      segment: "",
      title: t("nav.backups"),
      url: basePath,
      icon: <HugeiconsIcon icon={DatabaseIcon} strokeWidth={2} />,
    },
  ]

  return (
    <ConsoleSidebar
      {...props}
      platformItems={platformItems}
      adminItems={sharedAdmin}
      adminSegments={SHARED_ADMIN_SEGMENTS}
    />
  )
}
