"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { format, formatDistanceToNow } from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  FolderLibraryIcon,
  Image01Icon,
  VideoReplayIcon,
  MusicNote01Icon,
  File01Icon,
  DocumentAttachmentIcon,
  DatabaseIcon,
  CloudUploadIcon,
  Database01Icon,
} from "@hugeicons/core-free-icons"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts"
import { FileIcon, defaultStyles } from "react-file-icon"
import { PageTransition } from "@workspace/console/components/shared"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"

type MediaType = "image" | "video" | "audio" | "document" | "other"

interface BucketBreakdown {
  id: string
  name: string
  slug: string
  storageUsed: number
  fileCount: number
  isPublic: boolean
}

interface TypeBreakdown {
  type: MediaType
  size: number
  count: number
}

interface TimeSeriesPoint {
  date: string
  size: number
  count: number
}

interface RecentUpload {
  id: string
  originalName: string
  type: MediaType
  mimeType: string
  size: number
  bucketId: string
  bucketName: string | null
  bucketSlug: string | null
  isPublic: boolean
  createdAt: string
  hasThumbnail: boolean
}

interface UsageReport {
  quota: {
    used: number
    limit: number
    mailUsed: number
    planName?: string
  }
  buckets: BucketBreakdown[]
  byType: TypeBreakdown[]
  timeSeries: TimeSeriesPoint[]
  recent: RecentUpload[]
}

