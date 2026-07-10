"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { formatDistanceToNow } from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Mail01Icon,
  ArrowUp01Icon,
  ArrowDown01Icon,
} from "@hugeicons/core-free-icons"
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

import { PageTransition } from "@workspace/console/components/shared"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────

interface Overview {
  total: number
  sent: number
  bounced: number
  failed: number
  queued: number
  opened: number
  clicked: number
  rates: {
    delivery: number
    bounce: number
    open: number
    click: number
  }
}

interface DailyPoint {
  date: string
  sent: number
  bounced: number
  opened: number
  clicked: number
}

interface DomainRow {
  id: string
  domain: string
  totalMails: number
  sent: number
  bounced: number
  opened: number
  deliveryRate: number
}

interface MailLog {
  id: string
  to: string
  from: string
  subject: string
  status: string
  domain?: { domain: string }
  sentAt: string | null
  openedAt?: string | null
  createdAt: string
}

interface AnalyticsResponse {
  windowDays: number
  domainId: string | null
  overview: Overview | null
  prevOverview: Overview | null
  daily: DailyPoint[]
  domains: DomainRow[]
  recentLogs: MailLog[]
}

// ── Helpers ───────────────────────────────────────────────────────────────

const RANGE_OPTIONS = [7, 30, 90] as const
type RangeOption = (typeof RANGE_OPTIONS)[number]

function pctDelta(current: number, prev: number): number | null {
  if (prev === 0 && current === 0) return null
  if (prev === 0) return null
  return ((current - prev) / prev) * 100
}

function formatPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n)
}

const STATUS_TONE: Record<string, string> = {
  sent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  queued: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  processing: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  bounced: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  failed: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
}

