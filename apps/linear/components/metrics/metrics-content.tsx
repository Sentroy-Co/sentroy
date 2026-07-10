"use client"

/**
 * Metrics sayfasının tüm görsel katmanı — triage `app/routes/metrics.tsx`
 * bileşenlerinin birebir portu (Hero, StatCard, Panel, ChartTypeToggle,
 * Timeline, StateDonut, PriorityBars, PeopleList, LabelsList, StaleList,
 * PersonReportDialog). Veri server'da `computeMetrics(ctx)` ile hesaplanıp
 * props olarak gelir; string'ler next-intl `linearLite.metrics.*`.
 */

import { useMemo, useState, useCallback } from "react"
import { useLocale, useTranslations } from "next-intl"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  TaskAdd01FreeIcons,
  TaskDone01FreeIcons,
  Clock01FreeIcons,
  ArrowUp02FreeIcons,
  ArrowDown02FreeIcons,
  ChartHistogramFreeIcons,
} from "@hugeicons/core-free-icons"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { cn } from "@workspace/ui/lib/utils"
import { FadeIn } from "@/components/motion/fade-in"
import { Link } from "@/lib/router-compat"
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Area,
  AreaChart,
} from "recharts"
import type {
  Metrics,
  PersonReport,
  StateBucket,
  PriorityBucket,
  Person,
  LabelStat,
  TimelinePoint,
  StaleIssueRef,
} from "@/lib/metrics"

// ---------------------------------------------------------------------------
// Ortak yardımcılar
// ---------------------------------------------------------------------------

