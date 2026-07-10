"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { formatDistanceToNow } from "date-fns"
import { motion, AnimatePresence } from "framer-motion"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  TimeScheduleIcon,
  UserAdd01Icon,
  UserRemove01Icon,
  PencilEdit01Icon,
  Mail01Icon,
  Cancel01Icon,
  Tick02Icon,
  ImageUpload01Icon,
  KeyIcon,
} from "@hugeicons/core-free-icons"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"

interface AuditEntry {
  id: string
  userId: string
  action: string
  resource: string
  resourceId?: string
  details: Record<string, unknown>
  ipAddress?: string
  createdAt: string
  user: { name: string | null; email: string | null } | null
}

const ACTION_ICON: Record<
  string,
  { icon: typeof PencilEdit01Icon; tint: string }
> = {
  "company.update": {
    icon: PencilEdit01Icon,
    tint: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  "avatar.upload": {
    icon: ImageUpload01Icon,
    tint: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400",
  },
  "avatar.remove": {
    icon: ImageUpload01Icon,
    tint: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  },
  "member.update": {
    icon: PencilEdit01Icon,
    tint: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  "member.remove": {
    icon: UserRemove01Icon,
    tint: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
  "invitation.create": {
    icon: Mail01Icon,
    tint: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  "invitation.revoke": {
    icon: Cancel01Icon,
    tint: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  },
  "invitation.accept": {
    icon: Tick02Icon,
    tint: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  "passkey.register": {
    icon: KeyIcon,
    tint: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  "passkey.delete": {
    icon: KeyIcon,
    tint: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  },
  default: {
    icon: UserAdd01Icon,
    tint: "bg-muted text-muted-foreground",
  },
}

function formatTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return iso
  }
}

function actionTitle(action: string, details: Record<string, unknown>): string {
  // Basit human-readable map; gerek görüldüğünde i18n key'lere bağlanır.
  switch (action) {
    case "company.update":
      return Object.keys(details).join(", ") || "Company updated"
    case "avatar.upload":
      return "Avatar uploaded"
    case "avatar.remove":
      return "Avatar removed"
    case "member.update": {
      const role = details.role as string | undefined
      const status = details.status as string | undefined
      if (status) return `Member ${status}`
      if (role) return `Role → ${role}`
      return "Member updated"
    }
    case "member.remove":
      return "Member removed"
    case "invitation.create": {
      const email = details.email as string | undefined
      const role = details.role as string | undefined
      return `Invited ${email ?? "?"} as ${role ?? "?"}`
    }
    case "invitation.revoke": {
      const email = details.email as string | undefined
      return `Revoked invite for ${email ?? "?"}`
    }
    case "invitation.accept":
      return "Invitation accepted"
    case "passkey.register":
      return `Passkey added${details.name ? `: ${String(details.name)}` : ""}`
    case "passkey.delete":
      return "Passkey removed"
    default:
      return action
  }
}

export function AuditTimelineCard() {
  const t = useTranslations("settings")
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]

  const [items, setItems] = useState<AuditEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/companies/${slug}/audit?limit=100`)
        const json = await res.json()
        if (cancelled) return
        if (!res.ok) {
          // 403 = caller not owner/admin → kart sessizce gizlenir.
          if (res.status === 403) {
            setItems([])
            return
          }
          throw new Error(json.error || "Failed")
        }
        setItems((json.data ?? []) as AuditEntry[])
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Failed")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  // Owner/admin değilse veya hiç entry yoksa kartı render etme.
  if (!loading && (!items || items.length === 0) && !error) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HugeiconsIcon icon={TimeScheduleIcon} strokeWidth={2} className="size-5" />
          {t("auditTitle")}
        </CardTitle>
        <CardDescription>{t("auditDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : (
          /**
           * "Bulutta süzülme" giriş animasyonu: her satır blur + slight Y
           * lift'ten gelir, eskiden yeniye stagger uygulanır. List DESC
           * sırada (en yeni başta) yüklendiği için stagger'ı tersine
           * sayıyoruz — en eski entry önce yerleşir, en yeni en sonda
           * yumuşakça düşer. Reduced motion'da framer-motion otomatik
           * olarak transition'ı kapatır.
           */
          <AnimatePresence initial>
            <div className="-me-1 flex max-h-[460px] flex-col overflow-y-auto pe-1">
              {items!.map((entry, i) => {
                const map = ACTION_ICON[entry.action] ?? ACTION_ICON.default
                const actor =
                  entry.user?.name ||
                  entry.user?.email ||
                  t("auditUnknownUser")
                const reverseIndex = items!.length - 1 - i
                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: 14, filter: "blur(8px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{
                      delay: Math.min(reverseIndex * 0.05, 0.6),
                      duration: 0.55,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="flex items-start gap-3 border-b py-3 last:border-b-0"
                  >
                    <div
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-md",
                        map.tint,
                      )}
                    >
                      <HugeiconsIcon
                        icon={map.icon}
                        strokeWidth={2}
                        className="size-4"
                      />
                    </div>
                    <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                      <span className="truncate text-sm">
                        <span className="font-medium">{actor}</span>{" "}
                        <span className="text-muted-foreground">
                          — {actionTitle(entry.action, entry.details)}
                        </span>
                      </span>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{formatTime(entry.createdAt)}</span>
                        {entry.ipAddress && (
                          <>
                            <span className="opacity-40">·</span>
                            <span className="font-mono">
                              {entry.ipAddress}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </AnimatePresence>
        )}
      </CardContent>
    </Card>
  )
}