function formatBytes(bytes: number, fractionDigits = 1): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(fractionDigits)} ${sizes[i]}`
}

function compactBytes(bytes: number): string {
  return formatBytes(bytes, bytes < 1024 * 1024 ? 0 : 1)
}

function getExtension(name: string): string {
  const idx = name.lastIndexOf(".")
  if (idx === -1) return ""
  return name.slice(idx + 1).toLowerCase()
}

const TYPE_ICONS: Record<MediaType, typeof Image01Icon> = {
  image: Image01Icon,
  video: VideoReplayIcon,
  audio: MusicNote01Icon,
  document: DocumentAttachmentIcon,
  other: File01Icon,
}

/**
 * Recharts donut/bar/area renkleri — storage'da kullanilan media type
 * paletini sabit tutuyoruz; design tokens (--color-chart-N) yerine
 * semantic renkler tercih edildi cunku kullanici "doc" deyince amber,
 * "video" deyince mor bekliyor.
 */
const TYPE_HEX: Record<MediaType, string> = {
  image: "#3b82f6",
  video: "#a855f7",
  audio: "#ec4899",
  document: "#f59e0b",
  other: "#71717a",
}

export function UsageContent() {
  const t = useTranslations("usage")
  const params = useParams()
  const slug = params["company-slug"] as string
  const lang = params.lang as string
  const [report, setReport] = useState<UsageReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/companies/${slug}/usage`)
        const json = await res.json()
        if (!cancelled && res.ok) setReport(json.data)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  const totalFiles = useMemo(
    () => report?.byType.reduce((sum, r) => sum + r.count, 0) ?? 0,
    [report],
  )
  const last7dUploads = useMemo(() => {
    if (!report) return 0
    const tail = report.timeSeries.slice(-7)
    return tail.reduce((sum, p) => sum + p.count, 0)
  }, [report])

  if (loading && !report) {
    return (
      <PageTransition className="flex flex-col gap-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </PageTransition>
    )
  }

  if (!report) {
    return (
      <PageTransition className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("fetchError")}</p>
      </PageTransition>
    )
  }

  const { quota, buckets, byType, timeSeries, recent } = report
  const totalUsed = quota.used + quota.mailUsed
  const limitReady = quota.limit > 0
  const usedPct = limitReady ? Math.min((totalUsed / quota.limit) * 100, 100) : 0
  const freeBytes = limitReady ? Math.max(quota.limit - totalUsed, 0) : 0
  const totalsByCount = totalFiles
  const totalsBySize = byType.reduce((sum, r) => sum + r.size, 0)

  return (
    <PageTransition className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {/* ── Stat cards ────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={FolderLibraryIcon}
          label={t("statBuckets")}
          value={buckets.length.toLocaleString(lang)}
          accent="bg-primary/10 text-primary"
        />
        <StatCard
          icon={DocumentAttachmentIcon}
          label={t("statFiles")}
          value={totalFiles.toLocaleString(lang)}
          accent="bg-blue-500/10 text-blue-600 dark:text-blue-400"
        />
        <StatCard
          icon={Database01Icon}
          label={t("statStorage")}
          value={compactBytes(quota.used)}
          hint={
            limitReady ? `${usedPct.toFixed(0)}% ${t("ofPlanQuota")}` : t("unlimited")
          }
          accent="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          icon={CloudUploadIcon}
          label={t("statRecent7d")}
          value={last7dUploads.toLocaleString(lang)}
          hint={t("last7days")}
          accent="bg-amber-500/10 text-amber-600 dark:text-amber-400"
        />
      </div>

      {/* ── Plan quota progress ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <HugeiconsIcon icon={DatabaseIcon} strokeWidth={2} className="size-5" />
              {t("overall")}
            </CardTitle>
            {quota.planName && (
              <CardDescription>
                {t("plan")}: <span className="font-medium">{quota.planName}</span>
              </CardDescription>
            )}
          </div>
          <div className="text-end">
            <div className="text-3xl font-bold tracking-tight">
              {formatBytes(totalUsed)}
            </div>
            <div className="text-xs text-muted-foreground">
              / {limitReady ? formatBytes(quota.limit) : t("unlimited")}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {limitReady && (
            <>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    usedPct >= 90
                      ? "bg-red-500"
                      : usedPct >= 70
                        ? "bg-amber-500"
                        : "bg-primary",
                  )}
                  style={{ width: `${usedPct}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <StatCell
                  label={t("storageUsed")}
                  value={formatBytes(quota.used)}
                  dotClass="bg-primary"
                />
                <StatCell
                  label={t("mailUsed")}
                  value={formatBytes(quota.mailUsed)}
                  dotClass="bg-blue-500"
                />
                <StatCell
                  label={t("free")}
                  value={formatBytes(freeBytes)}
                  dotClass="bg-emerald-500"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Charts row: time series + type donut ─────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("uploadsTrend")}</CardTitle>
            <CardDescription>{t("uploadsTrendDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <UploadsTrendChart data={timeSeries} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("byType")}</CardTitle>
            <CardDescription>{t("byTypeDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <TypeDonutChart byType={byType} totalFiles={totalsByCount} totalSize={totalsBySize} t={t} />
          </CardContent>
        </Card>
      </div>

      {/* ── Top buckets bar chart ───────────────────────────────────── */}
      {buckets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("byBucket")}</CardTitle>
            <CardDescription>{t("byBucketDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <BucketBarChart buckets={buckets} />
            <div className="flex flex-col gap-2">
              {buckets.map((b) => (
                <Link
                  key={b.id}
                  href={`/${lang}/d/${slug}/buckets/${b.slug}`}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <HugeiconsIcon
                        icon={FolderLibraryIcon}
                        strokeWidth={1.8}
                        className="size-4"
                      />
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">{b.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {b.fileCount.toLocaleString(lang)} {t("files")}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {b.isPublic && (
                      <Badge variant="outline" className="text-xs">
                        public
                      </Badge>
                    )}
                    <span className="font-mono text-sm">
                      {formatBytes(b.storageUsed)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Recent uploads strip ─────────────────────────────────────── */}
      {recent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("recentUploads")}</CardTitle>
            <CardDescription>{t("recentUploadsDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              {recent.map((r) => (
                <RecentTile key={r.id} item={r} lang={lang} slug={slug} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </PageTransition>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: typeof Image01Icon
  label: string
  value: string
  hint?: string
  accent: string
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            accent,
          )}
        >
          <HugeiconsIcon icon={icon} strokeWidth={2} className="size-5" />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-xs text-muted-foreground">{label}</span>
          <span className="truncate text-2xl font-semibold tabular-nums">{value}</span>
          {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
        </div>
      </CardContent>
    </Card>
  )
}

function StatCell({
  label,
  value,
  dotClass,
}: {
  label: string
  value: string
  dotClass: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={cn("size-2 rounded-full", dotClass)} />
        {label}
      </div>
      <span className="font-mono font-medium">{value}</span>
    </div>
  )
}

function UploadsTrendChart({ data }: { data: TimeSeriesPoint[] }) {
  /**
   * Recharts AreaChart — gradient fill, axis sade, count primary metric.
   * Tooltip kustom; bytes format'i ile birlikte iki metrigi gosteriyoruz.
   */
  const formatted = data.map((p) => ({
    date: p.date,
    label: format(new Date(p.date), "MMM d"),
    count: p.count,
    size: p.size,
  }))
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={formatted} margin={{ top: 5, right: 12, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="overviewUploadsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={32}
          />
          <Tooltip
            cursor={{ stroke: "hsl(var(--primary))", strokeOpacity: 0.2 }}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--background))",
              fontSize: 12,
            }}
            formatter={(value, _name, props) => {
              const num = typeof value === "number" ? value : Number(value) || 0
              const key = (props as { dataKey?: string }).dataKey
              if (key === "count") return [num.toString(), "Uploads"]
              if (key === "size") return [formatBytes(num), "Bytes"]
              return [String(value ?? ""), String(key ?? "")]
            }}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill="url(#overviewUploadsFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function TypeDonutChart({
  byType,
  totalFiles,
  totalSize,
  t,
}: {
  byType: TypeBreakdown[]
  totalFiles: number
  totalSize: number
  t: ReturnType<typeof useTranslations>
}) {
  if (byType.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {t("noFiles")}
      </p>
    )
  }
  const data = byType.map((row) => ({
    name: row.type,
    value: row.count,
    size: row.size,
    color: TYPE_HEX[row.type],
  }))
  return (
    <div className="flex flex-col gap-4">
      <div className="relative h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={72}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: "1px solid hsl(var(--border))",
                background: "hsl(var(--background))",
                fontSize: 12,
              }}
              formatter={(value, _name, props) => {
                const num = typeof value === "number" ? value : Number(value) || 0
                const payload = (props as { payload?: { size?: number; name?: string } }).payload
                const size = payload?.size ?? 0
                return [
                  `${num} (${formatBytes(size)})`,
                  String(payload?.name ?? ""),
                ]
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xs text-muted-foreground">{t("statFiles")}</span>
          <span className="text-2xl font-semibold tabular-nums">
            {totalFiles.toLocaleString()}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {byType.map((row) => {
          const Icon = TYPE_ICONS[row.type]
          const pct =
            totalSize > 0 ? Math.round((row.size / totalSize) * 100) : 0
          return (
            <div key={row.type} className="flex items-center gap-2 text-xs">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: TYPE_HEX[row.type] }}
              />
              <HugeiconsIcon
                icon={Icon}
                strokeWidth={1.8}
                className={cn("size-3.5 text-muted-foreground")}
              />
              <span className="flex-1 capitalize">{t(`types.${row.type}`)}</span>
              <span className="tabular-nums text-muted-foreground">
                {row.count} · {compactBytes(row.size)}
              </span>
              <span className="w-8 text-end font-mono text-[10px] text-muted-foreground">
                {pct}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BucketBarChart({ buckets }: { buckets: BucketBreakdown[] }) {
  // En kalabalik 8 bucket'ta sinirla; uzun list daha asagida zaten linkli.
  const top = [...buckets]
    .sort((a, b) => b.storageUsed - a.storageUsed)
    .slice(0, 8)
  if (top.length === 0) return null
  const data = top.map((b) => ({
    name: b.name.length > 18 ? `${b.name.slice(0, 16)}…` : b.name,
    fullName: b.name,
    size: b.storageUsed,
  }))
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => compactBytes(v)}
            width={48}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--primary) / 0.08)" }}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--background))",
              fontSize: 12,
            }}
            formatter={(value) => {
              const num = typeof value === "number" ? value : Number(value) || 0
              return [formatBytes(num), "Used"]
            }}
            labelFormatter={(_, payload) =>
              (payload?.[0]?.payload as { fullName?: string })?.fullName ?? ""
            }
          />
          <Bar dataKey="size" radius={[6, 6, 0, 0]} fill="hsl(var(--primary))" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function RecentTile({
  item,
  lang,
  slug,
}: {
  item: RecentUpload
  lang: string
  slug: string
}) {
  const ext = getExtension(item.originalName) || "file"
  const style = (defaultStyles as Record<string, unknown>)[ext] ?? {}
  const isImage = item.type === "image"
  const thumbUrl =
    isImage || item.hasThumbnail
      ? `/api/companies/${slug}/buckets/${item.bucketSlug}/media/${item.id}/download?quality=250`
      : null
  const href = item.bucketSlug
    ? `/${lang}/d/${slug}/buckets/${item.bucketSlug}`
    : `/${lang}/d/${slug}`
  // 404 / CDN error / sharp pipeline failure'da broken-image ikonu
  // göstermek yerine extension-aware FileIcon fallback'ine düşeriz —
  // bu strip'in görsel akıcılığı bir tile'ın yüklenememesine kurban
  // gitmesin.
  const [thumbFailed, setThumbFailed] = useState(false)
  const showThumb = thumbUrl && !thumbFailed

  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-all hover:border-foreground/20 hover:shadow-md"
    >
      <div className="aspect-square w-full overflow-hidden bg-muted">
        {showThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl!}
            alt={item.originalName}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-6">
            <div style={{ width: 64, lineHeight: 0 }}>
              <FileIcon extension={ext} {...style} labelUppercase />
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-0.5 p-2">
        <span className="truncate text-xs font-medium" title={item.originalName}>
          {item.originalName}
        </span>
        <span className="truncate text-[10px] text-muted-foreground">
          {item.bucketName ?? "—"}
          {" · "}
          {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
        </span>
      </div>
    </Link>
  )
}