function dayKey(d: Date): string {
  // YYYY-MM-DD in local time
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function useNumberLocale(): string {
  const locale = useLocale()
  return locale === "tr" ? "tr-TR" : "en-US"
}

/** Saat cinsinden süreyi kompakt metne çevirir (dk / sa / gün). */
function useFormatHours(): (h: number) => string {
  const t = useTranslations("linearLite.metrics.duration")
  return useCallback(
    (h: number) => {
      if (h < 1) return t("minutes", { value: Math.round(h * 60) })
      if (h < 48) return t("hours", { value: h.toFixed(1) })
      return t("days", { value: (h / 24).toFixed(1) })
    },
    [t],
  )
}

function useFormatDate(): (iso: string) => string {
  const numberLocale = useNumberLocale()
  return useCallback(
    (iso: string) => {
      try {
        return new Date(iso).toLocaleDateString(numberLocale, {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      } catch {
        return iso
      }
    },
    [numberLocale],
  )
}

function initials(name?: string | null, email?: string | null): string {
  const src = (name && name.trim()) || (email && email.split("@")[0]) || "?"
  return src
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("")
}

const chartTooltipStyle: React.CSSProperties = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 11,
  padding: "6px 8px",
  // recharts default'u itemStyle'a inline `color: #000` enjekte ediyor;
  // dark mode'da okunamıyor. Kendi token'ımızı zorla.
  color: "var(--popover-foreground)",
}

const chartTooltipItemStyle: React.CSSProperties = {
  color: "var(--popover-foreground)",
}

const chartTooltipLabelStyle: React.CSSProperties = {
  color: "var(--muted-foreground)",
  fontSize: 10,
  marginBottom: 2,
}

// ---------------------------------------------------------------------------
// Ana görünüm
// ---------------------------------------------------------------------------

export function MetricsContent({ metrics }: { metrics: Metrics }) {
  const m = metrics
  const t = useTranslations("linearLite.metrics")
  const formatHours = useFormatHours()
  const [activeReport, setActiveReport] = useState<PersonReport | null>(null)
  const weekDelta = m.weekIssues - m.prevWeekIssues
  const weekDeltaPct =
    m.prevWeekIssues > 0
      ? Math.round((weekDelta / m.prevWeekIssues) * 100)
      : m.weekIssues > 0
        ? 100
        : 0
  const completionPct =
    m.totalIssues > 0
      ? Math.round((m.completedIssues / m.totalIssues) * 100)
      : 0

  const openPerson = (key: string) => {
    const rep = m.personReports[key]
    if (rep) setActiveReport(rep)
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-6 md:px-8">
      <FadeIn>
        <Hero
          total={m.totalIssues}
          week={m.weekIssues}
          weekDelta={weekDelta}
          weekDeltaPct={weekDeltaPct}
          completionPct={completionPct}
        />
      </FadeIn>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={TaskAdd01FreeIcons as IconSvgElement}
          label={t("cards.total")}
          value={m.totalIssues}
          accent="from-blue-500/10 to-blue-500/0"
          sparkline={m.timeline}
          sparkColor="#3b82f6"
          gradientId="spark-total"
        />
        <StatCard
          icon={Clock01FreeIcons as IconSvgElement}
          label={t("cards.open")}
          value={m.openIssues}
          suffix={
            m.avgOpenAgeHours !== null
              ? t("cards.openAge", { age: formatHours(m.avgOpenAgeHours) })
              : undefined
          }
          accent="from-amber-500/10 to-amber-500/0"
        />
        <StatCard
          icon={TaskDone01FreeIcons as IconSvgElement}
          label={t("cards.completed")}
          value={m.completedIssues}
          suffix={t("percentValue", { value: completionPct })}
          accent="from-emerald-500/10 to-emerald-500/0"
          sparkline={m.completedTimeline}
          sparkColor="#10b981"
          gradientId="spark-completed"
        />
        <StatCard
          icon={ChartHistogramFreeIcons as IconSvgElement}
          label={t("cards.avgResolution")}
          value={
            m.avgCompletionHours !== null
              ? formatHours(m.avgCompletionHours)
              : "—"
          }
          isText
          accent="from-violet-500/10 to-violet-500/0"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title={t("panels.last30Title")} subtitle={t("panels.last30Subtitle")}>
          <Timeline points={m.timeline} />
        </Panel>

        <Panel title={t("panels.statesTitle")} subtitle={t("panels.statesSubtitle")}>
          <StateDonut buckets={m.states} total={m.totalIssues} />
        </Panel>

        <Panel
          title={t("panels.prioritiesTitle")}
          subtitle={t("panels.prioritiesSubtitle")}
        >
          <PriorityBars buckets={m.priorities} total={m.totalIssues} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel
          title={t("panels.creatorsTitle")}
          subtitle={t("panels.creatorsSubtitle")}
        >
          <PeopleList
            items={m.topCreators}
            total={m.totalIssues}
            onSelect={openPerson}
            emptyHint={t("empty.noData")}
          />
        </Panel>

        <Panel
          title={t("panels.assigneesTitle")}
          subtitle={t("panels.assigneesSubtitle")}
        >
          <PeopleList
            items={m.topAssignees}
            total={m.totalIssues}
            onSelect={openPerson}
            emptyHint={t("empty.noAssigned")}
          />
        </Panel>

        <Panel
          title={t("panels.completersTitle")}
          subtitle={t("panels.completersSubtitle")}
        >
          <PeopleList
            items={m.topCompleters}
            total={m.completedIssues || m.totalIssues}
            onSelect={openPerson}
            emptyHint={t("empty.noCompleted")}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel
          title={t("panels.staleTitle")}
          subtitle={
            m.avgOpenAgeHours !== null
              ? t("panels.staleSubtitle", {
                  avg: formatHours(m.avgOpenAgeHours),
                })
              : t("panels.staleSubtitleEmpty")
          }
          className="lg:col-span-2"
        >
          <StaleList items={m.staleIssues} />
        </Panel>

        <Panel
          title={t("panels.labelsTitle")}
          subtitle={t("panels.labelsSubtitle")}
        >
          <LabelsList items={m.topLabels} total={m.totalIssues} />
        </Panel>
      </div>

      <PersonReportDialog
        report={activeReport}
        onClose={() => setActiveReport(null)}
        totalReference={m.totalIssues}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero({
  total,
  week,
  weekDelta,
  weekDeltaPct,
  completionPct,
}: {
  total: number
  week: number
  weekDelta: number
  weekDeltaPct: number
  completionPct: number
}) {
  const t = useTranslations("linearLite.metrics")
  const numberLocale = useNumberLocale()
  const trendIcon = weekDelta >= 0 ? ArrowUp02FreeIcons : ArrowDown02FreeIcons
  const trendColor =
    weekDelta > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : weekDelta < 0
        ? "text-rose-600 dark:text-rose-400"
        : "text-muted-foreground"

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 md:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-1/2 -right-1/4 size-[420px] rounded-full bg-gradient-to-br from-primary/12 via-primary/4 to-transparent blur-3xl"
      />
      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground/80 uppercase">
            {t("hero.kicker")}
          </span>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            <span className="text-muted-foreground">
              {total.toLocaleString(numberLocale)}
            </span>{" "}
            {t("hero.requestsWord")}
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            {t("hero.description")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
              {t("hero.thisWeek")}
            </span>
            <span className="text-2xl font-semibold tracking-tight">
              {week}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs",
                trendColor,
              )}
            >
              <HugeiconsIcon
                icon={trendIcon as IconSvgElement}
                size={11}
                strokeWidth={2}
              />
              {weekDelta > 0 ? "+" : ""}
              {weekDelta} · {weekDeltaPct > 0 ? "+" : ""}
              {t("percentValue", { value: weekDeltaPct })}
              <span className="text-muted-foreground"> {t("hero.lastWeek")}</span>
            </span>
          </div>
          <div className="h-10 w-px bg-border" aria-hidden />
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
              {t("hero.completionRate")}
            </span>
            <span className="text-2xl font-semibold tracking-tight">
              {t("percentValue", { value: completionPct })}
            </span>
            <Link
              to="/?state=closed"
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              {t("hero.seeClosed")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

function StatCard({
  icon,
  label,
  value,
  suffix,
  isText,
  accent,
  sparkline,
  sparkColor = "var(--primary)",
  gradientId,
}: {
  icon: IconSvgElement
  label: string
  value: number | string
  suffix?: string
  isText?: boolean
  accent?: string
  sparkline?: TimelinePoint[]
  sparkColor?: string
  gradientId?: string
}) {
  const numberLocale = useNumberLocale()
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card p-4">
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -top-8 -right-8 size-32 rounded-full bg-gradient-to-br opacity-80 blur-2xl",
          accent,
        )}
      />
      <div className="relative flex flex-col gap-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <HugeiconsIcon icon={icon} size={14} strokeWidth={2} />
          <span className="text-[11px] tracking-wider uppercase">{label}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "font-semibold tracking-tight text-foreground",
              isText ? "text-xl" : "text-3xl",
            )}
          >
            {typeof value === "number"
              ? value.toLocaleString(numberLocale)
              : value}
          </span>
          {suffix ? (
            <span className="text-xs text-muted-foreground">{suffix}</span>
          ) : null}
        </div>
        {sparkline && sparkline.length > 0 ? (
          <div className="-mx-1 -mb-1 mt-1 h-10">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={sparkline}
                margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient
                    id={gradientId ?? "sparkline-fill"}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={sparkColor}
                      stopOpacity={0.45}
                    />
                    <stop
                      offset="100%"
                      stopColor={sparkColor}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke={sparkColor}
                  strokeWidth={1.5}
                  fill={`url(#${gradientId ?? "sparkline-fill"})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

function Panel({
  title,
  subtitle,
  className,
  children,
}: {
  title: string
  subtitle?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-4",
        className,
      )}
    >
      <header className="flex flex-col gap-0.5">
        <h2 className="text-sm font-medium tracking-tight">{title}</h2>
        {subtitle ? (
          <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/80 uppercase">
            {subtitle}
          </p>
        ) : null}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// ChartTypeToggle + Timeline
// ---------------------------------------------------------------------------

function ChartTypeToggle({
  value,
  onChange,
}: {
  value: "bar" | "line"
  onChange: (v: "bar" | "line") => void
}) {
  const t = useTranslations("linearLite.metrics.chart")
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-border/60 bg-background/40 p-0.5">
      {(["bar", "line"] as const).map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type)}
          className={cn(
            "rounded-sm px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider transition-colors",
            value === type
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {type === "bar" ? t("bar") : t("line")}
        </button>
      ))}
    </div>
  )
}

function Timeline({
  points,
  color = "var(--primary)",
}: {
  points: TimelinePoint[]
  color?: string
}) {
  const t = useTranslations("linearLite.metrics.chart")
  const [chartType, setChartType] = useState<"bar" | "line">("bar")
  const today = dayKey(new Date())
  const data = useMemo(
    () =>
      points.map((p) => ({
        ...p,
        short: p.date.slice(5), // MM-DD
        isToday: p.date === today,
      })),
    [points, today],
  )
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end">
        <ChartTypeToggle value={chartType} onChange={setChartType} />
      </div>
      <div className="h-32 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "bar" ? (
            <BarChart
              data={data}
              margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="currentColor"
                strokeOpacity={0.06}
              />
              <XAxis
                dataKey="short"
                tick={{ fontSize: 9, fill: "currentColor", opacity: 0.5 }}
                tickLine={false}
                axisLine={false}
                interval={4}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "currentColor", opacity: 0.5 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={28}
              />
              <Tooltip
                cursor={{ fill: "currentColor", fillOpacity: 0.05 }}
                contentStyle={chartTooltipStyle}
                itemStyle={chartTooltipItemStyle}
                labelStyle={chartTooltipLabelStyle}
                labelFormatter={(l) => `${l}`}
                formatter={(v) => [`${v ?? 0}`, t("requests")]}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {data.map((d) => (
                  <Cell
                    key={d.date}
                    fill={d.isToday ? color : color}
                    fillOpacity={d.isToday ? 1 : 0.45}
                  />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <AreaChart
              data={data}
              margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
            >
              <defs>
                <linearGradient id="tl-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="currentColor"
                strokeOpacity={0.06}
              />
              <XAxis
                dataKey="short"
                tick={{ fontSize: 9, fill: "currentColor", opacity: 0.5 }}
                tickLine={false}
                axisLine={false}
                interval={4}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "currentColor", opacity: 0.5 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={28}
              />
              <Tooltip
                cursor={{ stroke: color, strokeOpacity: 0.2 }}
                contentStyle={chartTooltipStyle}
                itemStyle={chartTooltipItemStyle}
                labelStyle={chartTooltipLabelStyle}
                labelFormatter={(l) => `${l}`}
                formatter={(v) => [`${v ?? 0}`, t("requests")]}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke={color}
                strokeWidth={2}
                fill="url(#tl-fill)"
                isAnimationActive
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// StateDonut
// ---------------------------------------------------------------------------

type DonutDatum = {
  type: string
  label?: string
  color: string
  count: number
}

function StateDonut({
  buckets,
  total,
}: {
  buckets: StateBucket[]
  total: number
}) {
  const t = useTranslations("linearLite.metrics")
  const numberLocale = useNumberLocale()
  // Server'daki label nötr fallback — burada type anahtarından çevrilir.
  const localized = useMemo(
    () =>
      buckets.map((b) => ({
        ...b,
        label: t(`states.${b.type}`),
      })),
    [buckets, t],
  )
  const active: DonutDatum[] = localized.filter((b) => b.count > 0)
  const donutData: DonutDatum[] =
    active.length > 0
      ? active
      : [{ type: "empty", color: "var(--muted)", count: 1 }]
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative size-[156px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={donutData}
              dataKey="count"
              nameKey="label"
              innerRadius={56}
              outerRadius={76}
              paddingAngle={active.length > 1 ? 2 : 0}
              strokeWidth={0}
              isAnimationActive
            >
              {donutData.map((b) => (
                <Cell key={b.type} fill={b.color} />
              ))}
            </Pie>
            <Tooltip
              cursor={false}
              contentStyle={chartTooltipStyle}
              itemStyle={chartTooltipItemStyle}
              labelStyle={{ display: "none" }}
              formatter={(value, _name, item) => {
                const label =
                  (item as { payload?: { label?: string } } | undefined)
                    ?.payload?.label ?? ""
                return [`${value}`, label]
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tracking-tight">
            {total.toLocaleString(numberLocale)}
          </span>
          <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
            {t("chart.totalCenter")}
          </span>
        </div>
      </div>
      <ul className="flex flex-1 flex-col gap-1.5 min-w-[160px]">
        {localized.map((b) => {
          const pct = total > 0 ? Math.round((b.count / total) * 100) : 0
          return (
            <li key={b.type} className="flex items-center gap-2 text-xs">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: b.color }}
                aria-hidden
              />
              <span className="flex-1 truncate text-muted-foreground">
                {b.label}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground/80">
                {t("percentValue", { value: pct })}
              </span>
              <span className="w-6 text-right tabular-nums font-medium">
                {b.count}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PriorityBars
// ---------------------------------------------------------------------------

function PriorityBars({
  buckets,
  total,
}: {
  buckets: PriorityBucket[]
  total: number
}) {
  const t = useTranslations("linearLite.metrics")
  const [chartType, setChartType] = useState<"bar" | "line">("bar")
  // Server'daki label nötr fallback — priority anahtarından çevrilir.
  const data = useMemo(
    () =>
      buckets.map((b) => {
        const label = t(`priorities.p${b.priority}`)
        return { ...b, label, short: label }
      }),
    [buckets, t],
  )
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end">
        <ChartTypeToggle value={chartType} onChange={setChartType} />
      </div>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "bar" ? (
            <BarChart
              data={data}
              margin={{ top: 4, right: 4, left: -28, bottom: 4 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="currentColor"
                strokeOpacity={0.06}
              />
              <XAxis
                dataKey="short"
                tick={{ fontSize: 10, fill: "currentColor", opacity: 0.6 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "currentColor", opacity: 0.5 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={28}
              />
              <Tooltip
                cursor={{ fill: "currentColor", fillOpacity: 0.05 }}
                contentStyle={chartTooltipStyle}
                itemStyle={chartTooltipItemStyle}
                labelStyle={chartTooltipLabelStyle}
                formatter={(v) => [`${v ?? 0}`, t("chart.requests")]}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {data.map((d) => (
                  <Cell key={String(d.priority)} fill={d.swatch} />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <LineChart
              data={data}
              margin={{ top: 8, right: 8, left: -28, bottom: 4 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="currentColor"
                strokeOpacity={0.06}
              />
              <XAxis
                dataKey="short"
                tick={{ fontSize: 10, fill: "currentColor", opacity: 0.6 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "currentColor", opacity: 0.5 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={28}
              />
              <Tooltip
                cursor={{ stroke: "currentColor", strokeOpacity: 0.15 }}
                contentStyle={chartTooltipStyle}
                itemStyle={chartTooltipItemStyle}
                labelStyle={chartTooltipLabelStyle}
                formatter={(v) => [`${v ?? 0}`, t("chart.requests")]}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 0, fill: "var(--primary)" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {data.map((b) => {
          const pct = total > 0 ? Math.round((b.count / total) * 100) : 0
          return (
            <li
              key={b.priority}
              className="flex items-center gap-1.5 text-[11px]"
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: b.swatch }}
                aria-hidden
              />
              <span className="text-muted-foreground">{b.label}</span>
              <span className="font-mono text-[10px] text-muted-foreground/80">
                {t("percentValue", { value: pct })}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PeopleList
// ---------------------------------------------------------------------------

function PeopleList({
  items,
  total,
  emptyHint,
  onSelect,
}: {
  items: Person[]
  total: number
  emptyHint: string
  onSelect?: (key: string) => void
}) {
  const t = useTranslations("linearLite.metrics")
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyHint}</p>
  }
  const max = items[0]?.count ?? 1
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((p, i) => {
        const w = (p.count / max) * 100
        const pct = total > 0 ? Math.round((p.count / total) * 100) : 0
        const body = (
          <>
            <span className="w-4 text-right font-mono text-[10px] text-muted-foreground/70">
              {i + 1}
            </span>
            <Avatar className="size-7">
              {p.avatarUrl ? (
                <AvatarImage src={p.avatarUrl} alt={p.name} />
              ) : null}
              <AvatarFallback className="text-[9px]">
                {initials(p.name, p.email)}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="truncate text-xs font-medium">{p.name}</span>
              <div className="relative h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary/70 transition-[width] duration-500"
                  style={{ width: `${w}%` }}
                />
              </div>
            </div>
            <span className="tabular-nums text-xs font-medium">{p.count}</span>
            <span className="w-8 text-right font-mono text-[10px] text-muted-foreground/80">
              {t("percentValue", { value: pct })}
            </span>
          </>
        )
        return (
          <li key={p.key} className="list-none">
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(p.key)}
                className="group/r flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                aria-label={t("people.viewReport", { name: p.name })}
              >
                {body}
              </button>
            ) : (
              <div className="flex items-center gap-2.5 px-1.5 py-1.5">
                {body}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// LabelsList
// ---------------------------------------------------------------------------

function LabelsList({ items, total }: { items: LabelStat[]; total: number }) {
  const t = useTranslations("linearLite.metrics")
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">{t("empty.noLabels")}</p>
    )
  }
  const max = items[0]?.count ?? 1
  return (
    <ul className="flex flex-col gap-2">
      {items.map((l) => {
        const w = (l.count / max) * 100
        const pct = total > 0 ? Math.round((l.count / total) * 100) : 0
        return (
          <li key={l.id} className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: l.color }}
              aria-hidden
            />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="truncate text-xs font-medium">{l.name}</span>
              <div className="relative h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
                  style={{
                    width: `${w}%`,
                    backgroundColor: l.color,
                    opacity: 0.7,
                  }}
                />
              </div>
            </div>
            <span className="tabular-nums text-xs font-medium">{l.count}</span>
            <span className="w-8 text-right font-mono text-[10px] text-muted-foreground/80">
              {t("percentValue", { value: pct })}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// StaleList
// ---------------------------------------------------------------------------

function StaleList({ items }: { items: StaleIssueRef[] }) {
  const t = useTranslations("linearLite.metrics")
  const formatHours = useFormatHours()
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("empty.noStale")}</p>
  }
  return (
    <ul className="flex flex-col gap-1">
      {items.map((r) => (
        <li key={r.id} className="list-none">
          <Link
            to={`/tasks/${r.id}`}
            className="group/s flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: r.state.color }}
              aria-hidden
            />
            <span className="font-mono text-[10px] text-muted-foreground">
              {r.identifier}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium">
              {r.title}
            </span>
            {r.assignee ? (
              <Avatar className="size-5 shrink-0">
                {r.assignee.avatarUrl ? (
                  <AvatarImage
                    src={r.assignee.avatarUrl}
                    alt={r.assignee.name}
                  />
                ) : null}
                <AvatarFallback className="text-[8px]">
                  {initials(r.assignee.name)}
                </AvatarFallback>
              </Avatar>
            ) : null}
            <span className="shrink-0 rounded-md bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] tracking-tight text-amber-700 dark:text-amber-400">
              {formatHours(r.ageHours)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// PersonReportDialog
// ---------------------------------------------------------------------------

function PersonReportDialog({
  report,
  onClose,
  totalReference,
}: {
  report: PersonReport | null
  onClose: () => void
  totalReference: number
}) {
  const open = report !== null
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      <DialogContent className="flex h-[90vh] max-h-[90vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        {report ? (
          <PersonReportContent
            report={report}
            totalReference={totalReference}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function PersonReportContent({
  report,
  totalReference,
}: {
  report: PersonReport
  totalReference: number
}) {
  const t = useTranslations("linearLite.metrics.report")
  const formatHours = useFormatHours()
  const formatDate = useFormatDate()
  const completionRate =
    report.assignedTotal > 0
      ? Math.round((report.assignedCompleted / report.assignedTotal) * 100)
      : 0
  const sharePct =
    totalReference > 0
      ? Math.round((report.openedTotal / totalReference) * 100)
      : 0

  return (
    <>
      <DialogHeader className="relative shrink-0 overflow-hidden border-b border-border/60 p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-1/3 -right-1/4 size-[360px] rounded-full bg-gradient-to-br from-primary/12 via-primary/4 to-transparent blur-3xl"
        />
        <div className="relative flex flex-wrap items-center gap-4">
          <Avatar className="size-14">
            {report.avatarUrl ? (
              <AvatarImage src={report.avatarUrl} alt={report.name} />
            ) : null}
            <AvatarFallback className="text-sm">
              {initials(report.name, report.email)}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col">
            <DialogTitle className="text-xl">{report.name}</DialogTitle>
            <DialogDescription className="text-xs">
              {report.email ?? "—"}
              <span className="ml-2 text-muted-foreground/70">
                {t("share", { pct: sharePct })}
              </span>
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-6 p-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ReportStat
              label={t("opened")}
              value={report.openedTotal}
              suffix={
                report.openedThisWeek > 0
                  ? t("openedThisWeek", { count: report.openedThisWeek })
                  : undefined
              }
            />
            <ReportStat
              label={t("assigned")}
              value={report.assignedTotal}
              suffix={
                report.assignedOpen > 0
                  ? t("assignedOpen", { count: report.assignedOpen })
                  : undefined
              }
            />
            <ReportStat
              label={t("completed")}
              value={report.assignedCompleted}
              suffix={
                report.assignedTotal > 0
                  ? t("completionRate", { value: completionRate })
                  : undefined
              }
            />
            <ReportStat
              label={t("avgResolution")}
              value={
                report.avgCompletionHours !== null
                  ? formatHours(report.avgCompletionHours)
                  : "—"
              }
              isText
            />
          </div>

          <section className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/40 p-4">
            <header className="flex flex-col gap-0.5">
              <h3 className="text-sm font-medium tracking-tight">
                {t("timelineTitle")}
              </h3>
              <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/80 uppercase">
                {t("timelineSubtitle")}
              </p>
            </header>
            <Timeline points={report.openedTimeline} />
          </section>

          {report.topLabels.length > 0 ? (
            <section className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/40 p-4">
              <header className="flex flex-col gap-0.5">
                <h3 className="text-sm font-medium tracking-tight">
                  {t("topLabelsTitle")}
                </h3>
                <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/80 uppercase">
                  {t("topLabelsSubtitle")}
                </p>
              </header>
              <div className="flex flex-wrap gap-1.5">
                {report.topLabels.map((l) => (
                  <span
                    key={l.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-2 py-0.5 text-[11px]"
                  >
                    <span
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: l.color }}
                      aria-hidden
                    />
                    {l.name}
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {l.count}
                    </span>
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {report.recentIssues.length > 0 ? (
            <section className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/40 p-4">
              <header className="flex flex-col gap-0.5">
                <h3 className="text-sm font-medium tracking-tight">
                  {t("recentTitle")}
                </h3>
                <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/80 uppercase">
                  {t("recentSubtitle")}
                </p>
              </header>
              <ul className="flex flex-col gap-0.5">
                {report.recentIssues.map((r) => (
                  <li key={r.id} className="list-none">
                    <Link
                      to={`/tasks/${r.id}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: r.state.color }}
                        aria-hidden
                      />
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {r.identifier}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">
                        {r.title}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatDate(r.createdAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </ScrollArea>
    </>
  )
}

function ReportStat({
  label,
  value,
  suffix,
  isText,
}: {
  label: string
  value: number | string
  suffix?: string
  isText?: boolean
}) {
  const numberLocale = useNumberLocale()
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border/60 bg-card p-3">
      <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "font-semibold tracking-tight",
            isText ? "text-lg" : "text-2xl",
          )}
        >
          {typeof value === "number"
            ? value.toLocaleString(numberLocale)
            : value}
        </span>
        {suffix ? (
          <span className="text-[10px] text-muted-foreground">{suffix}</span>
        ) : null}
      </div>
    </div>
  )
}
