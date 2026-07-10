"use client"

import Link from "next/link"
import { useParams, usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Mail01Icon,
  Settings02Icon,
  WorkflowSquare02Icon,
} from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Two horizontal pills sitting at the top of every page in the
 * /admin/system-mail tree. Settings holds the existing domain/from
 * configuration; Events is the new template editor.
 *
 * Two routes instead of one tabbed page so the editor stays
 * deep-linkable (admin can paste a URL to a teammate pointing straight
 * at /events) and so each page can lazy-load its own bundle.
 */
export function SystemMailTabs() {
  const t = useTranslations("systemMail")
  const params = useParams<{ lang: string }>()
  const pathname = usePathname()
  const lang = params.lang ?? "en"

  const tabs = [
    {
      id: "settings",
      label: t("tabSettings"),
      href: `/${lang}/admin/system-mail`,
      icon: Settings02Icon,
    },
    {
      id: "events",
      label: t("tabEvents"),
      href: `/${lang}/admin/system-mail/events`,
      icon: WorkflowSquare02Icon,
    },
  ] as const

  // /admin/system-mail/events* → events; everything else under
  // /admin/system-mail → settings. Trailing slashes are normalized away
  // by Next so we don't need to worry about them here.
  const activeId = pathname?.endsWith("/system-mail/events") || pathname?.includes("/system-mail/events/")
    ? "events"
    : "settings"

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <HugeiconsIcon icon={Mail01Icon} strokeWidth={2} className="size-4" />
        <span>{t("breadcrumb")}</span>
      </div>
      <nav
        className="flex w-fit items-center gap-1 rounded-xl border bg-muted/40 p-1 shadow-sm"
        aria-label={t("breadcrumb")}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeId
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <HugeiconsIcon icon={tab.icon} strokeWidth={2} className="size-3.5" />
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
