"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  PlusSignIcon,
  Delete02Icon,
  Edit02Icon,
  ArrowUpRight01Icon,
  ChartBarLineIcon,
  Settings02Icon,
  Database02Icon,
  PulseIcon,
  Copy01Icon,
  Tick02Icon,
  PaintBoardIcon,
  Notification02Icon,
  ImageAdd01Icon,
  Alert02Icon,
  ReloadIcon,
  FlashIcon,
  LockKeyIcon,
  Megaphone01Icon,
  CheckmarkCircle02Icon,
  AlertCircleIcon,
  Calendar01Icon,
  Mail01Icon,
  ClipboardIcon,
} from "@hugeicons/core-free-icons"
import { PageTransition } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { Switch } from "@workspace/ui/components/switch"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@workspace/ui/components/tabs"
import ColorPicker from "@workspace/ui/components/color-picker"
import { LocalizedField, type LocalizedValue } from "@workspace/console/components/shared"
import { useLocale } from "next-intl"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import { confirm } from "@workspace/console/stores/confirm"
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  BarChart,
  Bar,
} from "recharts"

/**
 * Status Page Management — page yoksa Create wizard, varsa Tabs
 * (Overview / Components / Checks / Settings). RP company'lerinin
 * status page'lerini yönetir.
 *
 * 1:1 ilişki: company → page. Slug değiştirilemez (public URL stable).
 * Cascade delete confirm + slug typing zorunlu (yanlışlıkla silimi
 * önleme).
 */

// ─── Shared types ────────────────────────────────────────────────────────

type ProbeStatus = "operational" | "degraded" | "down" | "no-data"

interface StatusPageBranding {
  displayName: string
  primaryColor: string | null
  logoUrl: string | null
  logoLinkUrl: string | null
  tagline: string | null
}

interface StatusPageDetail {
  id: string
  companyId: string
  slug: string
  name: string
  branding: StatusPageBranding
  embedOrigins: string[]
  subscribersEnabled: boolean
  customDomain: string | null
  plan: "free" | "pro"
  maxComponents: number
  maxChecksPerComponent: number
  enabled: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
  stats: {
    components: number
    checks: number
    activeIncidents: number
    activeMaintenances: number
    subscribers: number
  }
}

interface StatusComponentItem {
  id: string
  pageId: string
  name: string
  description: string | null
  groupKey: string | null
  position: number
  visible: boolean
  createdAt: string
}

interface StatusCheckItem {
  id: string
  componentId: string
  pageId: string
  name: string
  type: "http" | "tcp"
  http: {
    url: string
    method: "GET" | "POST" | "HEAD"
    headers: Record<string, string>
    expectedStatusMin: number
    expectedStatusMax: number
    expectedBodyContains: string | null
    timeoutMs: number
    degradedLatencyMs: number
    insecureSkipTlsVerify: boolean
  }
  tcp: {
    host: string
    port: number
    timeoutMs: number
    degradedLatencyMs: number
  } | null
  intervalSeconds: number
  enabled: boolean
  restartTargetId: string | null
  restartFailureThreshold: number
  restartCooldownSeconds: number
}

type IncidentStatusValue = "investigating" | "identified" | "monitoring" | "resolved"
type IncidentImpactValue = "minor" | "major" | "critical"

type ClientLocalizedText = Record<string, string>

interface StatusIncidentUpdateItem {
  id: string
  status: IncidentStatusValue
  body: ClientLocalizedText
  authorId: string | null
  authorName: string | null
  createdAt: string
}

interface StatusIncidentItem {
  id: string
  pageId: string
  title: ClientLocalizedText
  status: IncidentStatusValue
  impact: IncidentImpactValue
  affectedComponentIds: string[]
  source: "manual" | "auto"
  detectedByCheckId: string | null
  startedAt: string
  resolvedAt: string | null
  updates: StatusIncidentUpdateItem[]
  notifiedAt: string | null
  postmortem: ClientLocalizedText | null
  postmortemPublishedAt: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

function pickLocalizedClient(value: ClientLocalizedText | string | null | undefined, lang: string): string {
  if (!value) return ""
  if (typeof value === "string") return value
  if (value[lang]) return value[lang]
  if (value.en) return value.en
  const first = Object.values(value).find((v) => typeof v === "string" && v.length > 0)
  return first ?? ""
}

type MaintenanceStatusValue = "scheduled" | "in_progress" | "completed" | "cancelled"

interface StatusMaintenanceItem {
  id: string
  pageId: string
  title: ClientLocalizedText
  description: ClientLocalizedText
  affectedComponentIds: string[]
  scheduledStart: string
  scheduledEnd: string
  actualStart: string | null
  actualEnd: string | null
  status: MaintenanceStatusValue
  notifiedReminder: boolean
  notifiedStarted: boolean
  notifiedCompleted: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface StatusSubscriberItem {
  id: string
  type: "email" | "webhook"
  target: string
  verified: boolean
  componentFilter: string[]
  topicFilter: string[]
  webhookSecretPrefix: string | null
  createdAt: string
  verifiedAt: string | null
  unsubscribedAt: string | null
}

interface StatusRestartTargetItem {
  id: string
  pageId: string
  name: string
  type: "http" | "ssh" | "coolify"
  enabled: boolean
  totalTriggered: number
  lastTriggeredAt: string | null
  lastResult: { success: boolean; message: string; at: string } | null
  createdAt: string
  updatedAt: string
  hint: {
    url?: string
    host?: string
    baseUrl?: string
    resourceUuid?: string
    hasAuth: boolean
  }
}

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// ─── Root ─────────────────────────────────────────────────────────────────

export function StatusDashboardContent() {
  const params = useParams<{ "company-slug": string; lang?: string }>()
  const companySlug = params["company-slug"]
  const apiBase = `/api/companies/${companySlug}/status-page`
  const t = useTranslations("statusPage")

  const [page, setPage] = useState<StatusPageDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchPage = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(apiBase)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("detail.loadFailed"))
      setPage(json.data) // null veya StatusPageDetail
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("detail.loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [apiBase, t])

  useEffect(() => {
    fetchPage()
  }, [fetchPage])

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col gap-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-full w-full" />
      </div>
    )
  }

  if (!page) {
    return <CreatePageWizard apiBase={apiBase} onCreated={fetchPage} />
  }

  return <PageDetailView page={page} apiBase={apiBase} onReload={fetchPage} />
}

// ─── Create wizard ───────────────────────────────────────────────────────

function CreatePageWizard({
  apiBase,
  onCreated,
}: {
  apiBase: string
  onCreated: () => void
}) {
  const t = useTranslations("statusPage.create")
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  // Slug user tarafından elle düzenlendi mi — true ise name'i takip etmiyoruz
  // (auto-suggest sadece user slug'a girene kadar). Önceki `if (slug)` early
  // return'ü hatalıydı: ilk harf girilince slug "p" oluyor, sonraki harfler
  // dinlenmiyordu.
  const [slugDirty, setSlugDirty] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // name → slug auto-suggest (slug elle düzenlenene kadar)
  useEffect(() => {
    if (slugDirty || !name) return
    const auto = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32)
    setSlug(auto)
  }, [name, slugDirty])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !slug.trim()) {
      toast.error(t("validationRequired"))
      return
    }
    if (!SLUG_REGEX.test(slug)) {
      toast.error(t("slugHint"))
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || t("failureToast"))
        return
      }
      toast.success(t("successToast"))
      onCreated()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("lede", { slug: slug || "{slug}" })}</p>

        <form onSubmit={submit} className="mt-6 grid gap-4 rounded-xl border bg-card p-6">
          <div className="grid gap-2">
            <label htmlFor="sp-name" className="text-xs font-medium">
              {t("nameLabel")}
            </label>
            <Input
              id="sp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              required
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="sp-slug" className="text-xs font-medium">
              {t("slugLabel")}
            </label>
            <Input
              id="sp-slug"
              value={slug}
              onChange={(e) => {
                setSlugDirty(true)
                setSlug(
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, ""),
                )
              }}
              placeholder={t("slugPlaceholder")}
              required
              pattern={SLUG_REGEX.source}
            />
            <p className="text-[11px] text-muted-foreground">{t("slugHint")}</p>
          </div>
          <Button type="submit" disabled={submitting}>
            {submitting ? t("submitting") : t("submit")}
          </Button>
        </form>
      </div>
    </PageTransition>
  )
}

// ─── Page detail (tabs) ──────────────────────────────────────────────────

function PageDetailView({
  page,
  apiBase,
  onReload,
}: {
  page: StatusPageDetail
  apiBase: string
  onReload: () => void
}) {
  const t = useTranslations("statusPage.detail")
  const [tab, setTab] = useState<"overview" | "components" | "checks" | "incidents" | "maintenance" | "subscribers" | "targets" | "audit" | "settings">("overview")

  const statusAppOrigin =
    typeof window !== "undefined" ? window.location.origin : "https://status.sentroy.com"
  const publicUrl = `${statusAppOrigin}/p/${page.slug}`

  return (
    <PageTransition>
      <div className="flex h-[calc(100vh-4rem)] min-w-0 flex-col gap-4">
        <header className="flex min-w-0 items-start justify-between gap-3 border-b pb-4">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-semibold">{page.name}</h1>
              {!page.enabled ? (
                <Badge variant="outline" className="text-[10px]">
                  disabled
                </Badge>
              ) : null}
              <Badge variant={page.plan === "pro" ? "default" : "secondary"} className="text-[10px] uppercase">
                {page.plan}
              </Badge>
            </div>
            <PublicUrlChip url={publicUrl} label={t("publicUrl")} openLabel={t("openPublic")} />
          </div>
        </header>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="min-h-0 min-w-0 flex-1">
          <TabsList>
            <TabsTrigger value="overview">
              <HugeiconsIcon icon={ChartBarLineIcon} strokeWidth={2} className="size-3.5" />
              {t("tabs.overview")}
            </TabsTrigger>
            <TabsTrigger value="components">
              <HugeiconsIcon icon={Database02Icon} strokeWidth={2} className="size-3.5" />
              {t("tabs.components")} ({page.stats.components})
            </TabsTrigger>
            <TabsTrigger value="checks">
              <HugeiconsIcon icon={PulseIcon} strokeWidth={2} className="size-3.5" />
              {t("tabs.checks")} ({page.stats.checks})
            </TabsTrigger>
            <TabsTrigger value="incidents">
              <HugeiconsIcon icon={Megaphone01Icon} strokeWidth={2} className="size-3.5" />
              {t("tabs.incidents")} ({page.stats.activeIncidents})
            </TabsTrigger>
            <TabsTrigger value="maintenance">
              <HugeiconsIcon icon={Calendar01Icon} strokeWidth={2} className="size-3.5" />
              {t("tabs.maintenance")}
            </TabsTrigger>
            <TabsTrigger value="subscribers">
              <HugeiconsIcon icon={Mail01Icon} strokeWidth={2} className="size-3.5" />
              {t("tabs.subscribers")} ({page.stats.subscribers})
            </TabsTrigger>
            <TabsTrigger value="targets">
              <HugeiconsIcon icon={ReloadIcon} strokeWidth={2} className="size-3.5" />
              {t("tabs.targets")}
            </TabsTrigger>
            <TabsTrigger value="audit">
              <HugeiconsIcon icon={ClipboardIcon} strokeWidth={2} className="size-3.5" />
              {t("tabs.audit")}
            </TabsTrigger>
            <TabsTrigger value="settings">
              <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} className="size-3.5" />
              {t("tabs.settings")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="min-h-0 min-w-0 flex-1">
            <ScrollArea className="h-full">
              <div className="pe-3">
                <OverviewTab page={page} publicUrl={publicUrl} />
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="components" className="min-h-0 min-w-0 flex-1">
            <ComponentsTab apiBase={apiBase} onReload={onReload} />
          </TabsContent>
          <TabsContent value="checks" className="min-h-0 min-w-0 flex-1">
            <ChecksTab apiBase={apiBase} onReload={onReload} />
          </TabsContent>
          <TabsContent value="incidents" className="min-h-0 min-w-0 flex-1">
            <IncidentsTab apiBase={apiBase} onReload={onReload} />
          </TabsContent>
          <TabsContent value="maintenance" className="min-h-0 min-w-0 flex-1">
            <MaintenanceTab apiBase={apiBase} onReload={onReload} />
          </TabsContent>
          <TabsContent value="subscribers" className="min-h-0 min-w-0 flex-1">
            <SubscribersTab apiBase={apiBase} onReload={onReload} />
          </TabsContent>
          <TabsContent value="targets" className="min-h-0 min-w-0 flex-1">
            <RestartTargetsTab apiBase={apiBase} onReload={onReload} />
          </TabsContent>
          <TabsContent value="audit" className="min-h-0 min-w-0 flex-1">
            <AuditTab apiBase={apiBase} />
          </TabsContent>
          <TabsContent value="settings" className="min-h-0 min-w-0 flex-1">
            <ScrollArea className="h-full">
              <div className="pe-3">
                <SettingsTab page={page} apiBase={apiBase} onSaved={onReload} />
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </PageTransition>
  )
}

function PublicUrlChip({ url, label, openLabel }: { url: string; label: string; openLabel: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <span className="font-mono uppercase tracking-wider text-muted-foreground">{label}:</span>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 font-mono hover:bg-muted"
      >
        <code className="truncate max-w-[280px]">{url}</code>
        <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} strokeWidth={2} className="size-3" />
      </button>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-foreground/80 hover:text-foreground"
      >
        {openLabel}
        <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={2.2} className="size-3" />
      </a>
    </div>
  )
}