// ── KPI card ──────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  delta,
  loading,
}: {
  label: string
  value: string
  delta: number | null
  loading: boolean
}) {
  const t = useTranslations("analytics")
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-24" />
        ) : (
          <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </div>
        )}
        {delta !== null && !loading ? (
          <div className="mt-1 flex items-center gap-1 text-[12px]">
            <HugeiconsIcon
              icon={delta >= 0 ? ArrowUp01Icon : ArrowDown01Icon}
              className={cn(
                "size-3.5",
                delta >= 0 ? "text-emerald-500" : "text-rose-500",
              )}
              strokeWidth={2}
            />
            <span
              className={cn(
                "font-medium",
                delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
              )}
            >
              {Math.abs(delta).toFixed(1)}%
            </span>
            <span className="text-muted-foreground">{t("vsPrev")}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────

export function AnalyticsContent() {
  const t = useTranslations("analytics")
  const params = useParams()
  const slug = params["company-slug"] as string

  const [range, setRange] = useState<RangeOption>(30)
  const [domainId, setDomainId] = useState<string>("all")
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = new URL(
        `/api/companies/${slug}/analytics`,
        window.location.origin,
      )
      url.searchParams.set("days", String(range))
      if (domainId !== "all") url.searchParams.set("domainId", domainId)

      const res = await fetch(url.toString())
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load")
      setData(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [slug, range, domainId])

  useEffect(() => {
    void load()
  }, [load])

  const domainsForFilter = useMemo(
    () =>
      data?.domains.filter((d) => d.totalMails > 0).slice(0, 50) ?? [],
    [data],
  )

  const overview = data?.overview ?? null
  const prev = data?.prevOverview ?? null

  const kpis = useMemo(() => {
    if (!overview) {
      return {
        total: "—",
        delivery: "—",
        open: "—",
        ctr: "—",
        bounce: "—",
        deltaTotal: null as number | null,
        deltaDelivery: null as number | null,
        deltaOpen: null as number | null,
        deltaCtr: null as number | null,
        deltaBounce: null as number | null,
      }
    }
    return {
      total: formatNumber(overview.total),
      delivery: formatPct(overview.rates.delivery),
      open: formatPct(overview.rates.open),
      ctr: formatPct(overview.rates.click),
      bounce: formatPct(overview.rates.bounce),
      deltaTotal: prev ? pctDelta(overview.total, prev.total) : null,
      deltaDelivery: prev
        ? pctDelta(overview.rates.delivery, prev.rates.delivery)
        : null,
      deltaOpen: prev
        ? pctDelta(overview.rates.open, prev.rates.open)
        : null,
      deltaCtr: prev
        ? pctDelta(overview.rates.click, prev.rates.click)
        : null,
      deltaBounce: prev
        ? pctDelta(overview.rates.bounce, prev.rates.bounce)
        : null,
    }
  }, [overview, prev])

  const dailyChartData = useMemo(() => {
    return (data?.daily ?? []).map((p) => ({
      date: new Date(p.date).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      Sent: p.sent,
      Opened: p.opened,
      Clicked: p.clicked,
    }))
  }, [data])

  const topDomainsData = useMemo(() => {
    return (data?.domains ?? [])
      .filter((d) => d.totalMails > 0)
      .sort((a, b) => b.totalMails - a.totalMails)
      .slice(0, 5)
      .map((d) => ({
        name: d.domain,
        Sent: d.sent,
        Bounced: d.bounced,
        Opened: d.opened,
      }))
  }, [data])

  const isEmpty =
    !loading && (!overview || (overview.total === 0 && data?.daily.length === 0))

  return (
    <PageTransition>
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {t("title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("subtitle", { days: range })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={String(range)}
              onValueChange={(v) => {
                if (v) setRange(Number(v) as RangeOption)
              }}
            >
              <SelectTrigger className="w-[140px]">
                {range === 7
                  ? t("range7")
                  : range === 90
                    ? t("range90")
                    : t("range30")}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t("range7")}</SelectItem>
                <SelectItem value="30">{t("range30")}</SelectItem>
                <SelectItem value="90">{t("range90")}</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={domainId}
              onValueChange={(v) => setDomainId(v ?? "all")}
            >
              <SelectTrigger className="w-[180px]">
                {domainId === "all"
                  ? t("allDomains")
                  : (domainsForFilter.find((d) => d.id === domainId)?.domain ??
                    t("allDomains"))}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allDomains")}</SelectItem>
                {domainsForFilter.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.domain}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {error ? (
          <Card>
            <CardContent className="p-6 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </CardContent>
          </Card>
        ) : null}

        {/* KPI grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard
            label={t("kpiTotalSent")}
            value={kpis.total}
            delta={kpis.deltaTotal}
            loading={loading}
          />
          <KpiCard
            label={t("kpiDeliveryRate")}
            value={kpis.delivery}
            delta={kpis.deltaDelivery}
            loading={loading}
          />
          <KpiCard
            label={t("kpiOpenRate")}
            value={kpis.open}
            delta={kpis.deltaOpen}
            loading={loading}
          />
          <KpiCard
            label={t("kpiCtr")}
            value={kpis.ctr}
            delta={kpis.deltaCtr}
            loading={loading}
          />
          <KpiCard
            label={t("kpiBounceRate")}
            value={kpis.bounce}
            delta={kpis.deltaBounce ? -kpis.deltaBounce : null}
            loading={loading}
          />
        </div>

        {isEmpty ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
              <HugeiconsIcon
                icon={Mail01Icon}
                className="size-10 text-muted-foreground/40"
                strokeWidth={1.5}
              />
              <p className="text-sm text-muted-foreground">{t("noData")}</p>
            </CardContent>
          </Card>
        ) : null}

        {/* Time series */}
        {!isEmpty ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("deliveryOverTime")}</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[280px] w-full" />
              ) : (
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyChartData}>
                      <defs>
                        <linearGradient id="aSent" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(217 91% 60%)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="aOpen" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(160 84% 39%)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="hsl(160 84% 39%)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="aClick" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(262 83% 58%)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="hsl(262 83% 58%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11 }}
                        className="text-muted-foreground"
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        className="text-muted-foreground"
                        width={36}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="Sent"
                        stroke="hsl(217 91% 60%)"
                        fill="url(#aSent)"
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="Opened"
                        stroke="hsl(160 84% 39%)"
                        fill="url(#aOpen)"
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="Clicked"
                        stroke="hsl(262 83% 58%)"
                        fill="url(#aClick)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}

        {/* By domain */}
        {!isEmpty && topDomainsData.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("byDomain")}</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[240px] w-full" />
              ) : (
                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topDomainsData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        className="text-muted-foreground"
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        className="text-muted-foreground"
                        width={36}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="Sent" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Opened" fill="hsl(160 84% 39%)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Bounced" fill="hsl(38 92% 50%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}

        {/* Recent activity */}
        {!isEmpty ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t("recentActivity")}</CardTitle>
              <Link
                href={`/${(params.lang as string) ?? "en"}/d/${slug}/logs`}
                className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
              >
                {t("viewAllLogs")}
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-2 p-6">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {(data?.recentLogs ?? []).slice(0, 10).map((log) => {
                    const tone =
                      STATUS_TONE[log.status] ??
                      "bg-muted text-muted-foreground"
                    return (
                      <li
                        key={log.id}
                        className="flex items-center gap-3 px-5 py-3 text-sm"
                      >
                        <Badge
                          className={cn("font-mono text-[10px] uppercase", tone)}
                          variant="secondary"
                        >
                          {log.status}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-foreground">
                            {log.subject || "(no subject)"}
                          </div>
                          <div className="truncate font-mono text-[11.5px] text-muted-foreground">
                            {log.from} → {log.to}
                          </div>
                        </div>
                        <div className="hidden whitespace-nowrap text-[11.5px] text-muted-foreground sm:block">
                          {formatDistanceToNow(new Date(log.sentAt ?? log.createdAt), { addSuffix: true })}
                        </div>
                      </li>
                    )
                  })}
                  {(data?.recentLogs ?? []).length === 0 ? (
                    <li className="px-5 py-8 text-center text-sm text-muted-foreground">
                      {t("noData")}
                    </li>
                  ) : null}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </PageTransition>
  )
}
