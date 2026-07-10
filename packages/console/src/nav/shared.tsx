"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  LockKeyIcon,
  UserMultipleIcon,
  Settings05Icon,
} from "@hugeicons/core-free-icons"

export interface NavItem {
  segment: string
  title: string
  url: string
  icon: React.ReactNode
  requiresDomain?: boolean
  /** Sayısal rozet (örn inbox unread count). 0 ise gizlenir. */
  badge?: number
}

/**
 * Her console app'inde aynı olan admin nav öğeleri — access-tokens, team,
 * settings. App kendi admin item'larını (mail: domains/mailboxes/webhooks,
 * storage: buckets vb.) bu listenin üstüne veya altına ekler.
 */
export function useSharedAdminItems(basePath: string): NavItem[] {
  const t = useTranslations("nav")
  return React.useMemo(
    () => [
      {
        segment: "access-tokens",
        title: t("accessTokens"),
        url: `${basePath}/access-tokens`,
        icon: <HugeiconsIcon icon={LockKeyIcon} strokeWidth={2} />,
      },
      {
        segment: "team",
        title: t("team"),
        url: `${basePath}/team`,
        icon: <HugeiconsIcon icon={UserMultipleIcon} strokeWidth={2} />,
      },
      {
        segment: "settings",
        title: t("settings"),
        url: `${basePath}/settings`,
        icon: <HugeiconsIcon icon={Settings05Icon} strokeWidth={2} />,
      },
    ],
    [basePath, t],
  )
}

/** Admin moduna otomatik geçmesi gereken paylaşılan segment'ler. */
export const SHARED_ADMIN_SEGMENTS = new Set([
  "access-tokens",
  "team",
  "settings",
])