// ─── Overview tab ────────────────────────────────────────────────────────

interface OverviewSnapshot {
  overall: "operational" | "degraded" | "down" | "no-data" | "maintenance"
  components: Array<{
    id: string
    name: string
    status: "operational" | "degraded" | "down" | "no-data" | "maintenance"
    uptime30d: number | null
    dailyHistory: Array<{ date: string; status: "operational" | "degraded" | "down" | "no-data" }>
  }>
  activeIncidents: Array<{ id: string; title: string; impact: string; startedAt: string }>
  pastIncidents: Array<{ id: string; title: string; impact: string; startedAt: string; resolvedAt: string | null }>
}

const STATUS_COLOR = {
  operational: "#22c55e",
  degraded: "#f59e0b",
  down: "#ef4444",
  maintenance: "#3b82f6",
  "no-data": "#a3a3a3",
} as const

const IMPACT_COLOR: Record<string, string> = {
  minor: "#a3a3a3",
  major: "#f59e0b",
  critical: "#ef4444",
}

function statusToScore(s: "operational" | "degraded" | "down" | "no-data"): number | null {
  if (s === "operational") return 100
  if (s === "degraded") return 60
  if (s === "down") return 0
  return null
}

function OverviewTab({ page, publicUrl }: { page: StatusPageDetail; publicUrl: string }) {
  const t = useTranslations("statusPage.overview")
  const stats = page.stats
  const statusAppOrigin = new URL(publicUrl).origin
  const embedCode = `<iframe src="${statusAppOrigin}/p/${page.slug}/embed" width="320" height="80" style="border:0" loading="lazy"></iframe>`
  const embedEnabled = page.subscribersEnabled && page.embedOrigins.length > 0
  const locale = useLocale()

  const [snapshot, setSnapshot] = useState<OverviewSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`${statusAppOrigin}/api/v1/status/${page.slug}?lang=${locale}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setSnapshot(j as OverviewSnapshot)
      })
      .catch(() => {
        if (!cancelled) setSnapshot(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [statusAppOrigin, page.slug, locale])

  // Donut: component status dağılımı
  const statusPie = useMemo(() => {
    if (!snapshot) return []
    const counts: Record<string, number> = {
      operational: 0,
      degraded: 0,
      down: 0,
      maintenance: 0,
      "no-data": 0,
    }
    for (const c of snapshot.components) counts[c.status] = (counts[c.status] ?? 0) + 1
    return (["operational", "degraded", "down", "maintenance", "no-data"] as const)
      .filter((k) => counts[k] > 0)
      .map((k) => ({ name: t(`statusBreakdown.${k}`), value: counts[k], key: k }))
  }, [snapshot, t])

  // Line: son 90 günlük günlük uptime score
  const uptimeTrend = useMemo(() => {
    if (!snapshot || snapshot.components.length === 0) return []
    const series = new Map<string, { sum: number; n: number }>()
    for (const c of snapshot.components) {
      for (const d of c.dailyHistory) {
        const score = statusToScore(d.status)
        if (score === null) continue
        const cur = series.get(d.date) ?? { sum: 0, n: 0 }
        cur.sum += score
        cur.n += 1
        series.set(d.date, cur)
      }
    }
    return Array.from(series.entries())
      .map(([date, v]) => ({ date, score: Math.round(v.sum / v.n) }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-90)
  }, [snapshot])

  // Bar: son 30 günde günlük incident sayısı
  const incidentTrend = useMemo(() => {
    if (!snapshot) return []
    const buckets = new Map<string, number>()
    const now = Date.now()
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000)
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
      buckets.set(key, 0)
    }
    for (const inc of snapshot.pastIncidents) {
      const d = new Date(inc.startedAt)
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1)
    }
    return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }))
  }, [snapshot])

  const overallColor = snapshot ? STATUS_COLOR[snapshot.overall] : STATUS_COLOR["no-data"]
  const recentIncidents = snapshot?.activeIncidents.concat(snapshot.pastIncidents).slice(0, 5) ?? []

  return (
    <div className="grid gap-4 py-2">
      {/* Overall status banner */}
      <div
        className="flex items-center gap-3 rounded-xl border p-4"
        style={{ background: `${overallColor}10`, borderColor: `${overallColor}50` }}
      >
        <span className="relative inline-block size-3 shrink-0">
          <span
            className="absolute inset-0 animate-ping rounded-full opacity-50"
            style={{ background: overallColor }}
          />
          <span
            className="absolute inset-0 rounded-full"
            style={{ background: overallColor }}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold" style={{ color: overallColor }}>
            {snapshot ? t(`overallStatus.${snapshot.overall}`) : t("overallStatus.no-data")}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {snapshot
              ? t("overallSubtitle", {
                  components: snapshot.components.length,
                  active: snapshot.activeIncidents.length,
                })
              : t("overallSubtitleLoading")}
          </p>
        </div>
        <a
          href={publicUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border bg-background px-3 py-1.5 text-[11px] font-medium transition hover:bg-muted"
        >
          {t("openPublic")}
          <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={2.2} className="ml-1 inline size-3" />
        </a>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          icon={Database02Icon}
          label={t("stats.components")}
          value={stats.components.toLocaleString()}
        />
        <StatCard
          icon={PulseIcon}
          label={t("stats.checks")}
          value={stats.checks.toLocaleString()}
        />
        <StatCard
          icon={Alert02Icon}
          label={t("stats.activeIncidents")}
          value={stats.activeIncidents.toLocaleString()}
          accent={stats.activeIncidents > 0 ? STATUS_COLOR.down : undefined}
        />
        <StatCard
          icon={Calendar01Icon}
          label={t("stats.activeMaintenances")}
          value={stats.activeMaintenances.toLocaleString()}
          accent={stats.activeMaintenances > 0 ? STATUS_COLOR.maintenance : undefined}
        />
        <StatCard
          icon={Notification02Icon}
          label={t("stats.subscribers")}
          value={stats.subscribers.toLocaleString()}
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-3 lg:grid-cols-[1fr_2fr]">
        {/* Donut: component status breakdown */}
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between pb-2">
            <h3 className="text-sm font-semibold">{t("breakdownTitle")}</h3>
            <span className="text-[10px] text-muted-foreground">
              {snapshot?.components.length ?? 0} {t("componentsLabelSmall")}
            </span>
          </div>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : statusPie.length === 0 ? (
            <div className="grid h-48 place-items-center text-xs text-muted-foreground">
              {t("noData")}
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_auto] items-center gap-3">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={statusPie}
                    dataKey="value"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {statusPie.map((d) => (
                      <Cell key={d.key} fill={STATUS_COLOR[d.key]} />
                    ))}
                  </Pie>
                  <RTooltip
                    contentStyle={{
                      background: "var(--background)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontSize: 11,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <ul className="space-y-1.5 text-[11px]">
                {statusPie.map((d) => (
                  <li key={d.key} className="flex items-center gap-2">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: STATUS_COLOR[d.key] }}
                    />
                    <span>{d.name}</span>
                    <span className="ml-auto font-medium tabular-nums">{d.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Line: 90-day uptime trend */}
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between pb-2">
            <h3 className="text-sm font-semibold">{t("uptimeTrendTitle")}</h3>
            <span className="text-[10px] text-muted-foreground">{t("uptimeTrendWindow")}</span>
          </div>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : uptimeTrend.length === 0 ? (
            <div className="grid h-48 place-items-center text-xs text-muted-foreground">
              {t("noData")}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={uptimeTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v: string) => v.slice(5)}
                  interval={Math.max(0, Math.floor(uptimeTrend.length / 10))}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  width={32}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <RTooltip
                  contentStyle={{
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                  formatter={(value) => [`${value}%`, t("uptimeLabel")]}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke={STATUS_COLOR.operational}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Incident bar + recent list */}
      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between pb-2">
            <h3 className="text-sm font-semibold">{t("incidentTrendTitle")}</h3>
            <span className="text-[10px] text-muted-foreground">{t("incidentTrendWindow")}</span>
          </div>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={incidentTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v: string) => v.slice(5)}
                  interval={3}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  width={24}
                />
                <RTooltip
                  contentStyle={{
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                />
                <Bar dataKey="count" fill={STATUS_COLOR.degraded} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h3 className="pb-2 text-sm font-semibold">{t("recentIncidentsTitle")}</h3>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : recentIncidents.length === 0 ? (
            <p className="rounded-md border border-dashed py-6 text-center text-[11px] text-muted-foreground">
              {t("recentIncidentsEmpty")}
            </p>
          ) : (
            <ul className="space-y-2 text-xs">
              {recentIncidents.map((inc) => (
                <li
                  key={inc.id}
                  className="flex items-start gap-2 rounded-md border bg-muted/20 p-2"
                >
                  <span
                    className="mt-1 size-2 shrink-0 rounded-full"
                    style={{ background: IMPACT_COLOR[inc.impact] ?? STATUS_COLOR["no-data"] }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{inc.title}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(inc.startedAt).toLocaleString()}
                      {" · "}
                      <span className="capitalize">{inc.impact}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Embed code (mevcut) */}
      <div className="rounded-xl border bg-card p-4">
        <h3 className="text-sm font-semibold">{t("embedTitle")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("embedHint")}</p>
        {embedEnabled ? (
          <pre className="mt-3 overflow-x-auto rounded-md border bg-muted/40 p-3 text-[11px]">
            <code>{embedCode}</code>
          </pre>
        ) : (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            {t("embedDisabled")}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon?: typeof Database02Icon
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        {icon ? (
          <HugeiconsIcon
            icon={icon}
            strokeWidth={2}
            className="size-3.5 text-muted-foreground"
          />
        ) : null}
      </div>
      <div
        className="mt-1 text-2xl font-semibold tabular-nums"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
    </div>
  )
}

// ─── Components tab ──────────────────────────────────────────────────────

function ComponentsTab({ apiBase, onReload }: { apiBase: string; onReload: () => void }) {
  const t = useTranslations("statusPage.components")
  const [components, setComponents] = useState<StatusComponentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<StatusComponentItem | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${apiBase}/components`)
      const json = await res.json()
      if (res.ok) setComponents(json.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function deleteOne(c: StatusComponentItem) {
    const ok = await confirm({
      title: t("deleteConfirmTitle", { name: c.name }),
      description: t("deleteConfirmDescription"),
      confirmText: t("deleteConfirmAction"),
      destructive: true,
    })
    if (!ok) return
    const res = await fetch(`${apiBase}/components/${c.id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success(t("deleteSuccessToast"))
      fetchAll()
      onReload()
    } else {
      toast.error(t("deleteFailureToast"))
    }
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
      <div className="flex items-center justify-end pb-2">
        <Button
          size="sm"
          onClick={() => {
            setEditTarget(null)
            setDialogOpen(true)
          }}
        >
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} data-icon="inline-start" />
          {t("newButton")}
        </Button>
      </div>

      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <div className="pe-3">
          {loading ? (
            <div className="space-y-2 py-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : components.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <h3 className="text-sm font-semibold">{t("emptyTitle")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t("emptyBody")}</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              {components.map((c, idx) => (
                <div
                  key={c.id}
                  className={`flex items-center gap-3 px-4 py-3 text-sm ${idx > 0 ? "border-t" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{c.name}</span>
                      {c.groupKey ? (
                        <Badge variant="outline" className="text-[10px]">
                          {c.groupKey}
                        </Badge>
                      ) : null}
                      {!c.visible ? (
                        <Badge variant="outline" className="text-[10px]">
                          hidden
                        </Badge>
                      ) : null}
                    </div>
                    {c.description ? (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{c.description}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => {
                        setEditTarget(c)
                        setDialogOpen(true)
                      }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Edit"
                    >
                      <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} className="size-4" />
                    </button>
                    <button
                      onClick={() => deleteOne(c)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Delete"
                    >
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <ComponentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        apiBase={apiBase}
        editTarget={editTarget}
        onSaved={() => {
          fetchAll()
          onReload()
        }}
      />
    </div>
  )
}

function ComponentDialog({
  open,
  onOpenChange,
  apiBase,
  editTarget,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  apiBase: string
  editTarget: StatusComponentItem | null
  onSaved: () => void
}) {
  const t = useTranslations("statusPage.components")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [groupKey, setGroupKey] = useState("")
  const [visible, setVisible] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(editTarget?.name ?? "")
    setDescription(editTarget?.description ?? "")
    setGroupKey(editTarget?.groupKey ?? "")
    setVisible(editTarget?.visible ?? true)
  }, [open, editTarget])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        groupKey: groupKey.trim() || null,
        visible,
      }
      const url = editTarget ? `${apiBase}/components/${editTarget.id}` : `${apiBase}/components`
      const method = editTarget ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || (editTarget ? t("updateFailureToast") : t("createFailureToast")))
        return
      }
      toast.success(editTarget ? t("updateSuccessToast") : t("createSuccessToast"))
      onOpenChange(false)
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editTarget ? t("dialogTitleEdit") : t("dialogTitleNew")}</DialogTitle>
          <DialogDescription>{t("emptyBody")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <label htmlFor="cmp-name" className="text-xs font-medium">
              {t("nameLabel")}
            </label>
            <Input
              id="cmp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              required
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="cmp-desc" className="text-xs font-medium">
              {t("descriptionLabel")}
            </label>
            <Textarea
              id="cmp-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
              rows={2}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="cmp-group" className="text-xs font-medium">
              {t("groupLabel")}
            </label>
            <Input
              id="cmp-group"
              value={groupKey}
              onChange={(e) => setGroupKey(e.target.value)}
              placeholder={t("groupPlaceholder")}
            />
            <p className="text-[11px] text-muted-foreground">{t("groupHint")}</p>
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <div className="text-sm font-medium">{t("visibleLabel")}</div>
              <p className="text-[11px] text-muted-foreground">{t("visibleHint")}</p>
            </div>
            <Switch checked={visible} onCheckedChange={setVisible} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Checks tab ──────────────────────────────────────────────────────────

function ChecksTab({ apiBase, onReload }: { apiBase: string; onReload: () => void }) {
  const t = useTranslations("statusPage.checks")
  const [checks, setChecks] = useState<StatusCheckItem[]>([])
  const [components, setComponents] = useState<StatusComponentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<StatusCheckItem | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [ck, cm] = await Promise.all([
        fetch(`${apiBase}/checks`).then((r) => r.json()),
        fetch(`${apiBase}/components`).then((r) => r.json()),
      ])
      setChecks(ck.data ?? [])
      setComponents(cm.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const componentLookup = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of components) map.set(c.id, c.name)
    return (id: string) => map.get(id) ?? "Unknown"
  }, [components])

  async function deleteOne(c: StatusCheckItem) {
    const ok = await confirm({
      title: t("deleteConfirmTitle", { name: c.name }),
      description: t("deleteConfirmDescription"),
      confirmText: t("deleteConfirmAction"),
      destructive: true,
    })
    if (!ok) return
    const res = await fetch(`${apiBase}/checks/${c.id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success(t("deleteSuccessToast"))
      fetchAll()
      onReload()
    } else {
      toast.error(t("deleteFailureToast"))
    }
  }

  async function toggleEnabled(c: StatusCheckItem) {
    const res = await fetch(`${apiBase}/checks/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !c.enabled }),
    })
    if (res.ok) fetchAll()
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
      <div className="flex items-center justify-end pb-2">
        <Button
          size="sm"
          disabled={components.length === 0}
          onClick={() => {
            setEditTarget(null)
            setDialogOpen(true)
          }}
        >
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} data-icon="inline-start" />
          {t("newButton")}
        </Button>
      </div>

      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <div className="pe-3">
          {loading ? (
            <div className="space-y-2 py-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : checks.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <h3 className="text-sm font-semibold">{t("emptyTitle")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t("emptyBody")}</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              {checks.map((c, idx) => (
                <div
                  key={c.id}
                  className={`flex items-center gap-3 px-4 py-3 text-sm ${idx > 0 ? "border-t" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{c.name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {componentLookup(c.componentId)}
                      </Badge>
                      {!c.enabled ? (
                        <Badge variant="outline" className="text-[10px]">
                          paused
                        </Badge>
                      ) : null}
                    </div>
                    <code className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {c.http.method} {c.http.url} · every {c.intervalSeconds}s
                    </code>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Switch checked={c.enabled} onCheckedChange={() => toggleEnabled(c)} />
                    <button
                      onClick={() => {
                        setEditTarget(c)
                        setDialogOpen(true)
                      }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Edit"
                    >
                      <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} className="size-4" />
                    </button>
                    <button
                      onClick={() => deleteOne(c)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Delete"
                    >
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <CheckDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        apiBase={apiBase}
        components={components}
        editTarget={editTarget}
        onSaved={() => {
          fetchAll()
          onReload()
        }}
      />
    </div>
  )
}

function CheckDialog({
  open,
  onOpenChange,
  apiBase,
  components,
  editTarget,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  apiBase: string
  components: StatusComponentItem[]
  editTarget: StatusCheckItem | null
  onSaved: () => void
}) {
  const t = useTranslations("statusPage.checks")
  const [componentId, setComponentId] = useState("")
  const [name, setName] = useState("")
  const [type, setType] = useState<"http" | "tcp">("http")
  // HTTP fields
  const [url, setUrl] = useState("")
  const [method, setMethod] = useState<"GET" | "POST" | "HEAD">("GET")
  const [expectedMin, setExpectedMin] = useState(200)
  const [expectedMax, setExpectedMax] = useState(299)
  const [expectedBody, setExpectedBody] = useState("")
  const [insecure, setInsecure] = useState(false)
  // TCP fields
  const [tcpHost, setTcpHost] = useState("")
  const [tcpPort, setTcpPort] = useState(80)
  // Common
  const [intervalSeconds, setIntervalSeconds] = useState(60)
  const [timeoutMs, setTimeoutMs] = useState(10000)
  const [degradedMs, setDegradedMs] = useState(1000)
  const [restartTargetId, setRestartTargetId] = useState<string>("")
  const [restartThreshold, setRestartThreshold] = useState(3)
  const [restartCooldown, setRestartCooldown] = useState(600)
  const [availableTargets, setAvailableTargets] = useState<StatusRestartTargetItem[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setComponentId(editTarget?.componentId ?? components[0]?.id ?? "")
    setName(editTarget?.name ?? "")
    setType(editTarget?.type ?? "http")
    setUrl(editTarget?.http.url ?? "")
    setMethod((editTarget?.http.method ?? "GET") as typeof method)
    setExpectedMin(editTarget?.http.expectedStatusMin ?? 200)
    setExpectedMax(editTarget?.http.expectedStatusMax ?? 299)
    setExpectedBody(editTarget?.http.expectedBodyContains ?? "")
    setInsecure(editTarget?.http.insecureSkipTlsVerify ?? false)
    setTcpHost(editTarget?.tcp?.host ?? "")
    setTcpPort(editTarget?.tcp?.port ?? 80)
    setIntervalSeconds(editTarget?.intervalSeconds ?? 60)
    setTimeoutMs(
      editTarget?.type === "tcp"
        ? (editTarget?.tcp?.timeoutMs ?? 10000)
        : (editTarget?.http.timeoutMs ?? 10000),
    )
    setDegradedMs(
      editTarget?.type === "tcp"
        ? (editTarget?.tcp?.degradedLatencyMs ?? 1000)
        : (editTarget?.http.degradedLatencyMs ?? 1000),
    )
    setRestartTargetId(editTarget?.restartTargetId ?? "")
    setRestartThreshold(editTarget?.restartFailureThreshold ?? 3)
    setRestartCooldown(editTarget?.restartCooldownSeconds ?? 600)
    fetch(`${apiBase}/restart-targets`)
      .then((r) => r.json())
      .then((j) => setAvailableTargets(j.data ?? []))
      .catch(() => setAvailableTargets([]))
  }, [open, editTarget, components, apiBase])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!componentId || !name.trim()) return
    if (type === "http" && !url.trim()) return
    if (type === "tcp" && !tcpHost.trim()) return
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        componentId,
        name: name.trim(),
        type,
        intervalSeconds,
        restartTargetId: restartTargetId || null,
        restartFailureThreshold: restartThreshold,
        restartCooldownSeconds: restartCooldown,
      }
      if (type === "http") {
        body.http = {
          url: url.trim(),
          method,
          headers: {},
          expectedStatusMin: expectedMin,
          expectedStatusMax: expectedMax,
          expectedBodyContains: expectedBody.trim() || null,
          timeoutMs,
          degradedLatencyMs: degradedMs,
          insecureSkipTlsVerify: insecure,
        }
      } else {
        body.tcp = {
          host: tcpHost.trim(),
          port: tcpPort,
          timeoutMs,
          degradedLatencyMs: degradedMs,
        }
      }
      const url2 = editTarget ? `${apiBase}/checks/${editTarget.id}` : `${apiBase}/checks`
      const method2 = editTarget ? "PATCH" : "POST"
      const res = await fetch(url2, {
        method: method2,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || (editTarget ? t("updateFailureToast") : t("createFailureToast")))
        return
      }
      toast.success(editTarget ? t("updateSuccessToast") : t("createSuccessToast"))
      onOpenChange(false)
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editTarget ? t("dialogTitleEdit") : t("dialogTitleNew")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <label className="text-xs font-medium">{t("componentLabel")}</label>
            {components.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("componentPlaceholder")}</p>
            ) : (
              <select
                value={componentId}
                onChange={(e) => setComponentId(e.target.value)}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                {components.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {!editTarget ? (
            <div className="grid gap-1.5">
              <label className="text-xs font-medium">{t("typeLabel")}</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(["http", "tcp"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setType(opt)}
                    className={`rounded-md border px-3 py-2 text-xs font-medium transition ${type === opt ? "border-foreground bg-foreground text-background" : "hover:bg-muted"}`}
                  >
                    {t(`type.${opt}`)}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">{t(`typeHint.${type}`)}</p>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
              <Badge variant="outline" className="uppercase">{type}</Badge>
              <span className="text-muted-foreground">{t("editTypeLocked")}</span>
            </div>
          )}
          <div className="grid gap-1.5">
            <label className="text-xs font-medium">{t("nameLabel")}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} required />
          </div>
          {type === "http" ? (
            <div className="grid gap-1.5 sm:grid-cols-[1fr_120px] sm:gap-2">
              <div className="grid gap-1.5">
                <label className="text-xs font-medium">{t("urlLabel")}</label>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={t("urlPlaceholder")}
                  type="url"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium">{t("methodLabel")}</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as typeof method)}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="HEAD">HEAD</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-[1fr_120px] sm:gap-2">
              <div className="grid gap-1.5">
                <label className="text-xs font-medium">{t("tcpHostLabel")}</label>
                <Input
                  value={tcpHost}
                  onChange={(e) => setTcpHost(e.target.value)}
                  placeholder={t("tcpHostPlaceholder")}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium">{t("tcpPortLabel")}</label>
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={tcpPort}
                  onChange={(e) => setTcpPort(Number(e.target.value) || 80)}
                />
              </div>
            </div>
          )}
          <div className="grid gap-1.5">
            <label className="text-xs font-medium">{t("intervalLabel")}</label>
            <Input
              type="number"
              min={30}
              max={3600}
              value={intervalSeconds}
              onChange={(e) => setIntervalSeconds(Number(e.target.value) || 60)}
            />
            <p className="text-[11px] text-muted-foreground">{t("intervalHint")}</p>
          </div>
          {type === "http" ? (
            <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-2">
              <div className="grid gap-1.5">
                <label className="text-xs font-medium">{t("expectedStatusLabel")}</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={100}
                    max={599}
                    value={expectedMin}
                    onChange={(e) => setExpectedMin(Number(e.target.value) || 200)}
                  />
                  <span className="text-muted-foreground">→</span>
                  <Input
                    type="number"
                    min={100}
                    max={599}
                    value={expectedMax}
                    onChange={(e) => setExpectedMax(Number(e.target.value) || 299)}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium">{t("expectedBodyLabel")}</label>
                <Input
                  value={expectedBody}
                  onChange={(e) => setExpectedBody(e.target.value)}
                  placeholder={t("expectedBodyPlaceholder")}
                />
              </div>
            </div>
          ) : null}
          <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-2">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium">{t("timeoutLabel")}</label>
              <Input
                type="number"
                min={1000}
                max={60000}
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(Number(e.target.value) || 10000)}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium">{t("degradedLabel")}</label>
              <Input
                type="number"
                min={100}
                max={60000}
                value={degradedMs}
                onChange={(e) => setDegradedMs(Number(e.target.value) || 1000)}
              />
              <p className="text-[11px] text-muted-foreground">{t("degradedHint")}</p>
            </div>
          </div>
          {type === "http" ? (
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <div className="text-sm font-medium">{t("insecureLabel")}</div>
                <p className="text-[11px] text-muted-foreground">{t("insecureHint")}</p>
              </div>
              <Switch checked={insecure} onCheckedChange={setInsecure} />
            </div>
          ) : null}

          <div className="grid gap-2 rounded-md border bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <HugeiconsIcon icon={ReloadIcon} strokeWidth={2} className="size-3.5" />
              {t("restartSectionTitle")}
            </div>
            <p className="text-[11px] text-muted-foreground">{t("restartSectionHint")}</p>
            <div className="grid gap-1.5">
              <label className="text-[11px] font-medium">{t("restartTargetLabel")}</label>
              <select
                value={restartTargetId}
                onChange={(e) => setRestartTargetId(e.target.value)}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                <option value="">{t("restartTargetNone")}</option>
                {availableTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name}
                    {!target.enabled ? " (paused)" : ""}
                  </option>
                ))}
              </select>
            </div>
            {restartTargetId ? (
              <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-2">
                <div className="grid gap-1.5">
                  <label className="text-[11px] font-medium">{t("restartThresholdLabel")}</label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={restartThreshold}
                    onChange={(e) => setRestartThreshold(Number(e.target.value) || 3)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-[11px] font-medium">{t("restartCooldownLabel")}</label>
                  <Input
                    type="number"
                    min={60}
                    max={3600}
                    value={restartCooldown}
                    onChange={(e) => setRestartCooldown(Number(e.target.value) || 600)}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Settings tab ────────────────────────────────────────────────────────

const COLOR_SWATCHES = [
  { name: "Slate", value: "#111111" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Pink", value: "#ec4899" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Emerald", value: "#10b981" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Sky", value: "#0ea5e9" },
]

function SettingsTab({
  page,
  apiBase,
  onSaved,
}: {
  page: StatusPageDetail
  apiBase: string
  onSaved: () => void
}) {
  const t = useTranslations("statusPage.settings")
  const [name, setName] = useState(page.name)
  const [displayName, setDisplayName] = useState(page.branding.displayName)
  const [primaryColor, setPrimaryColor] = useState(page.branding.primaryColor ?? "#111111")
  const [logoUrl, setLogoUrl] = useState(page.branding.logoUrl ?? "")
  const [logoLinkUrl, setLogoLinkUrl] = useState(page.branding.logoLinkUrl ?? "")
  const [tagline, setTagline] = useState(page.branding.tagline ?? "")
  const [enabled, setEnabled] = useState(page.enabled)
  const [subscribersEnabled, setSubscribersEnabled] = useState(page.subscribersEnabled)
  const [embedOriginsText, setEmbedOriginsText] = useState(page.embedOrigins.join("\n"))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Live branding preview için — value değişince anında reflect
  const previewBranding = {
    displayName: displayName.trim() || name.trim() || "Untitled",
    tagline: tagline.trim() || null,
    primaryColor: primaryColor || "#111111",
    logoUrl: logoUrl.trim() || null,
  }

  async function save() {
    setSaving(true)
    try {
      const embedOrigins = embedOriginsText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          branding: {
            displayName: displayName.trim(),
            primaryColor: primaryColor || null,
            logoUrl: logoUrl.trim() || null,
            logoLinkUrl: logoLinkUrl.trim() || null,
            tagline: tagline.trim() || null,
          },
          enabled,
          subscribersEnabled,
          embedOrigins,
        }),
      })
      if (res.ok) {
        toast.success(t("saveSuccessToast"))
        onSaved()
      } else {
        const json = await res.json()
        toast.error(json.error || t("saveFailureToast"))
      }
    } finally {
      setSaving(false)
    }
  }

  async function deletePage() {
    const ok = await confirm({
      title: t("deleteConfirmTitle"),
      description: t("deleteConfirmDescription"),
      confirmText: t("deleteConfirmAction"),
      destructive: true,
    })
    if (!ok) return
    setDeleting(true)
    try {
      const res = await fetch(apiBase, { method: "DELETE" })
      if (res.ok) {
        toast.success(t("deleteSuccessToast"))
        onSaved()
      } else {
        toast.error(t("deleteFailureToast"))
      }
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="grid gap-5 py-2">
      <BrandingPreview branding={previewBranding} />

      <Section icon={Settings02Icon} title={t("general")}>
        <Field label={t("nameLabel")} hint={t("nameHint")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-md" />
        </Field>
        <Field
          label={t("enabledLabel")}
          hint={t("enabledHint")}
          rightSlot
        >
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </Field>
      </Section>

      <Section icon={PaintBoardIcon} title={t("branding")}>
        <Field label={t("displayNameLabel")} hint={t("displayNameHint")}>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="max-w-md"
          />
        </Field>
        <Field label={t("taglineLabel")}>
          <Input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            className="max-w-md"
          />
        </Field>

        {/* Primary color — popover RGBA picker + hex input + preset swatches */}
        <div className="grid gap-2">
          <label className="text-xs font-medium">{t("primaryColorLabel")}</label>
          <div className="flex items-center gap-2 max-w-md">
            <ColorPicker
              value={primaryColor}
              onChange={(next) => setPrimaryColor(next)}
            >
              <div
                className="h-10 w-12 cursor-pointer overflow-hidden rounded-md border shadow-sm transition hover:scale-[1.02]"
                style={{ background: primaryColor }}
                title="Open color picker"
                role="button"
                aria-label={t("primaryColorLabel")}
              />
            </ColorPicker>
            <Input
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="font-mono text-xs uppercase"
              placeholder="#000000"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {COLOR_SWATCHES.map((sw) => {
              const isActive = primaryColor.toLowerCase() === sw.value.toLowerCase()
              return (
                <button
                  key={sw.value}
                  type="button"
                  onClick={() => setPrimaryColor(sw.value)}
                  title={sw.name}
                  className={`h-7 w-7 rounded-md border-2 transition-transform hover:scale-110 ${
                    isActive
                      ? "border-foreground ring-2 ring-ring/30"
                      : "border-border/60"
                  }`}
                  style={{ background: sw.value }}
                  aria-label={`Set color ${sw.name}`}
                  aria-pressed={isActive}
                />
              )
            })}
          </div>
        </div>

        {/* Logo URL + canlı preview */}
        <div className="grid gap-2">
          <label className="text-xs font-medium">{t("logoUrlLabel")}</label>
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background"
              aria-label="Logo preview"
            >
              {logoUrl.trim() ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={logoUrl.trim()}
                  alt="Logo"
                  className="h-full w-full object-contain"
                  onError={(e) => {
                    e.currentTarget.style.opacity = "0.2"
                  }}
                  onLoad={(e) => {
                    e.currentTarget.style.opacity = "1"
                  }}
                />
              ) : (
                <HugeiconsIcon
                  icon={ImageAdd01Icon}
                  strokeWidth={1.5}
                  className="size-4 text-muted-foreground"
                />
              )}
            </div>
            <Input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder={t("logoUrlPlaceholder")}
              className="flex-1"
            />
          </div>
        </div>

        <div className="grid gap-2">
          <label className="text-xs font-medium">{t("logoLinkUrlLabel")}</label>
          <Input
            value={logoLinkUrl}
            onChange={(e) => setLogoLinkUrl(e.target.value)}
            placeholder={t("logoLinkUrlPlaceholder")}
            type="url"
          />
          <p className="text-[11px] text-muted-foreground">{t("logoLinkUrlHint")}</p>
        </div>
      </Section>

      <Section icon={Notification02Icon} title={t("subscribers")}>
        <Field
          label={t("subscribersToggle")}
          hint={t("subscribersHint")}
          rightSlot
        >
          <Switch checked={subscribersEnabled} onCheckedChange={setSubscribersEnabled} />
        </Field>
        <div className="grid gap-1.5">
          <label className="text-xs font-medium">{t("embedOriginsLabel")}</label>
          <Textarea
            rows={3}
            value={embedOriginsText}
            onChange={(e) => setEmbedOriginsText(e.target.value)}
            placeholder={t("embedOriginsPlaceholder")}
            className="font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground">{t("embedOriginsHint")}</p>
        </div>
      </Section>

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <Button onClick={save} disabled={saving}>
          {saving ? t("saving") : t("save")}
        </Button>
      </div>

      {/* Danger zone — daha belirgin: kırmızı kart, ayrı görsel hiyerarşi */}
      <div className="mt-2 rounded-xl border border-destructive/40 bg-destructive/5 p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
            <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-destructive">{t("deleteTitle")}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t("deleteHint")}</p>
            <Button
              variant="destructive"
              size="sm"
              className="mt-3"
              onClick={deletePage}
              disabled={deleting}
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} data-icon="inline-start" />
              {t("deleteButton")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Live branding preview — input değiştikçe public sayfanın header'ı
 * gerçek zamanlı render edilir. Save'den önce kullanıcı "nasıl görünecek"
 * sorusunu cevaplar.
 */
function BrandingPreview({
  branding,
}: {
  branding: {
    displayName: string
    tagline: string | null
    primaryColor: string
    logoUrl: string | null
  }
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div
        className="h-1.5 w-full"
        style={{ background: branding.primaryColor }}
        aria-hidden
      />
      <div className="flex items-center gap-3 px-5 py-4">
        {branding.logoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={branding.logoUrl}
            alt={branding.displayName}
            className="h-10 max-w-[180px] object-contain"
          />
        ) : (
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg text-base font-semibold text-white"
            style={{ background: branding.primaryColor }}
          >
            {branding.displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold">{branding.displayName}</div>
          {branding.tagline ? (
            <div className="truncate text-xs text-muted-foreground">{branding.tagline}</div>
          ) : null}
        </div>
        <span className="hidden text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">
          Live preview
        </span>
      </div>
    </div>
  )
}

function Section({
  icon,
  title,
  children,
}: {
  icon: typeof Settings02Icon
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <HugeiconsIcon icon={icon} strokeWidth={2} className="size-3.5" />
        </div>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

/**
 * Field layout — iki mode:
 *   - default (rightSlot=false): label üstte, children altta full width
 *     (Input gibi geniş alanlar için).
 *   - rightSlot=true: label sol, children sağ (Switch gibi compact
 *     control'lar için tek satır).
 *
 * hint her zaman field'in altında, küçük metin.
 */
function Field({
  label,
  hint,
  rightSlot,
  children,
}: {
  label: string
  hint?: string
  rightSlot?: boolean
  children: React.ReactNode
}) {
  if (rightSlot) {
    return (
      <div className="grid gap-1">
        <div className="flex items-center justify-between gap-3">
          <label className="text-sm font-medium">{label}</label>
          {children}
        </div>
        {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      </div>
    )
  }
  return (
    <div className="grid gap-1.5">
      <label className="text-xs font-medium">{label}</label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

// ─── Incidents tab ───────────────────────────────────────────────────────

const IMPACT_BADGE: Record<IncidentImpactValue, string> = {
  minor: "border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
  major: "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  critical: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
}

const STATUS_BADGE: Record<IncidentStatusValue, string> = {
  investigating: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  identified: "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  monitoring: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  resolved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
}

function IncidentsTab({ apiBase, onReload }: { apiBase: string; onReload: () => void }) {
  const t = useTranslations("statusPage.incidents")
  const locale = useLocale()
  const [incidents, setIncidents] = useState<StatusIncidentItem[]>([])
  const [components, setComponents] = useState<StatusComponentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [detailTarget, setDetailTarget] = useState<StatusIncidentItem | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [inc, cm] = await Promise.all([
        fetch(`${apiBase}/incidents?scope=all&limit=50`).then((r) => r.json()),
        fetch(`${apiBase}/components`).then((r) => r.json()),
      ])
      setIncidents(inc.data ?? [])
      setComponents(cm.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const active = incidents.filter((i) => i.status !== "resolved")
  const resolved = incidents.filter((i) => i.status === "resolved")

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between pb-2">
        <p className="text-xs text-muted-foreground">{t("description")}</p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} data-icon="inline-start" />
          {t("newButton")}
        </Button>
      </div>

      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <div className="space-y-4 pe-3">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-md" />
              ))}
            </div>
          ) : incidents.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <h3 className="text-sm font-semibold">{t("emptyTitle")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t("emptyBody")}</p>
            </div>
          ) : (
            <>
              {active.length > 0 ? (
                <section>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("activeHeading")} ({active.length})
                  </h3>
                  <div className="space-y-2">
                    {active.map((inc) => (
                      <IncidentCard
                        key={inc.id}
                        incident={inc}
                        components={components}
                        locale={locale}
                        onClick={() => setDetailTarget(inc)}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
              {resolved.length > 0 ? (
                <section>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("resolvedHeading")} ({resolved.length})
                  </h3>
                  <div className="space-y-2">
                    {resolved.map((inc) => (
                      <IncidentCard
                        key={inc.id}
                        incident={inc}
                        components={components}
                        locale={locale}
                        onClick={() => setDetailTarget(inc)}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      </ScrollArea>

      <IncidentCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        apiBase={apiBase}
        components={components}
        onSaved={() => {
          fetchAll()
          onReload()
        }}
      />
      <IncidentDetailDialog
        incident={detailTarget}
        onClose={() => setDetailTarget(null)}
        apiBase={apiBase}
        components={components}
        locale={locale}
        onChanged={() => {
          fetchAll()
          onReload()
        }}
      />
    </div>
  )
}

function IncidentCard({
  incident,
  components,
  locale,
  onClick,
}: {
  incident: StatusIncidentItem
  components: StatusComponentItem[]
  locale: string
  onClick: () => void
}) {
  const componentNames = useMemo(() => {
    const lookup = new Map(components.map((c) => [c.id, c.name]))
    return incident.affectedComponentIds.map((id) => lookup.get(id) ?? "?")
  }, [incident.affectedComponentIds, components])
  const lastUpdate = incident.updates[incident.updates.length - 1]

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-xl border bg-card p-4 text-start transition hover:bg-muted/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{pickLocalizedClient(incident.title, locale)}</span>
            {incident.source === "auto" ? (
              <Badge variant="outline" className="text-[10px] uppercase">
                auto
              </Badge>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={`text-[10px] capitalize ${STATUS_BADGE[incident.status]}`}>
              {incident.status}
            </Badge>
            <Badge variant="outline" className={`text-[10px] capitalize ${IMPACT_BADGE[incident.impact]}`}>
              {incident.impact}
            </Badge>
            {componentNames.map((name, i) => (
              <Badge key={i} variant="outline" className="text-[10px]">
                {name}
              </Badge>
            ))}
          </div>
          {lastUpdate ? (
            <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">
              {pickLocalizedClient(lastUpdate.body, locale)}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-end text-[10px] text-muted-foreground">
          <div>{new Date(incident.startedAt).toLocaleString()}</div>
          {incident.resolvedAt ? (
            <div className="mt-0.5 text-emerald-600 dark:text-emerald-400">
              ✓ {new Date(incident.resolvedAt).toLocaleTimeString()}
            </div>
          ) : null}
        </div>
      </div>
    </button>
  )
}

function IncidentCreateDialog({
  open,
  onOpenChange,
  apiBase,
  components,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  apiBase: string
  components: StatusComponentItem[]
  onSaved: () => void
}) {
  const t = useTranslations("statusPage.incidents")
  const locale = useLocale()
  const [title, setTitle] = useState<LocalizedValue>({ tr: "", en: "" })
  const [initialStatus, setInitialStatus] = useState<IncidentStatusValue>("investigating")
  const [impact, setImpact] = useState<IncidentImpactValue>("minor")
  const [selectedComponents, setSelectedComponents] = useState<Set<string>>(new Set())
  const [initialUpdateBody, setInitialUpdateBody] = useState<LocalizedValue>({ tr: "", en: "" })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle({ tr: "", en: "" })
    setInitialStatus("investigating")
    setImpact("minor")
    setSelectedComponents(new Set())
    setInitialUpdateBody({ tr: "", en: "" })
  }, [open])

  const titleEmpty = !Object.values(title).some((v) => v.trim().length > 0)

  function toggleComponent(id: string) {
    setSelectedComponents((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (titleEmpty) return
    const updateHasAny = Object.values(initialUpdateBody).some((v) => v.trim().length > 0)
    setSubmitting(true)
    try {
      const res = await fetch(`${apiBase}/incidents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          initialStatus,
          impact,
          affectedComponentIds: Array.from(selectedComponents),
          initialUpdateBody: updateHasAny ? initialUpdateBody : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || t("createFailureToast"))
        return
      }
      toast.success(t("createSuccessToast"))
      onOpenChange(false)
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("createDialogTitle")}</DialogTitle>
          <DialogDescription>{t("createDialogDescription")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <LocalizedField
            label={t("titleLabel")}
            value={title}
            onChange={setTitle}
            placeholder={t("titlePlaceholder")}
            defaultLocale={locale}
          />

          <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-2">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium">{t("statusLabel")}</label>
              <select
                value={initialStatus}
                onChange={(e) => setInitialStatus(e.target.value as IncidentStatusValue)}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                <option value="investigating">{t("statusInvestigating")}</option>
                <option value="identified">{t("statusIdentified")}</option>
                <option value="monitoring">{t("statusMonitoring")}</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium">{t("impactLabel")}</label>
              <select
                value={impact}
                onChange={(e) => setImpact(e.target.value as IncidentImpactValue)}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                <option value="minor">{t("impactMinor")}</option>
                <option value="major">{t("impactMajor")}</option>
                <option value="critical">{t("impactCritical")}</option>
              </select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <label className="text-xs font-medium">{t("componentsLabel")}</label>
            {components.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">{t("componentsEmpty")}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {components.map((c) => {
                  const active = selectedComponents.has(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleComponent(c.id)}
                      className={`rounded-md border px-2 py-1 text-xs transition ${active ? "border-foreground bg-foreground text-background" : "hover:bg-muted"}`}
                    >
                      {c.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="grid gap-1.5">
            <LocalizedField
              label={t("initialUpdateLabel")}
              value={initialUpdateBody}
              onChange={setInitialUpdateBody}
              placeholder={t("initialUpdatePlaceholder")}
              multiline
              rows={3}
              defaultLocale={locale}
            />
            <p className="text-[11px] text-muted-foreground">{t("initialUpdateHint")}</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={submitting || titleEmpty}>
              {submitting ? t("saving") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function IncidentDetailDialog({
  incident,
  onClose,
  apiBase,
  components,
  locale,
  onChanged,
}: {
  incident: StatusIncidentItem | null
  onClose: () => void
  apiBase: string
  components: StatusComponentItem[]
  locale: string
  onChanged: () => void
}) {
  const t = useTranslations("statusPage.incidents")
  const [postOpen, setPostOpen] = useState(false)
  const [postBody, setPostBody] = useState<LocalizedValue>({ tr: "", en: "" })
  const [postStatus, setPostStatus] = useState<IncidentStatusValue>("investigating")
  const [submitting, setSubmitting] = useState(false)
  const [postmortemOpen, setPostmortemOpen] = useState(false)
  const [postmortem, setPostmortem] = useState<LocalizedValue>({ tr: "", en: "" })
  const [postmortemSaving, setPostmortemSaving] = useState(false)

  useEffect(() => {
    if (!incident) {
      setPostOpen(false)
      setPostBody({ tr: "", en: "" })
      setPostmortemOpen(false)
      setPostmortem({ tr: "", en: "" })
      return
    }
    setPostStatus(incident.status === "resolved" ? "investigating" : incident.status)
    setPostBody({ tr: "", en: "" })
    const initialPm = incident.postmortem
    setPostmortem({
      tr: initialPm && typeof initialPm === "object" ? (initialPm.tr ?? "") : (typeof initialPm === "string" ? initialPm : ""),
      en: initialPm && typeof initialPm === "object" ? (initialPm.en ?? "") : "",
    })
    setPostmortemOpen(false)
  }, [incident])

  if (!incident) return null

  const postBodyEmpty = !Object.values(postBody).some((v) => v.trim().length > 0)

  const componentNames = (() => {
    const lookup = new Map(components.map((c) => [c.id, c.name]))
    return incident.affectedComponentIds.map((id) => lookup.get(id) ?? "?")
  })()

  async function postUpdate(status: IncidentStatusValue, body: LocalizedValue | string) {
    if (!incident) return
    const isString = typeof body === "string"
    const hasAny = isString
      ? body.trim().length > 0
      : Object.values(body).some((v) => v.trim().length > 0)
    if (!hasAny) {
      toast.error(t("updateBodyRequired"))
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`${apiBase}/incidents/${incident.id}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, bodyText: body }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || t("updateFailureToast"))
        return
      }
      toast.success(status === "resolved" ? t("resolveSuccessToast") : t("updateSuccessToast"))
      setPostBody({ tr: "", en: "" })
      setPostOpen(false)
      onChanged()
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  async function savePostmortem(clear: boolean) {
    if (!incident) return
    const hasAny = Object.values(postmortem).some((v) => v.trim().length > 0)
    if (!clear && !hasAny) {
      toast.error(t("postmortemBodyRequired"))
      return
    }
    setPostmortemSaving(true)
    try {
      const res = await fetch(`${apiBase}/incidents/${incident.id}/postmortem`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postmortem: clear ? null : postmortem,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || t("postmortemSaveFailure"))
        return
      }
      toast.success(clear ? t("postmortemClearedToast") : t("postmortemSavedToast"))
      if (clear) {
        setPostmortem({ tr: "", en: "" })
      }
      setPostmortemOpen(false)
      onChanged()
    } finally {
      setPostmortemSaving(false)
    }
  }

  async function deleteIncident() {
    if (!incident) return
    // Dialog-in-dialog z-stack çakışmasını önlemek için önce detail
    // modal'ı kapat, sonra confirm dialog aç. Mevcut incident referansını
    // closure'da tut (state null'a düşeceği için).
    const target = incident
    const title = pickLocalizedClient(target.title, locale)
    onClose()
    await new Promise((r) => setTimeout(r, 200))
    const ok = await confirm({
      title: t("deleteConfirmTitle", { title }),
      description: t("deleteConfirmDescription"),
      confirmText: t("deleteConfirmAction"),
      destructive: true,
    })
    if (!ok) return
    const res = await fetch(`${apiBase}/incidents/${target.id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success(t("deleteSuccessToast"))
      onChanged()
    } else {
      toast.error(t("deleteFailureToast"))
    }
  }

  const resolved = incident.status === "resolved"

  return (
    <Dialog open={!!incident} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate">{pickLocalizedClient(incident.title, locale)}</DialogTitle>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className={`text-[10px] capitalize ${STATUS_BADGE[incident.status]}`}>
                  {incident.status}
                </Badge>
                <Badge variant="outline" className={`text-[10px] capitalize ${IMPACT_BADGE[incident.impact]}`}>
                  {incident.impact}
                </Badge>
                {incident.source === "auto" ? (
                  <Badge variant="outline" className="text-[10px] uppercase">
                    auto
                  </Badge>
                ) : null}
                {componentNames.map((name, i) => (
                  <Badge key={i} variant="outline" className="text-[10px]">
                    {name}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-3 pe-3">
            {incident.updates
              .slice()
              .reverse()
              .map((u) => (
                <div key={u.id} className="rounded-md border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                    <Badge variant="outline" className={`text-[10px] capitalize ${STATUS_BADGE[u.status]}`}>
                      {u.status}
                    </Badge>
                    <div className="text-[10px] text-muted-foreground">
                      {u.authorName ?? (u.authorId ? u.authorId : "system")} ·{" "}
                      {new Date(u.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{pickLocalizedClient(u.body, locale)}</p>
                </div>
              ))}

            <div className="rounded-md border bg-muted/10 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold">{t("postmortemTitle")}</div>
                  <p className="text-[11px] text-muted-foreground">{t("postmortemHint")}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={postmortemOpen ? "ghost" : "outline"}
                  onClick={() => setPostmortemOpen((v) => !v)}
                  className="h-7 text-[11px]"
                >
                  {postmortemOpen
                    ? t("cancel")
                    : incident.postmortem
                      ? t("postmortemEditButton")
                      : t("postmortemAddButton")}
                </Button>
              </div>
              {!postmortemOpen && incident.postmortem ? (
                <div className="mt-2 rounded border bg-background p-2 text-sm whitespace-pre-wrap">
                  {pickLocalizedClient(incident.postmortem, locale)}
                  {incident.postmortemPublishedAt ? (
                    <div className="mt-2 text-[10px] text-muted-foreground">
                      {t("postmortemPublishedAt", {
                        date: new Date(incident.postmortemPublishedAt).toLocaleString(),
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {postmortemOpen ? (
                <div className="mt-2 grid gap-2">
                  <LocalizedField
                    label={t("postmortemBodyLabel")}
                    value={postmortem}
                    onChange={setPostmortem}
                    placeholder={t("postmortemBodyPlaceholder")}
                    multiline
                    rows={6}
                    defaultLocale={locale}
                  />
                  <div className="flex flex-wrap justify-end gap-2">
                    {incident.postmortem ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => savePostmortem(true)}
                        disabled={postmortemSaving}
                      >
                        {t("postmortemClearButton")}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => savePostmortem(false)}
                      disabled={postmortemSaving}
                    >
                      {postmortemSaving ? t("saving") : t("postmortemSaveButton")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </ScrollArea>

        {!resolved ? (
          postOpen ? (
            <div className="grid gap-2 rounded-md border bg-muted/30 p-3">
              <div className="grid gap-1.5">
                <label className="text-[11px] font-medium">{t("postUpdateStatusLabel")}</label>
                <select
                  value={postStatus}
                  onChange={(e) => setPostStatus(e.target.value as IncidentStatusValue)}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="investigating">{t("statusInvestigating")}</option>
                  <option value="identified">{t("statusIdentified")}</option>
                  <option value="monitoring">{t("statusMonitoring")}</option>
                  <option value="resolved">{t("statusResolved")}</option>
                </select>
              </div>
              <LocalizedField
                label={t("postUpdateBodyLabel")}
                value={postBody}
                onChange={setPostBody}
                placeholder={t("postUpdateBodyPlaceholder")}
                multiline
                rows={3}
                defaultLocale={locale}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPostOpen(false)
                    setPostBody({ tr: "", en: "" })
                  }}
                  disabled={submitting}
                >
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => postUpdate(postStatus, postBody)}
                  disabled={submitting || postBodyEmpty}
                >
                  {submitting ? t("saving") : t("postUpdateButton")}
                </Button>
              </div>
            </div>
          ) : (
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={deleteIncident}>
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} data-icon="inline-start" />
                {t("deleteButton")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  postUpdate("resolved", {
                    tr: "Bu olay çözüldü.",
                    en: "This incident has been resolved.",
                  })
                }
                disabled={submitting}
              >
                <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} data-icon="inline-start" />
                {t("quickResolveButton")}
              </Button>
              <Button type="button" onClick={() => setPostOpen(true)}>
                <HugeiconsIcon icon={Megaphone01Icon} strokeWidth={2} data-icon="inline-start" />
                {t("postUpdateButton")}
              </Button>
            </DialogFooter>
          )
        ) : (
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={deleteIncident}>
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} data-icon="inline-start" />
              {t("deleteButton")}
            </Button>
            <Button type="button" onClick={onClose}>
              {t("close")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Maintenance tab ─────────────────────────────────────────────────────

const MAINTENANCE_STATUS_BADGE: Record<MaintenanceStatusValue, string> = {
  scheduled: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  in_progress: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  completed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  cancelled: "border-zinc-500/40 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
}

function toLocalDateInput(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso
  if (!Number.isFinite(date.getTime())) return ""
  // datetime-local input expects "YYYY-MM-DDTHH:mm" in local time
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function MaintenanceTab({ apiBase, onReload }: { apiBase: string; onReload: () => void }) {
  const t = useTranslations("statusPage.maintenance")
  const locale = useLocale()
  const [maintenances, setMaintenances] = useState<StatusMaintenanceItem[]>([])
  const [components, setComponents] = useState<StatusComponentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<StatusMaintenanceItem | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [m, cm] = await Promise.all([
        fetch(`${apiBase}/maintenances`).then((r) => r.json()),
        fetch(`${apiBase}/components`).then((r) => r.json()),
      ])
      setMaintenances(m.data ?? [])
      setComponents(cm.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function deleteOne(m: StatusMaintenanceItem) {
    const ok = await confirm({
      title: t("deleteConfirmTitle", { title: pickLocalizedClient(m.title, locale) }),
      description: t("deleteConfirmDescription"),
      confirmText: t("deleteConfirmAction"),
      destructive: true,
    })
    if (!ok) return
    const res = await fetch(`${apiBase}/maintenances/${m.id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success(t("deleteSuccessToast"))
      fetchAll()
      onReload()
    } else {
      toast.error(t("deleteFailureToast"))
    }
  }

  async function transition(m: StatusMaintenanceItem, status: MaintenanceStatusValue) {
    const res = await fetch(`${apiBase}/maintenances/${m.id}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      toast.success(t("transitionSuccessToast"))
      fetchAll()
      onReload()
    } else {
      toast.error(t("transitionFailureToast"))
    }
  }

  const now = Date.now()
  const upcoming = maintenances.filter(
    (m) => m.status !== "completed" && m.status !== "cancelled" && new Date(m.scheduledStart).getTime() > now,
  )
  const inProgress = maintenances.filter(
    (m) =>
      m.status === "in_progress" ||
      (m.status === "scheduled" &&
        new Date(m.scheduledStart).getTime() <= now &&
        new Date(m.scheduledEnd).getTime() >= now),
  )
  const past = maintenances.filter(
    (m) => m.status === "completed" || m.status === "cancelled",
  )

  function renderSection(heading: string, items: StatusMaintenanceItem[]) {
    if (items.length === 0) return null
    return (
      <section>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {heading} ({items.length})
        </h3>
        <div className="space-y-2">
          {items.map((m) => (
            <MaintenanceCard
              key={m.id}
              maintenance={m}
              components={components}
              locale={locale}
              onEdit={() => {
                setEditTarget(m)
                setDialogOpen(true)
              }}
              onTransition={(s) => transition(m, s)}
              onDelete={() => deleteOne(m)}
            />
          ))}
        </div>
      </section>
    )
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between pb-2">
        <p className="text-xs text-muted-foreground">{t("description")}</p>
        <Button
          size="sm"
          onClick={() => {
            setEditTarget(null)
            setDialogOpen(true)
          }}
        >
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} data-icon="inline-start" />
          {t("newButton")}
        </Button>
      </div>

      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <div className="space-y-4 pe-3">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-md" />
              ))}
            </div>
          ) : maintenances.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <h3 className="text-sm font-semibold">{t("emptyTitle")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t("emptyBody")}</p>
            </div>
          ) : (
            <>
              {renderSection(t("inProgressHeading"), inProgress)}
              {renderSection(t("upcomingHeading"), upcoming)}
              {renderSection(t("pastHeading"), past)}
            </>
          )}
        </div>
      </ScrollArea>

      <MaintenanceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        apiBase={apiBase}
        components={components}
        editTarget={editTarget}
        onSaved={() => {
          fetchAll()
          onReload()
        }}
      />
    </div>
  )
}

function MaintenanceCard({
  maintenance,
  components,
  locale,
  onEdit,
  onTransition,
  onDelete,
}: {
  maintenance: StatusMaintenanceItem
  components: StatusComponentItem[]
  locale: string
  onEdit: () => void
  onTransition: (s: MaintenanceStatusValue) => void
  onDelete: () => void
}) {
  const t = useTranslations("statusPage.maintenance")
  const componentNames = useMemo(() => {
    const lookup = new Map(components.map((c) => [c.id, c.name]))
    return maintenance.affectedComponentIds.map((id) => lookup.get(id) ?? "?")
  }, [maintenance.affectedComponentIds, components])

  const title = pickLocalizedClient(maintenance.title, locale)
  const description = pickLocalizedClient(maintenance.description, locale)

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{title}</span>
            <Badge variant="outline" className={`text-[10px] capitalize ${MAINTENANCE_STATUS_BADGE[maintenance.status]}`}>
              {maintenance.status.replace("_", " ")}
            </Badge>
            {componentNames.map((name, i) => (
              <Badge key={i} variant="outline" className="text-[10px]">
                {name}
              </Badge>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {new Date(maintenance.scheduledStart).toLocaleString()} →{" "}
            {new Date(maintenance.scheduledEnd).toLocaleString()}
          </p>
          {description ? (
            <p className="mt-2 line-clamp-3 text-sm text-foreground/80 whitespace-pre-wrap">
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {maintenance.status === "scheduled" ? (
            <Button size="sm" variant="outline" onClick={() => onTransition("in_progress")}>
              {t("startNowButton")}
            </Button>
          ) : null}
          {maintenance.status === "in_progress" ? (
            <Button size="sm" variant="outline" onClick={() => onTransition("completed")}>
              {t("completeButton")}
            </Button>
          ) : null}
          {maintenance.status === "scheduled" ? (
            <button
              type="button"
              onClick={() => onTransition("cancelled")}
              className="text-[11px] text-muted-foreground underline-offset-2 hover:underline hover:text-destructive"
            >
              {t("cancelButton")}
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-1">
        <button
          onClick={onEdit}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Edit"
        >
          <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} className="size-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
          aria-label="Delete"
        >
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

function MaintenanceDialog({
  open,
  onOpenChange,
  apiBase,
  components,
  editTarget,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  apiBase: string
  components: StatusComponentItem[]
  editTarget: StatusMaintenanceItem | null
  onSaved: () => void
}) {
  const t = useTranslations("statusPage.maintenance")
  const locale = useLocale()
  const [title, setTitle] = useState<LocalizedValue>({ tr: "", en: "" })
  const [description, setDescription] = useState<LocalizedValue>({ tr: "", en: "" })
  const [selectedComponents, setSelectedComponents] = useState<Set<string>>(new Set())
  const [scheduledStart, setScheduledStart] = useState("")
  const [scheduledEnd, setScheduledEnd] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editTarget) {
      setTitle({ tr: "", en: "", ...editTarget.title })
      setDescription({ tr: "", en: "", ...editTarget.description })
      setSelectedComponents(new Set(editTarget.affectedComponentIds))
      setScheduledStart(toLocalDateInput(editTarget.scheduledStart))
      setScheduledEnd(toLocalDateInput(editTarget.scheduledEnd))
    } else {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      const inTwoHours = new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000)
      setTitle({ tr: "", en: "" })
      setDescription({ tr: "", en: "" })
      setSelectedComponents(new Set())
      setScheduledStart(toLocalDateInput(tomorrow))
      setScheduledEnd(toLocalDateInput(inTwoHours))
    }
  }, [open, editTarget])

  function toggleComponent(id: string) {
    setSelectedComponents((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const titleEmpty = !Object.values(title).some((v) => v.trim().length > 0)
  const descriptionEmpty = !Object.values(description).some((v) => v.trim().length > 0)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (titleEmpty || descriptionEmpty || !scheduledStart || !scheduledEnd) return
    const startISO = new Date(scheduledStart).toISOString()
    const endISO = new Date(scheduledEnd).toISOString()
    if (new Date(endISO).getTime() <= new Date(startISO).getTime()) {
      toast.error(t("endAfterStartRequired"))
      return
    }
    setSubmitting(true)
    try {
      const url = editTarget
        ? `${apiBase}/maintenances/${editTarget.id}`
        : `${apiBase}/maintenances`
      const method = editTarget ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          affectedComponentIds: Array.from(selectedComponents),
          scheduledStart: startISO,
          scheduledEnd: endISO,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || (editTarget ? t("updateFailureToast") : t("createFailureToast")))
        return
      }
      toast.success(editTarget ? t("updateSuccessToast") : t("createSuccessToast"))
      onOpenChange(false)
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editTarget ? t("dialogTitleEdit") : t("dialogTitleNew")}</DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <LocalizedField
            label={t("titleLabel")}
            value={title}
            onChange={setTitle}
            placeholder={t("titlePlaceholder")}
            defaultLocale={locale}
          />

          <LocalizedField
            label={t("descriptionLabel")}
            value={description}
            onChange={setDescription}
            placeholder={t("descriptionPlaceholder")}
            multiline
            rows={3}
            defaultLocale={locale}
          />

          <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-2">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium">{t("startLabel")}</label>
              <Input
                type="datetime-local"
                value={scheduledStart}
                onChange={(e) => setScheduledStart(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium">{t("endLabel")}</label>
              <Input
                type="datetime-local"
                value={scheduledEnd}
                onChange={(e) => setScheduledEnd(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <label className="text-xs font-medium">{t("componentsLabel")}</label>
            {components.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">{t("componentsEmpty")}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {components.map((c) => {
                  const active = selectedComponents.has(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleComponent(c.id)}
                      className={`rounded-md border px-2 py-1 text-xs transition ${active ? "border-foreground bg-foreground text-background" : "hover:bg-muted"}`}
                    >
                      {c.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={submitting || titleEmpty || descriptionEmpty}>
              {submitting ? t("saving") : editTarget ? t("save") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Restart Targets tab ─────────────────────────────────────────────────

function RestartTargetsTab({ apiBase, onReload }: { apiBase: string; onReload: () => void }) {
  const t = useTranslations("statusPage.targets")
  const [targets, setTargets] = useState<StatusRestartTargetItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<StatusRestartTargetItem | null>(null)
  const [firing, setFiring] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${apiBase}/restart-targets`).then((r) => r.json())
      setTargets(res.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function deleteOne(target: StatusRestartTargetItem) {
    const ok = await confirm({
      title: t("deleteConfirmTitle", { name: target.name }),
      description: t("deleteConfirmDescription"),
      confirmText: t("deleteConfirmAction"),
      destructive: true,
    })
    if (!ok) return
    const res = await fetch(`${apiBase}/restart-targets/${target.id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success(t("deleteSuccessToast"))
      fetchAll()
      onReload()
    } else {
      toast.error(t("deleteFailureToast"))
    }
  }

  async function toggleEnabled(target: StatusRestartTargetItem) {
    const res = await fetch(`${apiBase}/restart-targets/${target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !target.enabled }),
    })
    if (res.ok) fetchAll()
  }

  async function testFire(target: StatusRestartTargetItem) {
    const ok = await confirm({
      title: t("testFireConfirmTitle", { name: target.name }),
      description: t(`testFireConfirmDescription.${target.type}`),
      confirmText: t("testFireConfirmAction"),
      destructive: true,
    })
    if (!ok) return
    setFiring(target.id)
    try {
      const res = await fetch(`${apiBase}/restart-targets/${target.id}/test`, { method: "POST" })
      const json = await res.json()
      const data = json.data as { success: boolean; message: string; latencyMs: number } | undefined
      if (data?.success) {
        toast.success(t("testFireSuccess", { message: data.message }))
      } else {
        toast.error(t("testFireFailure", { message: data?.message ?? json.error ?? "unknown" }))
      }
      fetchAll()
    } finally {
      setFiring(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between pb-2">
        <p className="text-xs text-muted-foreground">{t("description")}</p>
        <Button
          size="sm"
          onClick={() => {
            setEditTarget(null)
            setDialogOpen(true)
          }}
        >
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} data-icon="inline-start" />
          {t("newButton")}
        </Button>
      </div>

      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <div className="pe-3">
          {loading ? (
            <div className="space-y-2 py-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-md" />
              ))}
            </div>
          ) : targets.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <h3 className="text-sm font-semibold">{t("emptyTitle")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t("emptyBody")}</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              {targets.map((target, idx) => (
                <div
                  key={target.id}
                  className={`flex items-center gap-3 px-4 py-3 text-sm ${idx > 0 ? "border-t" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{target.name}</span>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {target.type}
                      </Badge>
                      {target.hint.hasAuth ? (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <HugeiconsIcon icon={LockKeyIcon} strokeWidth={2} className="size-3" />
                          auth
                        </Badge>
                      ) : null}
                      {!target.enabled ? (
                        <Badge variant="outline" className="text-[10px]">
                          paused
                        </Badge>
                      ) : null}
                    </div>
                    <code className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {target.hint.url ?? target.hint.host ?? target.hint.baseUrl ?? "—"}
                    </code>
                    {target.lastResult ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {target.lastResult.success ? "✓ " : "✗ "}
                        {target.lastResult.message} ·{" "}
                        {new Date(target.lastResult.at).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Switch checked={target.enabled} onCheckedChange={() => toggleEnabled(target)} />
                    <button
                      onClick={() => testFire(target)}
                      disabled={firing === target.id}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                      aria-label={t("testFireAria")}
                      title={t("testFireAria")}
                    >
                      <HugeiconsIcon icon={FlashIcon} strokeWidth={2} className="size-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setEditTarget(target)
                        setDialogOpen(true)
                      }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Edit"
                    >
                      <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} className="size-3.5" />
                    </button>
                    <button
                      onClick={() => deleteOne(target)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                      aria-label="Delete"
                    >
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <RestartTargetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        apiBase={apiBase}
        editTarget={editTarget}
        onSaved={() => {
          fetchAll()
          onReload()
        }}
      />
    </div>
  )
}

function RestartTargetDialog({
  open,
  onOpenChange,
  apiBase,
  editTarget,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  apiBase: string
  editTarget: StatusRestartTargetItem | null
  onSaved: () => void
}) {
  const t = useTranslations("statusPage.targets")
  const [type, setType] = useState<"http" | "ssh" | "coolify">("http")
  const [name, setName] = useState("")
  // HTTP fields
  const [url, setUrl] = useState("")
  const [method, setMethod] = useState<"POST" | "GET">("POST")
  const [authHeaderName, setAuthHeaderName] = useState("Authorization")
  const [authHeaderValue, setAuthHeaderValue] = useState("")
  const [authMode, setAuthMode] = useState<"keep" | "set" | "clear">("keep")
  const [bodyTemplate, setBodyTemplate] = useState("")
  const [expectedMin, setExpectedMin] = useState(200)
  const [expectedMax, setExpectedMax] = useState(299)
  // SSH fields
  const [sshHost, setSshHost] = useState("")
  const [sshPort, setSshPort] = useState(22)
  const [sshUsername, setSshUsername] = useState("root")
  const [sshPrivateKey, setSshPrivateKey] = useState("")
  const [sshPassphrase, setSshPassphrase] = useState("")
  const [sshCommand, setSshCommand] = useState("")
  // Coolify fields
  const [coolifyBaseUrl, setCoolifyBaseUrl] = useState("")
  const [coolifyApiToken, setCoolifyApiToken] = useState("")
  const [coolifyResourceUuid, setCoolifyResourceUuid] = useState("")
  const [coolifyResourceType, setCoolifyResourceType] = useState<"auto" | "applications" | "services">("auto")
  // Common
  const [timeoutMs, setTimeoutMs] = useState(30000)
  const [submitting, setSubmitting] = useState(false)
  const [showAuth, setShowAuth] = useState(false)

  useEffect(() => {
    if (!open) return
    setType(editTarget?.type ?? "http")
    setName(editTarget?.name ?? "")
    setUrl(editTarget?.hint.url ?? "")
    setMethod("POST")
    setAuthHeaderName("Authorization")
    setAuthHeaderValue("")
    setAuthMode(editTarget?.hint.hasAuth ? "keep" : "set")
    setBodyTemplate("")
    setExpectedMin(200)
    setExpectedMax(299)
    setSshHost("")
    setSshPort(22)
    setSshUsername("root")
    setSshPrivateKey("")
    setSshPassphrase("")
    setSshCommand("")
    setCoolifyBaseUrl("")
    setCoolifyApiToken("")
    setCoolifyResourceUuid(editTarget?.hint.resourceUuid ?? "")
    setCoolifyResourceType("auto")
    setTimeoutMs(editTarget?.type === "coolify" ? 60000 : 30000)
    setShowAuth(false)
  }, [open, editTarget])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    try {
      let body: Record<string, unknown>

      if (type === "http") {
        if (!url.trim()) return
        const httpPayload: Record<string, unknown> = {
          url: url.trim(),
          method,
          headers: {},
          authHeaderName: authHeaderName.trim() || null,
          bodyTemplate: bodyTemplate.trim() || null,
          expectedStatusMin: expectedMin,
          expectedStatusMax: expectedMax,
          timeoutMs,
        }
        if (authMode === "set" && authHeaderValue.trim()) {
          httpPayload.authHeaderValue = authHeaderValue.trim()
        } else if (authMode === "clear") {
          httpPayload.authHeaderValue = null
        }
        body = { name: name.trim(), type: "http", http: httpPayload }
      } else if (type === "ssh") {
        if (!sshHost.trim() || !sshUsername.trim() || !sshPrivateKey.trim() || !sshCommand.trim()) {
          toast.error(t("sshFieldsRequired"))
          return
        }
        if (editTarget) {
          toast.error(t("sshCoolifyNoEdit"))
          return
        }
        body = {
          name: name.trim(),
          type: "ssh",
          ssh: {
            host: sshHost.trim(),
            port: sshPort,
            username: sshUsername.trim(),
            privateKey: sshPrivateKey,
            passphrase: sshPassphrase.trim() || null,
            command: sshCommand.trim(),
            timeoutMs,
          },
        }
      } else {
        // coolify
        if (!coolifyBaseUrl.trim() || !coolifyApiToken.trim() || !coolifyResourceUuid.trim()) {
          toast.error(t("coolifyFieldsRequired"))
          return
        }
        if (editTarget) {
          toast.error(t("sshCoolifyNoEdit"))
          return
        }
        body = {
          name: name.trim(),
          type: "coolify",
          coolify: {
            baseUrl: coolifyBaseUrl.trim(),
            apiToken: coolifyApiToken.trim(),
            resourceUuid: coolifyResourceUuid.trim(),
            resourceType: coolifyResourceType,
            timeoutMs,
          },
        }
      }

      const target = editTarget
        ? `${apiBase}/restart-targets/${editTarget.id}`
        : `${apiBase}/restart-targets`
      const httpMethod = editTarget ? "PATCH" : "POST"
      const res = await fetch(target, {
        method: httpMethod,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || (editTarget ? t("updateFailureToast") : t("createFailureToast")))
        return
      }
      toast.success(editTarget ? t("updateSuccessToast") : t("createSuccessToast"))
      onOpenChange(false)
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editTarget ? t("dialogTitleEdit") : t("dialogTitleNew")}</DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          {!editTarget ? (
            <div className="grid gap-1.5">
              <label className="text-xs font-medium">{t("typeLabel")}</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["http", "ssh", "coolify"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setType(opt)}
                    className={`rounded-md border px-3 py-2 text-xs font-medium transition ${type === opt ? "border-foreground bg-foreground text-background" : "hover:bg-muted"}`}
                  >
                    {t(`type.${opt}`)}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">{t(`typeHint.${type}`)}</p>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
              <Badge variant="outline" className="uppercase">{type}</Badge>
              <span className="text-muted-foreground">{t("editTypeLocked")}</span>
            </div>
          )}

          <div className="grid gap-1.5">
            <label className="text-xs font-medium">{t("nameLabel")}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              required
            />
          </div>

          {type === "http" ? (
            <>
              <div className="grid gap-1.5 sm:grid-cols-[1fr_120px] sm:gap-2">
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium">{t("urlLabel")}</label>
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder={t("urlPlaceholder")}
                    type="url"
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium">{t("methodLabel")}</label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as typeof method)}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <HugeiconsIcon icon={LockKeyIcon} strokeWidth={2} className="size-3.5" />
                      {t("authSectionTitle")}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{t("authSectionHint")}</p>
                  </div>
                  {editTarget?.hint.hasAuth ? (
                    <Badge variant="outline" className="text-[10px]">
                      {t("authStored")}
                    </Badge>
                  ) : null}
                </div>
                <div className="grid gap-1.5 sm:grid-cols-[1fr_2fr] sm:gap-2">
                  <div className="grid gap-1.5">
                    <label className="text-[11px] font-medium">{t("authHeaderNameLabel")}</label>
                    <Input
                      value={authHeaderName}
                      onChange={(e) => setAuthHeaderName(e.target.value)}
                      placeholder="Authorization"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-[11px] font-medium">
                      {editTarget?.hint.hasAuth ? t("authHeaderValueRotateLabel") : t("authHeaderValueLabel")}
                    </label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={authHeaderValue}
                        onChange={(e) => {
                          setAuthHeaderValue(e.target.value)
                          setAuthMode(e.target.value ? "set" : editTarget?.hint.hasAuth ? "keep" : "set")
                        }}
                        placeholder={t("authHeaderValuePlaceholder")}
                        type={showAuth ? "text" : "password"}
                        className="font-mono text-xs"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 px-2 text-[11px]"
                        onClick={() => setShowAuth((v) => !v)}
                      >
                        {showAuth ? t("hide") : t("show")}
                      </Button>
                    </div>
                  </div>
                </div>
                {editTarget?.hint.hasAuth ? (
                  <button
                    type="button"
                    onClick={() => setAuthMode((m) => (m === "clear" ? "keep" : "clear"))}
                    className={`self-start text-[11px] underline-offset-2 hover:underline ${authMode === "clear" ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {authMode === "clear" ? `✓ ${t("authClearedNote")}` : t("authClearAction")}
                  </button>
                ) : null}
              </div>

              <div className="grid gap-1.5">
                <label className="text-xs font-medium">{t("bodyLabel")}</label>
                <Textarea
                  value={bodyTemplate}
                  onChange={(e) => setBodyTemplate(e.target.value)}
                  placeholder={t("bodyPlaceholder")}
                  className="font-mono text-xs"
                  rows={3}
                />
                <p className="text-[11px] text-muted-foreground">{t("bodyHint")}</p>
              </div>

              <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-2">
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium">{t("expectedStatusLabel")}</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={100}
                      max={599}
                      value={expectedMin}
                      onChange={(e) => setExpectedMin(Number(e.target.value) || 200)}
                    />
                    <span className="text-muted-foreground">→</span>
                    <Input
                      type="number"
                      min={100}
                      max={599}
                      value={expectedMax}
                      onChange={(e) => setExpectedMax(Number(e.target.value) || 299)}
                    />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium">{t("timeoutLabel")}</label>
                  <Input
                    type="number"
                    min={1000}
                    max={120000}
                    value={timeoutMs}
                    onChange={(e) => setTimeoutMs(Number(e.target.value) || 30000)}
                  />
                </div>
              </div>
            </>
          ) : type === "ssh" ? (
            <>
              <div className="grid gap-1.5 sm:grid-cols-[2fr_80px_1fr] sm:gap-2">
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium">{t("sshHostLabel")}</label>
                  <Input
                    value={sshHost}
                    onChange={(e) => setSshHost(e.target.value)}
                    placeholder={t("sshHostPlaceholder")}
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium">{t("sshPortLabel")}</label>
                  <Input
                    type="number"
                    min={1}
                    max={65535}
                    value={sshPort}
                    onChange={(e) => setSshPort(Number(e.target.value) || 22)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium">{t("sshUsernameLabel")}</label>
                  <Input
                    value={sshUsername}
                    onChange={(e) => setSshUsername(e.target.value)}
                    placeholder="root"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <HugeiconsIcon icon={LockKeyIcon} strokeWidth={2} className="size-3.5" />
                  {t("sshKeySectionTitle")}
                </div>
                <p className="text-[11px] text-muted-foreground">{t("sshKeySectionHint")}</p>
                <Textarea
                  value={sshPrivateKey}
                  onChange={(e) => setSshPrivateKey(e.target.value)}
                  placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n…\n-----END OPENSSH PRIVATE KEY-----"}
                  className="font-mono text-[10px]"
                  rows={6}
                  required
                />
                <div className="grid gap-1.5">
                  <label className="text-[11px] font-medium">{t("sshPassphraseLabel")}</label>
                  <Input
                    value={sshPassphrase}
                    onChange={(e) => setSshPassphrase(e.target.value)}
                    placeholder={t("sshPassphrasePlaceholder")}
                    type="password"
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <label className="text-xs font-medium">{t("sshCommandLabel")}</label>
                <Input
                  value={sshCommand}
                  onChange={(e) => setSshCommand(e.target.value)}
                  placeholder={t("sshCommandPlaceholder")}
                  className="font-mono text-xs"
                  required
                />
                <p className="text-[11px] text-muted-foreground">{t("sshCommandHint")}</p>
              </div>

              <div className="grid gap-1.5">
                <label className="text-xs font-medium">{t("timeoutLabel")}</label>
                <Input
                  type="number"
                  min={1000}
                  max={120000}
                  value={timeoutMs}
                  onChange={(e) => setTimeoutMs(Number(e.target.value) || 30000)}
                />
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium">{t("coolifyBaseUrlLabel")}</label>
                <Input
                  value={coolifyBaseUrl}
                  onChange={(e) => setCoolifyBaseUrl(e.target.value)}
                  placeholder={t("coolifyBaseUrlPlaceholder")}
                  type="url"
                  required
                />
              </div>

              <div className="grid gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <HugeiconsIcon icon={LockKeyIcon} strokeWidth={2} className="size-3.5" />
                  {t("coolifyTokenSectionTitle")}
                </div>
                <p className="text-[11px] text-muted-foreground">{t("coolifyTokenSectionHint")}</p>
                <Input
                  value={coolifyApiToken}
                  onChange={(e) => setCoolifyApiToken(e.target.value)}
                  placeholder={t("coolifyTokenPlaceholder")}
                  type="password"
                  className="font-mono text-xs"
                  required
                />
              </div>

              <div className="grid gap-1.5 sm:grid-cols-[2fr_1fr] sm:gap-2">
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium">{t("coolifyResourceUuidLabel")}</label>
                  <Input
                    value={coolifyResourceUuid}
                    onChange={(e) => setCoolifyResourceUuid(e.target.value)}
                    placeholder={t("coolifyResourceUuidPlaceholder")}
                    className="font-mono text-xs"
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium">{t("coolifyResourceTypeLabel")}</label>
                  <select
                    value={coolifyResourceType}
                    onChange={(e) => setCoolifyResourceType(e.target.value as typeof coolifyResourceType)}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="auto">auto</option>
                    <option value="applications">applications</option>
                    <option value="services">services</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-1.5">
                <label className="text-xs font-medium">{t("timeoutLabel")}</label>
                <Input
                  type="number"
                  min={1000}
                  max={120000}
                  value={timeoutMs}
                  onChange={(e) => setTimeoutMs(Number(e.target.value) || 60000)}
                />
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}


// ─── Subscribers tab ─────────────────────────────────────────────────────

function SubscribersTab({ apiBase, onReload }: { apiBase: string; onReload: () => void }) {
  const t = useTranslations("statusPage.subscribers")
  const [subscribers, setSubscribers] = useState<StatusSubscriberItem[]>([])
  const [components, setComponents] = useState<StatusComponentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"all" | "email" | "webhook" | "telegram">("all")
  const [editTarget, setEditTarget] = useState<StatusSubscriberItem | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [deliveriesOpen, setDeliveriesOpen] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [sub, cm] = await Promise.all([
        fetch(`${apiBase}/subscribers`).then((r) => r.json()),
        fetch(`${apiBase}/components`).then((r) => r.json()),
      ])
      setSubscribers(sub.data ?? [])
      setComponents(cm.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function deleteOne(sub: StatusSubscriberItem) {
    const ok = await confirm({
      title: t("deleteConfirmTitle", { target: sub.target }),
      description: t("deleteConfirmDescription"),
      confirmText: t("deleteConfirmAction"),
      destructive: true,
    })
    if (!ok) return
    const res = await fetch(`${apiBase}/subscribers/${sub.id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success(t("deleteSuccessToast"))
      fetchAll()
      onReload()
    } else {
      toast.error(t("deleteFailureToast"))
    }
  }

  const filtered = subscribers.filter((s) =>
    filter === "all" ? true : s.type === filter,
  )

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        <p className="text-xs text-muted-foreground">{t("description")}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDeliveriesOpen(true)}
            className="h-7 text-[11px]"
          >
            {t("deliveriesButton")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            className="h-7 text-[11px]"
          >
            {t("importButton")}
          </Button>
          <div className="ml-1 flex items-center gap-1">
            {(["all", "email", "telegram", "webhook"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setFilter(opt)}
                className={`rounded-md px-2.5 py-1 text-[11px] transition ${filter === opt ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
              >
                {t(`filter.${opt}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <div className="pe-3">
          {loading ? (
            <div className="space-y-2 py-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <h3 className="text-sm font-semibold">{t("emptyTitle")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t("emptyBody")}</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              {filtered.map((sub, idx) => (
                <div
                  key={sub.id}
                  className={`flex items-center gap-3 px-4 py-3 text-sm ${idx > 0 ? "border-t" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{sub.target}</span>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {sub.type}
                      </Badge>
                      {sub.verified ? null : (
                        <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px]">
                          {t("pending")}
                        </Badge>
                      )}
                      {sub.unsubscribedAt ? (
                        <Badge variant="outline" className="text-[10px]">
                          {t("unsubscribedBadge")}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {t("createdAt", { date: new Date(sub.createdAt).toLocaleString() })}
                      {sub.componentFilter.length > 0
                        ? ` · ${t("filteredComponents", { count: sub.componentFilter.length })}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditTarget(sub)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Edit filters"
                      title={t("editAria")}
                    >
                      <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} className="size-3.5" />
                    </button>
                    <button
                      onClick={() => deleteOne(sub)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                      aria-label="Delete"
                    >
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <SubscriberEditDialog
        subscriber={editTarget}
        components={components}
        apiBase={apiBase}
        onClose={() => setEditTarget(null)}
        onSaved={() => {
          fetchAll()
          onReload()
        }}
      />
      <SubscribersImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        apiBase={apiBase}
        onImported={() => {
          fetchAll()
          onReload()
        }}
      />
      <DeliveriesDialog
        open={deliveriesOpen}
        onOpenChange={setDeliveriesOpen}
        apiBase={apiBase}
      />
    </div>
  )
}

function SubscribersImportDialog({
  open,
  onOpenChange,
  apiBase,
  onImported,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  apiBase: string
  onImported: () => void
}) {
  const t = useTranslations("statusPage.subscribers")
  const [csv, setCsv] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<
    | { imported: number; skipped: number; invalid: number; totalRows: number; errors: Array<{ row: number; reason: string }> }
    | null
  >(null)

  useEffect(() => {
    if (!open) {
      setCsv("")
      setResult(null)
    }
  }, [open])

  async function submit() {
    if (!csv.trim()) {
      toast.error(t("importEmpty"))
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`${apiBase}/subscribers/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || t("importFailureToast"))
        return
      }
      const data = (json.data ?? json) as typeof result
      setResult(data)
      toast.success(t("importSuccessToast", { count: data?.imported ?? 0 }))
      onImported()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("importDialogTitle")}</DialogTitle>
          <DialogDescription>{t("importDialogDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <pre className="rounded-md border bg-muted/30 p-2 text-[10px] text-muted-foreground whitespace-pre-wrap">
{`type,target,topics,components
email,alice@example.com,incident.opened;incident.resolved,
email,bob@example.com,,`}
          </pre>
          <Textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={t("importTextareaPlaceholder")}
            rows={10}
            className="font-mono text-xs"
          />
          {result ? (
            <div className="grid gap-1 rounded-md border bg-muted/20 p-3 text-xs">
              <div className="font-medium">
                {t("importResultHeader", {
                  imported: result.imported,
                  skipped: result.skipped,
                  invalid: result.invalid,
                  total: result.totalRows,
                })}
              </div>
              {result.errors.length > 0 ? (
                <ul className="mt-2 list-disc space-y-0.5 ps-5 text-[11px] text-muted-foreground">
                  {result.errors.slice(0, 10).map((e) => (
                    <li key={e.row}>
                      {t("importErrorRow", { row: e.row })}: {e.reason}
                    </li>
                  ))}
                  {result.errors.length > 10 ? (
                    <li>… +{result.errors.length - 10}</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
          <Button type="button" onClick={submit} disabled={submitting || !csv.trim()}>
            {submitting ? t("importing") : t("importSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface DeliveryItem {
  id: string
  pageId: string
  subscriberId: string
  subscriberType: "email" | "webhook" | "telegram"
  subscriberTarget: string
  channel: "email" | "webhook" | "telegram"
  eventTopic: string
  reference: { type: "incident" | "maintenance"; id: string; updateId?: string }
  status: "delivered" | "failed" | "skipped"
  httpStatus: number | null
  latencyMs: number
  attempts: number
  errorMessage: string | null
  createdAt: string
}

function DeliveriesDialog({
  open,
  onOpenChange,
  apiBase,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  apiBase: string
}) {
  const t = useTranslations("statusPage.subscribers")
  const [items, setItems] = useState<DeliveryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [channel, setChannel] = useState<"all" | "email" | "webhook" | "telegram">("all")
  const [status, setStatus] = useState<"all" | "delivered" | "failed" | "skipped">("all")

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ pageSize: "50" })
      if (channel !== "all") qs.set("channel", channel)
      if (status !== "all") qs.set("status", status)
      const res = await fetch(`${apiBase}/deliveries?${qs.toString()}`)
      const json = await res.json()
      setItems((json.data?.items ?? json.items ?? []) as DeliveryItem[])
    } finally {
      setLoading(false)
    }
  }, [apiBase, channel, status])

  useEffect(() => {
    if (open) fetchItems()
  }, [open, fetchItems])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("deliveriesDialogTitle")}</DialogTitle>
          <DialogDescription>{t("deliveriesDialogDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2 pb-2">
          <div className="flex items-center gap-1">
            {(["all", "email", "telegram", "webhook"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setChannel(opt)}
                className={`rounded-md px-2 py-1 text-[10px] transition ${channel === opt ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
              >
                {opt}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {(["all", "delivered", "failed", "skipped"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setStatus(opt)}
                className={`rounded-md px-2 py-1 text-[10px] transition ${status === opt ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
        <ScrollArea className="max-h-[60vh]">
          {loading ? (
            <div className="space-y-2 pe-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
              {t("deliveriesEmpty")}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              {items.map((it, idx) => (
                <div
                  key={it.id}
                  className={`flex items-start gap-3 px-3 py-2 text-xs ${idx > 0 ? "border-t" : ""}`}
                >
                  <Badge
                    variant="outline"
                    className={`mt-0.5 shrink-0 text-[10px] capitalize ${it.status === "delivered" ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300" : it.status === "failed" ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300" : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}
                  >
                    {it.status}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {it.channel}
                      </Badge>
                      <span className="truncate font-medium">{it.subscriberTarget}</span>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <span className="text-[10px] text-muted-foreground">{it.eventTopic}</span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {new Date(it.createdAt).toLocaleString()} · {it.latencyMs}ms
                      {it.httpStatus !== null ? ` · HTTP ${it.httpStatus}` : ""}
                      {it.attempts > 1 ? ` · ${it.attempts} attempts` : ""}
                    </p>
                    {it.errorMessage ? (
                      <p className="mt-1 truncate font-mono text-[10px] text-destructive">
                        {it.errorMessage}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fetchItems} disabled={loading}>
            {t("deliveriesRefresh")}
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const INCIDENT_TOPICS = [
  "incident.opened",
  "incident.updated",
  "incident.resolved",
]
const MAINTENANCE_TOPICS = [
  "maintenance.scheduled",
  "maintenance.reminder",
  "maintenance.started",
  "maintenance.completed",
]

function detectTopicPreset(
  topicFilter: string[],
): "all" | "incidents" | "maintenance" | "custom" {
  if (topicFilter.length === 0) return "all"
  const set = new Set(topicFilter)
  const onlyIncidents =
    INCIDENT_TOPICS.every((t) => set.has(t)) &&
    !MAINTENANCE_TOPICS.some((t) => set.has(t))
  const onlyMaintenance =
    MAINTENANCE_TOPICS.every((t) => set.has(t)) &&
    !INCIDENT_TOPICS.some((t) => set.has(t))
  if (onlyIncidents) return "incidents"
  if (onlyMaintenance) return "maintenance"
  return "custom"
}

function SubscriberEditDialog({
  subscriber,
  components,
  apiBase,
  onClose,
  onSaved,
}: {
  subscriber: StatusSubscriberItem | null
  components: StatusComponentItem[]
  apiBase: string
  onClose: () => void
  onSaved: () => void
}) {
  const t = useTranslations("statusPage.subscribers")
  const [topicMode, setTopicMode] = useState<"all" | "incidents" | "maintenance">("all")
  const [selectedComponents, setSelectedComponents] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!subscriber) return
    const preset = detectTopicPreset(subscriber.topicFilter)
    setTopicMode(preset === "custom" ? "all" : preset)
    setSelectedComponents(new Set(subscriber.componentFilter))
  }, [subscriber])

  if (!subscriber) return null

  function toggleComponent(id: string) {
    setSelectedComponents((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    if (!subscriber) return
    setSubmitting(true)
    try {
      const topicFilter =
        topicMode === "all"
          ? []
          : topicMode === "incidents"
            ? INCIDENT_TOPICS
            : MAINTENANCE_TOPICS
      const res = await fetch(`${apiBase}/subscribers/${subscriber.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          componentFilter: Array.from(selectedComponents),
          topicFilter,
        }),
      })
      if (res.ok) {
        toast.success(t("editSuccessToast"))
        onClose()
        onSaved()
      } else {
        const json = await res.json()
        toast.error(json.error || t("editFailureToast"))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={!!subscriber} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("editDialogTitle")}</DialogTitle>
          <DialogDescription>
            {subscriber.type.toUpperCase()} · {subscriber.target}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <label className="text-xs font-medium">{t("editTopicLabel")}</label>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { key: "all", label: t("editTopicAll") },
                { key: "incidents", label: t("editTopicIncidentsOnly") },
                { key: "maintenance", label: t("editTopicMaintenanceOnly") },
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setTopicMode(opt.key)}
                  className={`rounded-md border px-2.5 py-1.5 text-[11px] transition ${topicMode === opt.key ? "border-foreground bg-foreground text-background" : "hover:bg-muted"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {components.length > 0 ? (
            <div className="grid gap-1.5 rounded-md border bg-muted/30 px-3 py-2">
              <label className="text-[11px] font-medium">
                {t("editComponentsLabel")}
              </label>
              <p className="text-[10px] text-muted-foreground">
                {t("editComponentsHint")}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {components.map((c) => {
                  const active = selectedComponents.has(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleComponent(c.id)}
                      className={`rounded-md border px-2 py-1 text-[11px] transition ${active ? "border-foreground bg-foreground text-background" : "hover:bg-muted"}`}
                    >
                      {c.name}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            {t("editCancel")}
          </Button>
          <Button type="button" onClick={save} disabled={submitting}>
            {submitting ? t("editSaving") : t("editSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Audit log tab ───────────────────────────────────────────────────────

interface StatusAuditEntry {
  id: string
  action: string
  resource: string
  resourceId: string | null
  userId: string
  details?: Record<string, unknown>
  ipAddress: string | null
  createdAt: string
}

function actionLabel(action: string): string {
  // status-page.incident.create → "Incident created"
  const parts = action.split(".")
  if (parts.length < 2) return action
  const [, sub, verb] = parts
  const verbMap: Record<string, string> = {
    create: "created",
    update: "updated",
    delete: "deleted",
    "append-update": "update posted",
    "test-fire": "test fired",
    triggered: "triggered",
    transition: "status changed",
  }
  const resourceMap: Record<string, string> = {
    page: "Page",
    component: "Component",
    check: "Check",
    incident: "Incident",
    maintenance: "Maintenance",
    subscriber: "Subscriber",
    "restart-target": "Restart target",
    restart: "Restart",
  }
  const r = sub ? (resourceMap[sub] ?? sub) : "Item"
  const v = verb ? (verbMap[verb] ?? verb) : ""
  return v ? `${r} ${v}` : r
}

function AuditTab({ apiBase }: { apiBase: string }) {
  const t = useTranslations("statusPage.audit")
  const [entries, setEntries] = useState<StatusAuditEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${apiBase}/audit?limit=200`)
      .then((r) => r.json())
      .then((j) => setEntries(j.data ?? []))
      .finally(() => setLoading(false))
  }, [apiBase])

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
      <p className="pb-2 text-xs text-muted-foreground">{t("description")}</p>
      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <div className="pe-3">
          {loading ? (
            <div className="space-y-2 py-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <h3 className="text-sm font-semibold">{t("emptyTitle")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t("emptyBody")}</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              {entries.map((e, idx) => (
                <div
                  key={e.id}
                  className={`flex items-start gap-3 px-4 py-2.5 text-sm ${idx > 0 ? "border-t" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{actionLabel(e.action)}</span>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {e.action}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString()}
                      {e.userId !== "system" ? ` · ${e.userId.slice(0, 12)}…` : " · system"}
                      {e.ipAddress ? ` · ${e.ipAddress}` : ""}
                    </p>
                    {e.details && Object.keys(e.details).length > 0 ? (
                      <details className="mt-1 text-[11px]">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          {t("detailsToggle")}
                        </summary>
                        <pre className="mt-1 overflow-x-auto rounded-md border bg-muted/30 px-2 py-1.5 text-[10px] font-mono">
                          {JSON.stringify(e.details, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
