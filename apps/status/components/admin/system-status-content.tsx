"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  DatabaseIcon,
  MailSend02Icon,
  CloudServerIcon,
  Mail01Icon,
  FolderLibraryIcon,
  RefreshIcon,
  CheckmarkCircle02Icon,
  AlertCircleIcon,
  Cancel01Icon,
  ReloadIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { confirm } from "@workspace/console/stores/confirm"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

type Status = "operational" | "degraded" | "down"

interface ServiceCheck {
  key: string
  label: string
  status: Status
  latencyMs: number
  error?: string
  meta?: Record<string, unknown>
}

interface Report {
  generatedAt: string
  services: ServiceCheck[]
}

interface HourBucket {
  hour: string
  status: Status | "no-data"
  /** Saat içinde herhangi bir noktada incident olduğu (status `operational`
   *  bile olsa). Resolved indicator için. */
  hadIncident?: boolean
  count: number
}

interface HistoryResponse {
  hours: number
  services: Record<string, HourBucket[]>
}

const REFRESH_MS = 30_000
const HISTORY_HOURS = 24

const ICON_MAP: Record<string, typeof DatabaseIcon> = {
  mongodb: DatabaseIcon,
  "sentroy-api": MailSend02Icon,
  cdn: CloudServerIcon,
  "mail-app": Mail01Icon,
  "storage-app": FolderLibraryIcon,
}

const STATUS_STYLES: Record<
  Status,
  { badge: string; dot: string; text: string; icon: typeof CheckmarkCircle02Icon }
> = {
  operational: {
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    icon: CheckmarkCircle02Icon,
  },
  degraded: {
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    icon: AlertCircleIcon,
  },
  down: {
    badge: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    icon: Cancel01Icon,
  },
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  } catch {
    return iso
  }
}

