"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  InternetIcon,
  Mailbox01Icon,
  TextCreationIcon,
  InboxIcon,
  UserGroupIcon,
  File01Icon,
  WebhookIcon,
  ShieldBanIcon,
  MailValidation01Icon,
  AnalyticsUpIcon,
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
import { useNotificationsStore } from "@workspace/console/stores/notifications"

/** Mail-spesifik admin segment'leri — admin moduna otomatik geçiş + compose
 * FAB'ının bu sayfalarda gizlenmesi için (layout `hideOnSegments`). */
export const MAIL_ADMIN_SEGMENTS = new Set([
  ...SHARED_ADMIN_SEGMENTS,
  "domains",
  "mailboxes",
  "logs",
  "webhooks",
])

export function AppSidebar(
  props: Omit<ConsoleSidebarProps, "platformItems" | "adminItems" | "adminSegments">,
) {
  const t = useTranslations("nav")
  const params = useParams()
  const companySlug = params["company-slug"] as string
  const lang = params.lang as string
  const basePath = `/${lang}/d/${companySlug}`

  const sharedAdmin = useSharedAdminItems(basePath)
  const inboxUnread = useNotificationsStore((s) => s.inboxUnreadCount)

  const platformItems: NavItem[] = [
    {
      segment: "inbox",
      title: t("inbox"),
      url: `${basePath}/inbox`,
      icon: <HugeiconsIcon icon={InboxIcon} strokeWidth={2} />,
      requiresDomain: true,
      badge: inboxUnread,
    },
    {
      segment: "templates",
      title: t("templates"),
      url: `${basePath}/templates`,
      icon: <HugeiconsIcon icon={TextCreationIcon} strokeWidth={2} />,
      requiresDomain: true,
    },
    {
      segment: "validate",
      title: t("validate"),
      url: `${basePath}/validate`,
      icon: <HugeiconsIcon icon={MailValidation01Icon} strokeWidth={2} />,
      requiresDomain: true,
    },
    {
      segment: "domains",
      title: t("domains"),
      url: `${basePath}/domains`,
      icon: <HugeiconsIcon icon={InternetIcon} strokeWidth={2} />,
    },
    {
      segment: "audience",
      title: t("audience"),
      url: `${basePath}/audience`,
      icon: <HugeiconsIcon icon={UserGroupIcon} strokeWidth={2} />,
      requiresDomain: true,
    },
    {
      segment: "logs",
      title: t("logs"),
      url: `${basePath}/logs`,
      icon: <HugeiconsIcon icon={File01Icon} strokeWidth={2} />,
      requiresDomain: true,
    },
    {
      segment: "analytics",
      title: t("analytics"),
      url: `${basePath}/analytics`,
      icon: <HugeiconsIcon icon={AnalyticsUpIcon} strokeWidth={2} />,
      requiresDomain: true,
    },
    {
      segment: "webhooks",
      title: t("webhooks"),
      url: `${basePath}/webhooks`,
      icon: <HugeiconsIcon icon={WebhookIcon} strokeWidth={2} />,
      requiresDomain: true,
    },
    {
      segment: "suppressions",
      title: t("suppressions"),
      url: `${basePath}/suppressions`,
      icon: <HugeiconsIcon icon={ShieldBanIcon} strokeWidth={2} />,
      requiresDomain: true,
    },
  ]

  const mailAdminItems: NavItem[] = [
    {
      segment: "domains",
      title: t("domains"),
      url: `${basePath}/domains`,
      icon: <HugeiconsIcon icon={InternetIcon} strokeWidth={2} />,
    },
    {
      segment: "mailboxes",
      title: t("mailboxes"),
      url: `${basePath}/mailboxes`,
      icon: <HugeiconsIcon icon={Mailbox01Icon} strokeWidth={2} />,
      requiresDomain: true,
    },
    {
      segment: "logs",
      title: t("logs"),
      url: `${basePath}/logs`,
      icon: <HugeiconsIcon icon={File01Icon} strokeWidth={2} />,
      requiresDomain: true,
    },
    {
      segment: "webhooks",
      title: t("webhooks"),
      url: `${basePath}/webhooks`,
      icon: <HugeiconsIcon icon={WebhookIcon} strokeWidth={2} />,
      requiresDomain: true,
    },
  ]

  const adminItems = [...sharedAdmin, ...mailAdminItems]

  // Domains doğrulanmışsa, platform listesinden admin-only item'ları gizle
  // (eski AppSidebar davranışını korumak için)
  const filterPlatformItem = React.useCallback(
    (item: NavItem, hasDomains: boolean) => {
      if (
        hasDomains &&
        ["domains", "logs", "webhooks", "mailboxes"].includes(item.segment)
      )
        return false
      return true
    },
    [],
  )

  return (
    <ConsoleSidebar
      platformItems={platformItems}
      adminItems={adminItems}
      adminSegments={MAIL_ADMIN_SEGMENTS}
      filterPlatformItem={filterPlatformItem}
      {...props}
    />
  )
}
