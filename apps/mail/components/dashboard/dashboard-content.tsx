"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Mail01Icon,
  Tick02Icon,
  Cancel01Icon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  InternetIcon,
  Alert01Icon,
  ImageAdd01Icon,
  TextCreationIcon,
  Mailbox01Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons"
import {
  AreaChart,
  Area,
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
import { Progress } from "@workspace/ui/components/progress"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useSession } from "@workspace/auth/client/auth-client"
import { cn } from "@workspace/ui/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────

interface StatsOverview {
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

interface DailyStats {
  date: string
  sent: number
  bounced: number
  failed: number
  opened: number
  clicked: number
}

interface DomainStats {
  id: string
  domain: string
  status: string
  totalMails: number
  sent: number
  bounced: number
  opened: number
  deliveryRate: number
}

interface RecentLog {
  id: string
  to: string
  subject: string
  status: string
  createdAt: string
}

interface Usage {
  emailsSent: number
  emailsLimit: number
  storageUsed: number
  storageLimit: number
  domainsUsed: number
  domainsLimit: number
  mailboxesUsed: number
  mailboxesLimit: number
  membersUsed: number
  membersLimit: number
}

interface DashboardData {
  stats: StatsOverview | null
  prevStats: StatsOverview | null
  daily: DailyStats[]
  domains: DomainStats[]
  recentLogs: RecentLog[]
  usage: Usage
  pendingDomains: { id: string; domain: string; status: string }[]
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function trendPercent(
  current: number,
  previous: number,
): { value: number; positive: boolean } | null {
  if (previous === 0 && current === 0) return null
  if (previous === 0) return { value: 100, positive: true }
  const pct = ((current - previous) / previous) * 100
  return { value: Math.abs(Math.round(pct * 10) / 10), positive: pct >= 0 }
}

// ── Sub Components ────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  suffix,
  trend,
  invertTrend,
}: {
  label: string
  value: string
  suffix?: string
  trend: { value: number; positive: boolean } | null
  invertTrend?: boolean
}) {
  const trendPositive = invertTrend
    ? trend && !trend.positive
    : trend?.positive
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-2xl font-bold">{value}</span>
          {suffix && (
            <span className="text-sm text-muted-foreground">{suffix}</span>
          )}
        </div>
        {trend && (
          <div
            className={cn(
              "mt-1 flex items-center gap-0.5 text-xs font-medium",
              trendPositive
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400",
            )}
          >
            <HugeiconsIcon
              icon={
                (invertTrend ? !trend.positive : trend.positive)
                  ? ArrowUp01Icon
                  : ArrowDown01Icon
              }
              strokeWidth={2}
              className="size-3"
            />
            {trend.value}%
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function QuotaBar({
  label,
  used,
  limit,
  format,
}: {
  label: string
  used: number
  limit: number
  format?: "bytes"
}) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0
  const fmt = format === "bytes" ? formatBytes : formatNum
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {fmt(used)} / {fmt(limit)}
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    sent: { variant: "default", label: "Sent" },
    queued: { variant: "secondary", label: "Queued" },
    processing: { variant: "secondary", label: "Processing" },
    bounced: { variant: "destructive", label: "Bounced" },
    failed: { variant: "destructive", label: "Failed" },
  }
  const s = map[status] || { variant: "outline" as const, label: status }
  return <Badge variant={s.variant} className="text-[10px]">{s.label}</Badge>
}

// ── Main Component ────────────────────────────────────────────────────────

const PERIODS = [7, 30, 90] as const

export function DashboardContent() {
  const t = useTranslations("dashboard")
  const params = useParams<{ "company-slug": string; lang: string }>()
  const slug = params["company-slug"]
  const lang = params.lang
  const { data: session } = useSession()
  const userName = session?.user?.name?.split(" ")[0] || ""

  const [days, setDays] = useState<number>(30)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/companies/${slug}/dashboard?days=${days}`,
      )
      const json = await res.json()
      if (res.ok && json.data) setData(json.data)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [slug, days])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  const basePath = `/${lang}/d/${slug}`

  // Action items
  const actions = useMemo(() => {
    if (!data) return []
    const items: { icon: typeof Alert01Icon; text: string; href: string; color: string }[] = []

    if (data.pendingDomains.length > 0) {
      items.push({
        icon: InternetIcon,
        text: t("pendingDomainAction", { count: data.pendingDomains.length }),
        href: `${basePath}/domains`,
        color: "text-amber-500",
      })
    }

    const emailPct = data.usage.emailsLimit > 0
      ? (data.usage.emailsSent / data.usage.emailsLimit) * 100
      : 0
    if (emailPct >= 80) {
      items.push({
        icon: Alert01Icon,
        text: t("emailLimitWarning", { percent: Math.round(emailPct) }),
        href: `${basePath}/settings`,
        color: "text-amber-500",
      })
    }

    const activeDomains = data.domains.filter((d) => d.status === "active")
    if (activeDomains.length > 0) {
      // Check BIMI hint for first active domain
      items.push({
        icon: ImageAdd01Icon,
        text: t("bimiNotConfigured", { domain: activeDomains[0].domain }),
        href: `${basePath}/domains`,
        color: "text-blue-500",
      })
    }

    if (data.domains.length === 0) {
      items.push({
        icon: InternetIcon,
        text: t("noDomains"),
        href: `${basePath}/domains`,
        color: "text-blue-500",
      })
    }

    return items.slice(0, 4)
  }, [data, t, basePath])

  // ── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageTransition className="flex flex-1 flex-col gap-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </PageTransition>
    )
  }

  const stats = data?.stats
  const prevStats = data?.prevStats

  return (
    <PageTransition className="flex flex-1 flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {userName ? t("welcome", { name: userName }) : t("overview")}
          </h1>
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setDays(p)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                days === p
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`period${p}d` as "period7d")}
            </button>
          ))}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label={t("emailsSent")}
          value={formatNum(stats?.sent ?? 0)}
          trend={trendPercent(stats?.sent ?? 0, prevStats?.sent ?? 0)}
        />
        <StatCard
          label={t("deliveryRate")}
          value={`${(stats?.rates.delivery ?? 0).toFixed(1)}`}
          suffix="%"
          trend={trendPercent(
            stats?.rates.delivery ?? 0,
            prevStats?.rates.delivery ?? 0,
          )}
        />
        <StatCard
          label={t("openRate")}
          value={`${(stats?.rates.open ?? 0).toFixed(1)}`}
          suffix="%"
          trend={trendPercent(
            stats?.rates.open ?? 0,
            prevStats?.rates.open ?? 0,
          )}
        />
        <StatCard
          label={t("bounceRate")}
          value={`${(stats?.rates.bounce ?? 0).toFixed(1)}`}
          suffix="%"
          trend={trendPercent(
            stats?.rates.bounce ?? 0,
            prevStats?.rates.bounce ?? 0,
          )}
          invertTrend
        />
        <StatCard
          label={t("clickRate")}
          value={`${(stats?.rates.click ?? 0).toFixed(1)}`}
          suffix="%"
          trend={trendPercent(
            stats?.rates.click ?? 0,
            prevStats?.rates.click ?? 0,
          )}
        />
      </div>

      {/* Email Activity Chart */}
      {(data?.daily?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("emailActivity")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data!.daily}>
                  <defs>
                    <linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(221,83%,53%)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(221,83%,53%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gOpened" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142,71%,45%)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(142,71%,45%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d: string) => {
                      const date = new Date(d)
                      return `${date.getDate()}/${date.getMonth() + 1}`
                    }}
                    className="text-xs"
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    className="text-xs"
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 11 }}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="sent"
                    stroke="hsl(221,83%,53%)"
                    fill="url(#gSent)"
                    strokeWidth={2}
                    name={t("emailsSent")}
                  />
                  <Area
                    type="monotone"
                    dataKey="opened"
                    stroke="hsl(142,71%,45%)"
                    fill="url(#gOpened)"
                    strokeWidth={2}
                    name={t("openRate")}
                  />
                  <Area
                    type="monotone"
                    dataKey="bounced"
                    stroke="hsl(0,84%,60%)"
                    fill="none"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    name={t("bounceRate")}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Domain Performance + Action Items */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Domain Performance */}
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">
              {t("domainPerformance")}
            </CardTitle>
            <Link
              href={`${basePath}/domains`}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {t("viewAll")}
            </Link>
          </CardHeader>
          <CardContent>
            {(data?.domains?.length ?? 0) === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t("noData")}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {data!.domains.slice(0, 5).map((d) => (
                  <div key={d.id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="truncate text-sm font-medium">
                          {d.domain}
                        </span>
                        <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                          {d.deliveryRate.toFixed(1)}%
                        </span>
                      </div>
                      <Progress
                        value={d.deliveryRate}
                        className="mt-1 h-1.5"
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right text-xs text-muted-foreground">
                      {formatNum(d.sent)} {t("sentCol")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Items */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("actionItems")}</CardTitle>
          </CardHeader>
          <CardContent>
            {actions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6">
                <HugeiconsIcon
                  icon={Tick02Icon}
                  strokeWidth={2}
                  className="size-8 text-emerald-500"
                />
                <p className="text-sm text-muted-foreground">
                  {t("allGood")}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {actions.map((action, i) => (
                  <Link
                    key={i}
                    href={action.href}
                    className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <HugeiconsIcon
                      icon={action.icon}
                      strokeWidth={2}
                      className={cn("size-4 shrink-0", action.color)}
                    />
                    <span className="text-sm">{action.text}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Usage Quotas */}
      {data?.usage && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("usage")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <QuotaBar
                label={t("emailsSent")}
                used={data.usage.emailsSent}
                limit={data.usage.emailsLimit}
              />
              <QuotaBar
                label={t("storage")}
                used={data.usage.storageUsed}
                limit={data.usage.storageLimit}
                format="bytes"
              />
              <QuotaBar
                label={t("domains")}
                used={data.usage.domainsUsed}
                limit={data.usage.domainsLimit}
              />
              <QuotaBar
                label={t("mailboxes")}
                used={data.usage.mailboxesUsed}
                limit={data.usage.mailboxesLimit}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      {(data?.recentLogs?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">
              {t("recentActivity")}
            </CardTitle>
            <Link
              href={`${basePath}/logs`}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {t("viewAll")}
            </Link>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {data!.recentLogs.map((log) => {
                let timeAgo = ""
                try {
                  timeAgo = formatDistanceToNow(new Date(log.createdAt), {
                    addSuffix: true,
                  })
                } catch {
                  timeAgo = log.createdAt
                }
                return (
                  <div
                    key={log.id}
                    className="flex items-center gap-3 rounded-lg border p-2.5"
                  >
                    <HugeiconsIcon
                      icon={
                        log.status === "sent" || log.status === "queued"
                          ? Tick02Icon
                          : Cancel01Icon
                      }
                      strokeWidth={2}
                      className={cn(
                        "size-4 shrink-0",
                        log.status === "sent"
                          ? "text-emerald-500"
                          : log.status === "bounced" || log.status === "failed"
                            ? "text-red-500"
                            : "text-muted-foreground",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        <span className="font-medium">{log.to}</span>
                        {log.subject && (
                          <span className="text-muted-foreground">
                            {" "}
                            &mdash; {log.subject}
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {timeAgo}
                    </span>
                    <StatusBadge status={log.status} />
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </PageTransition>
  )
}