export function SystemStatusContent() {
  const t = useTranslations("systemStatus")
  const [report, setReport] = useState<Report | null>(null)
  const [history, setHistory] = useState<HistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [restartingService, setRestartingService] = useState<string | null>(
    null,
  )

  /**
   * Restart, Coolify Application API'sini tetikler. Compose deploy'umuzda
   * 3 servis tek "application" altında olduğu için her tıklama tüm stack'i
   * yeniden başlatır — kullanıcı service seçimi audit/telemetri amaçlı.
   * UI'da bunu açıkça anlatıyoruz, "30-60sn downtime" beklentisi seti.
   */
  async function handleRestart(service: string, label: string) {
    const ok = await confirm({
      title: t("restartConfirmTitle", { service: label }),
      description: t("restartConfirmDesc"),
      confirmText: t("restartConfirmCta"),
      destructive: true,
    })
    if (!ok) return
    setRestartingService(service)
    try {
      const res = await fetch("/api/admin/system-status/restart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || t("restartFailed"))
      }
      toast.success(t("restartTriggered", { service: label }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("restartFailed"))
    } finally {
      // Container ayağa kalkana kadar buton "loading" kalsın diye 30 sn
      // tutuyoruz; kullanıcı bu süre içinde tekrar tıklayamasın.
      setTimeout(() => setRestartingService(null), 30000)
    }
  }
  const abortRef = useRef<AbortController | null>(null)

  const fetchStatus = useCallback(async (silent: boolean) => {
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    if (silent) setRefreshing(true)
    setError(null)

    try {
      const [statusRes, historyRes] = await Promise.all([
        fetch("/api/admin/system-status", {
          signal: ctrl.signal,
          cache: "no-store",
        }),
        fetch(`/api/admin/system-status/history?hours=${HISTORY_HOURS}`, {
          signal: ctrl.signal,
          cache: "no-store",
        }),
      ])
      const statusJson = await statusRes.json()
      if (!statusRes.ok) {
        setError(statusJson?.error || `HTTP ${statusRes.status}`)
        return
      }
      setReport(statusJson.data)
      if (historyRes.ok) {
        const historyJson = await historyRes.json()
        setHistory(historyJson.data)
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return
      setError((err as Error).message || "Network error")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus(false)
    const interval = setInterval(() => fetchStatus(true), REFRESH_MS)
    return () => {
      clearInterval(interval)
      abortRef.current?.abort()
    }
  }, [fetchStatus])

  const overall: Status | null = report
    ? report.services.some((s) => s.status === "down")
      ? "down"
      : report.services.some((s) => s.status === "degraded")
      ? "degraded"
      : "operational"
    : null

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex items-center gap-3">
          {report && (
            <span className="text-xs text-muted-foreground">
              {t("lastChecked")}: {formatTimestamp(report.generatedAt)}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchStatus(true)}
            disabled={refreshing || loading}
          >
            <HugeiconsIcon
              icon={RefreshIcon}
              strokeWidth={2}
              className={cn("size-4", refreshing && "animate-spin")}
              data-icon="inline-start"
            />
            {t("refresh")}
          </Button>
          {/* Core restart — core kendini probe etmediği için service
              kartlarında yer almıyor; header'a koyduk. Compose stack
              restart hep tüm container'ları kaldırır ama bu giriş "core
              kötü davranıyor" sinyali için ayrı durur. */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleRestart("core", "Core")}
            disabled={restartingService !== null}
          >
            <HugeiconsIcon
              icon={
                restartingService === "core" ? Loading03Icon : ReloadIcon
              }
              strokeWidth={2}
              className={cn(
                "size-4",
                restartingService === "core" && "animate-spin",
              )}
              data-icon="inline-start"
            />
            {t("restartCore")}
          </Button>
        </div>
      </div>

      {/* ── Overall banner ───────────────────────────────────────────────── */}
      {overall && (
        <Card className={cn("border-2", STATUS_STYLES[overall].badge)}>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="relative flex size-3 shrink-0">
              <span
                className={cn(
                  "absolute inline-flex size-full animate-ping rounded-full opacity-60",
                  STATUS_STYLES[overall].dot,
                )}
              />
              <span
                className={cn(
                  "relative inline-flex size-3 rounded-full",
                  STATUS_STYLES[overall].dot,
                )}
              />
            </div>
            <div className="flex flex-1 flex-col">
              <span className={cn("text-lg font-semibold", STATUS_STYLES[overall].text)}>
                {t(`overall.${overall}`)}
              </span>
              <span className="text-sm text-muted-foreground">
                {t("overall.summary", {
                  total: report!.services.length,
                  operational: report!.services.filter((s) => s.status === "operational").length,
                })}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="flex items-center gap-3 p-4">
            <HugeiconsIcon
              icon={AlertCircleIcon}
              strokeWidth={2}
              className="size-5 text-red-600 dark:text-red-400"
            />
            <span className="text-sm text-red-600 dark:text-red-400">
              {t("fetchError")}: {error}
            </span>
          </CardContent>
        </Card>
      )}

      {/* ── Service cards ────────────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">
        {loading && !report && (
          <>
            {[0, 1, 2, 3, 4].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="h-32 p-5" />
              </Card>
            ))}
          </>
        )}
        {report?.services.map((service) => {
          const styles = STATUS_STYLES[service.status]
          const Icon = ICON_MAP[service.key] || CloudServerIcon
          const StatusIcon = styles.icon
          // App container'ları + sentroy-mail-server (ayrı resource UUID)
          // restart edilebilir. Mongo + CDN bizim altyapımızda değil.
          const restartTarget:
            | "core"
            | "mail"
            | "storage"
            | "mail-server"
            | null =
            service.key === "mail-app"
              ? "mail"
              : service.key === "storage-app"
              ? "storage"
              : service.key === "sentroy-api"
              ? "mail-server"
              : null
          const isRestarting = restartingService === restartTarget
          return (
            <Card key={service.key} className="transition-all hover:shadow-md">
              <CardContent className="flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <HugeiconsIcon icon={Icon} strokeWidth={1.8} className="size-5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-medium">{service.label}</span>
                      <span className="text-xs text-muted-foreground">{service.key}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={cn("gap-1.5", styles.badge)}
                    >
                      <HugeiconsIcon
                        icon={StatusIcon}
                        strokeWidth={2}
                        className="size-3"
                      />
                      {t(`status.${service.status}`)}
                    </Badge>
                    {restartTarget && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() =>
                          handleRestart(restartTarget, service.label)
                        }
                        disabled={isRestarting || restartingService !== null}
                        title={t("restartTooltip", { service: service.label })}
                      >
                        <HugeiconsIcon
                          icon={isRestarting ? Loading03Icon : ReloadIcon}
                          strokeWidth={2}
                          className={cn(
                            "size-3.5",
                            isRestarting && "animate-spin",
                          )}
                        />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">{t("latency")}</span>
                    <span className={cn("font-mono font-medium", styles.text)}>
                      {formatLatency(service.latencyMs)}
                    </span>
                  </div>
                  {service.meta?.version != null && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground">{t("version")}</span>
                      <span className="font-mono text-xs font-medium">
                        v{String(service.meta.version)}
                      </span>
                    </div>
                  )}
                </div>

                {service.error && (
                  <div className="rounded-md border border-red-500/20 bg-red-500/5 p-2.5">
                    <span className="font-mono text-xs text-red-600 dark:text-red-400">
                      {service.error}
                    </span>
                  </div>
                )}

                {history?.services?.[service.key] && (
                  <StatusHistoryPills
                    serviceKey={service.key}
                    buckets={history.services[service.key]}
                    label={t("history.last24h")}
                  />
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {t("autoRefresh", { seconds: REFRESH_MS / 1000 })}
      </p>
    </div>
  )
}

// ── Atlassian-style hourly status pills ──────────────────────────────────

const PILL_COLOR: Record<HourBucket["status"], string> = {
  operational: "bg-emerald-500",
  degraded: "bg-amber-500",
  down: "bg-red-500",
  "no-data": "bg-zinc-300 dark:bg-zinc-700",
}

const PILL_DOT: Record<HourBucket["status"], string> = {
  operational: "bg-emerald-500",
  degraded: "bg-amber-500",
  down: "bg-red-500",
  "no-data": "bg-zinc-400",
}

interface MinuteBucket {
  minute: string
  status: HourBucket["status"]
  count: number
  avgLatencyMs: number | null
}

function StatusHistoryPills({
  serviceKey,
  buckets,
  label,
}: {
  serviceKey: string
  buckets: HourBucket[]
  label: string
}) {
  const t = useTranslations("systemStatus")
  const first = buckets[0]
  const last = buckets[buckets.length - 1]

  // Drill-down: bir saat seçildiğinde altta dakikalık pill grid açılır.
  // Aynı saate tekrar tıklamak kapatır → toggle.
  const [drillHour, setDrillHour] = useState<string | null>(null)
  const [minutes, setMinutes] = useState<MinuteBucket[] | null>(null)
  const [minutesLoading, setMinutesLoading] = useState(false)

  useEffect(() => {
    if (!drillHour) {
      setMinutes(null)
      return
    }
    let cancelled = false
    setMinutesLoading(true)
    ;(async () => {
      try {
        const url = `/api/admin/system-status/history/minutes?service=${encodeURIComponent(serviceKey)}&hour=${encodeURIComponent(drillHour)}`
        const res = await fetch(url)
        const json = await res.json()
        if (cancelled) return
        if (res.ok) {
          setMinutes((json.data?.buckets ?? []) as MinuteBucket[])
        } else {
          setMinutes([])
        }
      } catch {
        if (!cancelled) setMinutes([])
      } finally {
        if (!cancelled) setMinutesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [drillHour, serviceKey])

  const fmtHour = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    } catch {
      return ""
    }
  }

  /** Bucket "10:00" başlıyor → "10:00 – 11:00" pencere etiketi. */
  const fmtWindow = (iso: string) => {
    try {
      const start = new Date(iso)
      const end = new Date(start.getTime() + 60 * 60 * 1000)
      const fmt = (d: Date) =>
        d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      return `${fmt(start)} – ${fmt(end)}`
    } catch {
      return iso
    }
  }

  /** Dakikalık tooltip için "10:23 – 10:24". */
  const fmtMinuteWindow = (iso: string) => {
    try {
      const start = new Date(iso)
      const end = new Date(start.getTime() + 60_000)
      const fmt = (d: Date) =>
        d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      return `${fmt(start)} – ${fmt(end)}`
    } catch {
      return iso
    }
  }

  /** Aria-friendly status etiketi — i18n key yoksa fallback. */
  const statusLabel = (s: HourBucket["status"]) =>
    s === "no-data" ? t("history.noData") : t(`status.${s}`)

  return (
    <TooltipProvider delay={80}>
      <div className="flex flex-col gap-1.5 pt-1">
        {/* `group/pills` — hover edilen pill scale-up olur, kardeşler dim
             olur. Yükseklik değişmez (eskisi h-6 → h-9 yapıyordu, layout
             jumping vardı); transform: scale yatay/dikey jumping yapmaz. */}
        <div className="group/pills flex items-end gap-[3px] overflow-visible py-1.5">
          {buckets.map((b) => {
            const isActive = drillHour === b.hour
            // Resolved indicator: status operational ama saat içinde
            // hata olmuş. Pill yeşil kalır (kullanıcı talebi: çözülmüşse
            // yeşil), küçük amber dot tooltip + indicator olarak gösterilir.
            const resolved = b.status === "operational" && b.hadIncident
            return (
              <Tooltip key={b.hour}>
                <TooltipTrigger
                  aria-label={`${fmtWindow(b.hour)} — ${statusLabel(b.status)}${resolved ? " (incident resolved)" : ""}`}
                  onClick={() =>
                    setDrillHour((cur) => (cur === b.hour ? null : b.hour))
                  }
                  className={cn(
                    "relative h-6 flex-1 rounded-[3px] cursor-pointer p-0 border-0 outline-none",
                    "transition-[transform,opacity,filter,box-shadow] duration-200 ease-out",
                    "origin-bottom",
                    PILL_COLOR[b.status],
                    b.status === "no-data" && "opacity-60",
                    // Hover: scale ile dikey büyüme — layout jumping yok,
                    // çevre pill'lere dokunmaz, daha smooth.
                    "hover:scale-y-[1.6] hover:brightness-110",
                    "hover:shadow-[0_0_0_2px_rgba(255,255,255,0.65)] dark:hover:shadow-[0_0_0_2px_rgba(0,0,0,0.55)]",
                    "group-hover/pills:opacity-40",
                    "hover:!opacity-100",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                    // Active (drill açık) → kalıcı scale + ring
                    isActive &&
                      "scale-y-[1.6] brightness-110 !opacity-100 shadow-[0_0_0_2px_rgba(0,0,0,0.5)] dark:shadow-[0_0_0_2px_rgba(255,255,255,0.5)]",
                  )}
                >
                  {resolved && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -top-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-amber-400 ring-1 ring-amber-100/60"
                    />
                  )}
                </TooltipTrigger>
                <TooltipContent className="px-2.5 py-1.5">
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-[11px] tabular-nums opacity-80">
                      {fmtWindow(b.hour)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          PILL_DOT[b.status],
                        )}
                      />
                      <span className="text-[12px] font-medium capitalize">
                        {statusLabel(b.status)}
                      </span>
                    </div>
                    {resolved && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400">
                        {t("history.incidentResolved")}
                      </span>
                    )}
                    {b.status !== "no-data" && b.count > 0 && (
                      <span className="text-[10px] opacity-60">
                        {t("history.probes", { count: b.count })}
                      </span>
                    )}
                    <span className="text-[10px] opacity-50">
                      {t("history.clickToDrill")}
                    </span>
                  </div>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{first ? fmtHour(first.hour) : ""}</span>
          <span>{label}</span>
          <span>{last ? fmtHour(last.hour) : ""}</span>
        </div>

        {/* ── Minute drill-down ──────────────────────────────────────── */}
        {drillHour && (
          <div className="mt-2 flex flex-col gap-1.5 rounded-md border bg-muted/20 p-2">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span className="font-mono tabular-nums">
                {fmtWindow(drillHour)}
              </span>
              <button
                type="button"
                onClick={() => setDrillHour(null)}
                className="hover:text-foreground"
                aria-label={t("history.drillClose")}
              >
                {t("history.drillClose")} ✕
              </button>
            </div>
            {minutesLoading || !minutes ? (
              <div className="flex h-6 items-center justify-center text-[10px] text-muted-foreground">
                {t("history.drillLoading")}
              </div>
            ) : (
              <div className="group/min flex items-end gap-[2px] overflow-visible py-1">
                {minutes.map((m) => (
                  <Tooltip key={m.minute}>
                    <TooltipTrigger
                      aria-label={`${fmtMinuteWindow(m.minute)} — ${statusLabel(m.status)}`}
                      className={cn(
                        "h-5 flex-1 rounded-[2px] cursor-help p-0 border-0 outline-none",
                        "transition-[transform,opacity,filter,box-shadow] duration-200 ease-out",
                        "origin-bottom",
                        PILL_COLOR[m.status],
                        m.status === "no-data" && "opacity-50",
                        "hover:scale-y-[1.8] hover:brightness-110",
                        "hover:shadow-[0_0_0_2px_rgba(255,255,255,0.65)] dark:hover:shadow-[0_0_0_2px_rgba(0,0,0,0.55)]",
                        "group-hover/min:opacity-50",
                        "hover:!opacity-100",
                      )}
                    />
                    <TooltipContent className="px-2 py-1">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-[11px] tabular-nums opacity-80">
                          {fmtMinuteWindow(m.minute)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              PILL_DOT[m.status],
                            )}
                          />
                          <span className="text-[11px] font-medium capitalize">
                            {statusLabel(m.status)}
                          </span>
                        </div>
                        {m.avgLatencyMs != null && (
                          <span className="font-mono text-[10px] opacity-60">
                            {m.avgLatencyMs} ms
                          </span>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
