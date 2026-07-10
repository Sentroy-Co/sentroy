"use client"

import { useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Wallet01Icon,
  UserMultipleIcon,
  Cancel01Icon,
  Alert02Icon,
} from "@hugeicons/core-free-icons"

import { PageTransition } from "@workspace/console/components/shared"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"
import { PolarBillingContent } from "./polar-billing-content"

interface Sub {
  companyId: string
  companyName: string
  slug: string
  owner: { name: string; email: string } | null
  planName: string | null
  interval: string
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  environment: string
  price: number
  monthly: number
}

interface Summary {
  total: number
  active: number
  trialing: number
  cancelingSoon: number
  pastDue: number
  mrr: number
}

interface Evt {
  id: string
  type: string
  environment: string
  companyId: string | null
  companyName: string | null
  processed: boolean
  error: string | null
  createdAt: string
}

const STATUS_KEY: Record<string, string> = {
  active: "statusActive",
  trialing: "statusTrialing",
  past_due: "statusPastDue",
  unpaid: "statusUnpaid",
  canceled: "statusCanceled",
  incomplete: "statusIncomplete",
  unknown: "statusUnknown",
}

function statusClass(status: string): string {
  switch (status) {
    case "active":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    case "trialing":
      return "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400"
    case "past_due":
    case "unpaid":
      return "border-destructive/30 bg-destructive/10 text-destructive"
    case "canceled":
      return "border-muted-foreground/30 bg-muted text-muted-foreground"
    default:
      return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
  }
}

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export function BillingContent() {
  const t = useTranslations("billing")

  const [tab, setTab] = useState("subscriptions")
  const [subs, setSubs] = useState<Sub[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [subsLoading, setSubsLoading] = useState(true)
  const [events, setEvents] = useState<Evt[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsLoaded, setEventsLoaded] = useState(false)

  const loadSubs = useCallback(async () => {
    setSubsLoading(true)
    try {
      const res = await fetch("/api/admin/billing/subscriptions")
      const json = await res.json()
      if (res.ok) {
        setSubs(json.data.subscriptions ?? [])
        setSummary(json.data.summary ?? null)
      }
    } finally {
      setSubsLoading(false)
    }
  }, [])

  const loadEvents = useCallback(async () => {
    setEventsLoading(true)
    try {
      const res = await fetch("/api/admin/billing/events")
      const json = await res.json()
      if (res.ok) setEvents(json.data ?? [])
    } finally {
      setEventsLoading(false)
      setEventsLoaded(true)
    }
  }, [])

  useEffect(() => {
    loadSubs()
  }, [loadSubs])

  useEffect(() => {
    if (tab === "events" && !eventsLoaded) loadEvents()
  }, [tab, eventsLoaded, loadEvents])

  const cards = summary
    ? [
        {
          label: t("mrr"),
          value: money(summary.mrr),
          icon: Wallet01Icon,
          accent: "text-emerald-500",
        },
        {
          label: t("activeSubs"),
          value: String(summary.active),
          icon: UserMultipleIcon,
          accent: "text-sky-500",
        },
        {
          label: t("cancelingSoonCard"),
          value: String(summary.cancelingSoon),
          icon: Cancel01Icon,
          accent: "text-amber-500",
        },
        {
          label: t("pastDueCard"),
          value: String(summary.pastDue),
          icon: Alert02Icon,
          accent: "text-destructive",
        },
      ]
    : []

  return (
    <PageTransition className="flex flex-1 flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="subscriptions">{t("tabSubscriptions")}</TabsTrigger>
          <TabsTrigger value="events">{t("tabEvents")}</TabsTrigger>
          <TabsTrigger value="settings">{t("tabSettings")}</TabsTrigger>
        </TabsList>

        {/* ── ABONELİKLER ───────────────────────────────────────────── */}
        <TabsContent value="subscriptions" className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {subsLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-xl" />
                ))
              : cards.map((c) => (
                  <div
                    key={c.label}
                    className="flex flex-col gap-2 rounded-xl border p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {c.label}
                      </span>
                      <HugeiconsIcon
                        icon={c.icon}
                        strokeWidth={2}
                        className={cn("size-5", c.accent)}
                      />
                    </div>
                    <span className="text-2xl font-bold">{c.value}</span>
                  </div>
                ))}
          </div>

          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colCompany")}</TableHead>
                  <TableHead>{t("colOwner")}</TableHead>
                  <TableHead>{t("colPlan")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead>{t("colInterval")}</TableHead>
                  <TableHead>{t("colPeriodEnd")}</TableHead>
                  <TableHead className="text-end">{t("colEnv")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subsLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : subs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      {t("noSubscriptions")}
                    </TableCell>
                  </TableRow>
                ) : (
                  subs.map((s) => (
                    <TableRow key={s.companyId}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{s.companyName}</span>
                          <span className="text-xs text-muted-foreground">
                            @{s.slug}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.owner ? s.owner.email : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{s.planName ?? "—"}</span>
                          {s.price > 0 ? (
                            <span className="text-xs text-muted-foreground">
                              {money(s.price)}/
                              {s.interval === "year"
                                ? t("intervalYear")
                                : t("intervalMonth")}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <Badge
                            variant="outline"
                            className={statusClass(s.status)}
                          >
                            {t(STATUS_KEY[s.status] ?? "statusUnknown")}
                          </Badge>
                          {s.cancelAtPeriodEnd ? (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400">
                              {t("cancelingSoonCard")}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {s.interval === "year"
                          ? t("intervalYear")
                          : t("intervalMonth")}
                      </TableCell>
                      <TableCell className="text-sm">
                        {s.currentPeriodEnd
                          ? new Date(s.currentPeriodEnd).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-end">
                        <Badge variant="outline" className="text-xs">
                          {s.environment === "sandbox"
                            ? t("envSandbox")
                            : t("envProduction")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── OLAYLAR ───────────────────────────────────────────────── */}
        <TabsContent value="events">
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colDate")}</TableHead>
                  <TableHead>{t("colEvent")}</TableHead>
                  <TableHead>{t("colCompany")}</TableHead>
                  <TableHead>{t("colEnv")}</TableHead>
                  <TableHead className="text-end">{t("colState")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={5}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : events.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      {t("noEvents")}
                    </TableCell>
                  </TableRow>
                ) : (
                  events.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {new Date(e.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {e.type}
                      </TableCell>
                      <TableCell className="text-sm">
                        {e.companyName ?? e.companyId ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {e.environment === "sandbox"
                            ? t("envSandbox")
                            : t("envProduction")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-end">
                        {e.error ? (
                          <Badge
                            variant="outline"
                            className="border-destructive/30 bg-destructive/10 text-destructive"
                          >
                            {t("evtFailed")}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          >
                            {t("evtProcessed")}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── AYARLAR (mevcut Polar config) ─────────────────────────── */}
        <TabsContent value="settings">
          <PolarBillingContent />
        </TabsContent>
      </Tabs>
    </PageTransition>
  )
}
