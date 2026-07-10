import { NextRequest, NextResponse } from "next/server"
import {
  statusPageModel,
  statusComponentModel,
  statusCheckModel,
  statusProbeEventModel,
  statusIncidentModel,
  statusMaintenanceModel,
  statusUptimeRollupModel,
} from "@workspace/db/models"
import type { StatusPage } from "@workspace/db/models/status-page"
import type { StatusComponent } from "@workspace/db/models/status-component"
import type { StatusCheck } from "@workspace/db/models/status-check"
import type { ProbeStatus } from "@workspace/db/models/status-probe-event"
import { pickLocalized } from "@workspace/db/types"

const SUPPORTED_LOCALES = ["tr", "en"] as const
const DEFAULT_LOCALE = "en"

function resolveLang(request: NextRequest): string {
  const url = new URL(request.url)
  const param = url.searchParams.get("lang")?.trim().toLowerCase()
  if (param && SUPPORTED_LOCALES.includes(param as (typeof SUPPORTED_LOCALES)[number])) {
    return param
  }
  const acceptLang = request.headers.get("accept-language") ?? ""
  for (const part of acceptLang.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase().slice(0, 2)
    if (tag && SUPPORTED_LOCALES.includes(tag as (typeof SUPPORTED_LOCALES)[number])) {
      return tag
    }
  }
  return DEFAULT_LOCALE
}

/**
 * Public Status Page read API. Atlassian Statuspage `summary.json`
 * eşleniği — slug-based lookup, no auth, CORS-open (embed widget'ları
 * dahil tüketebilsin).
 *
 * Endpoint: `GET /api/v1/status/[slug]` veya `GET /p/[slug]/feed.json`
 *
 * Response shape:
 *   {
 *     page: { name, slug, branding, ... }
 *     overall: "operational" | "degraded" | "down" | "maintenance"
 *     components: [{ id, name, status, uptime24h, uptime30d, lastChecked, ... }]
 *     activeIncidents: [...]
 *     upcomingMaintenances: [...]
 *     generatedAt
 *   }
 *
 * Cache: 30s ISR (Sentroy internal status pattern'iyle aynı).
 */

const SUMMARY_CACHE_SECONDS = 30

export interface PublicStatusComponent {
  id: string
  name: string
  description: string | null
  groupKey: string | null
  position: number
  status: ProbeStatus | "no-data" | "maintenance"
  uptime24h: number | null
  uptime30d: number | null
  lastCheckedAt: Date | null
  /** Son 90 günlük günlük status — Atlassian Statuspage bar chart için.
   *  Eski tarihten yakın tarihe; her gün bir entry. */
  dailyHistory: Array<{
    date: string // YYYY-MM-DD UTC
    status: ProbeStatus | "no-data"
  }>
  checks: Array<{
    id: string
    name: string
    status: ProbeStatus | "no-data"
    lastLatencyMs: number | null
    lastCheckedAt: Date | null
  }>
}

export interface PublicStatusSnapshot {
  page: {
    name: string
    slug: string
    branding: StatusPage["branding"]
    customDomain: string | null
    subscribersEnabled: boolean
  }
  overall: ProbeStatus | "no-data" | "maintenance"
  components: PublicStatusComponent[]
  activeIncidents: Array<{
    id: string
    title: string
    status: string
    impact: string
    affectedComponentIds: string[]
    startedAt: Date
    updates: Array<{
      id: string
      status: string
      body: string
      createdAt: Date
    }>
  }>
  /** Şu an in_progress veya scheduledStart geçmiş active maintenance'lar
   *  (public page banner-style üst section). */
  activeMaintenances: Array<{
    id: string
    title: string
    description: string
    affectedComponentIds: string[]
    scheduledStart: Date
    scheduledEnd: Date
    status: string
  }>
  upcomingMaintenances: Array<{
    id: string
    title: string
    description: string
    affectedComponentIds: string[]
    scheduledStart: Date
    scheduledEnd: Date
    status: string
  }>
  /** Son 30 günde kapanmış incident'ler (descending by startedAt). Public
   *  page "Past incidents" history section'ında render edilir. */
  pastIncidents: Array<{
    id: string
    title: string
    impact: string
    affectedComponentIds: string[]
    startedAt: Date
    resolvedAt: Date | null
    postmortem: string | null
    postmortemPublishedAt: Date | null
  }>
  generatedAt: Date
  windowHours: 24
}

/**
 * GET /api/v1/status/[slug] — public summary JSON. CORS-open.
 * `?lang=tr|en` veya Accept-Language header ile locale belirlenir.
 */
export async function publicSummaryGet(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const lang = resolveLang(request)
  const snapshot = await buildPublicSnapshot(slug, { lang })
  if (!snapshot) {
    return NextResponse.json(
      { error: "status page not found" },
      {
        status: 404,
        headers: { "Access-Control-Allow-Origin": "*" },
      },
    )
  }
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": `public, s-maxage=${SUMMARY_CACHE_SECONDS}, stale-while-revalidate=60`,
      "Access-Control-Allow-Origin": "*",
      "Content-Language": lang,
      Vary: "Accept-Language",
    },
  })
}

/**
 * Build snapshot — public page'in JSON shape'i. Server component'ten de
 * çağrılır (HTML render için). LocalizedText alanları `opts.lang` ile
 * resolve edilir (single string).
 */
export async function buildPublicSnapshot(
  slug: string,
  opts: { lang?: string } = {},
): Promise<PublicStatusSnapshot | null> {
  const lang = opts.lang ?? DEFAULT_LOCALE
  const page = await statusPageModel.findBySlug(slug)
  if (!page || !page.enabled) return null

  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [
    components,
    checks,
    activeIncidents,
    activeMaintenances,
    upcomingMaintenances,
    recentIncidents,
  ] = await Promise.all([
    statusComponentModel.findByPage(page.id, { onlyVisible: true }),
    statusCheckModel.findByPage(page.id, { onlyEnabled: true }),
    statusIncidentModel.findActiveByPage(page.id),
    statusMaintenanceModel.findActiveByPage(page.id),
    statusMaintenanceModel.findUpcomingByPage(page.id, { limit: 5 }),
    statusIncidentModel.findRecentByPage(page.id, { limit: 30 }),
  ])

  // Past incidents — son 30 günde resolve edilmiş + history section için
  const thirtyDaysAgo2 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const pastIncidents = recentIncidents.filter(
    (i) =>
      i.status === "resolved" &&
      i.resolvedAt &&
      new Date(i.resolvedAt).getTime() >= thirtyDaysAgo2.getTime(),
  )

  // Component → checks lookup
  const checksByComponent = new Map<string, StatusCheck[]>()
  for (const c of checks) {
    const arr = checksByComponent.get(c.componentId) ?? []
    arr.push(c)
    checksByComponent.set(c.componentId, arr)
  }

  // Maintenance set — affected component'lere "maintenance" status uygula.
  const componentsUnderMaintenance = new Set<string>()
  for (const m of activeMaintenances) {
    for (const cid of m.affectedComponentIds) {
      componentsUnderMaintenance.add(cid)
    }
  }

  // Per-component status hesapla — check'lerin worst severity'sinden derive,
  // maintenance varsa override.
  const publicComponents: PublicStatusComponent[] = await Promise.all(
    components.map(async (component) =>
      buildPublicComponent(component, {
        checks: checksByComponent.get(component.id) ?? [],
        underMaintenance: componentsUnderMaintenance.has(component.id),
        windowFrom: oneDayAgo,
        thirtyDaysFrom: thirtyDaysAgo,
        windowTo: now,
      }),
    ),
  )

  // Overall — bileşen status'larının worst'u; maintenance bileşeni varsa
  // ve down yoksa "maintenance".
  const overall = computeOverall(publicComponents)

  return {
    page: {
      name: page.name,
      slug: page.slug,
      branding: page.branding,
      customDomain: page.customDomain,
      subscribersEnabled: page.subscribersEnabled,
    },
    overall,
    components: publicComponents,
    activeIncidents: activeIncidents.map((i) => ({
      id: i.id,
      title: pickLocalized(i.title, lang),
      status: i.status,
      impact: i.impact,
      affectedComponentIds: i.affectedComponentIds,
      startedAt: i.startedAt,
      updates: i.updates.map((u) => ({
        id: u.id,
        status: u.status,
        body: pickLocalized(u.body, lang),
        createdAt: u.createdAt,
      })),
    })),
    activeMaintenances: activeMaintenances.map((m) => ({
      id: m.id,
      title: pickLocalized(m.title, lang),
      description: pickLocalized(m.description, lang),
      affectedComponentIds: m.affectedComponentIds,
      scheduledStart: m.scheduledStart,
      scheduledEnd: m.scheduledEnd,
      status: m.status,
    })),
    upcomingMaintenances: upcomingMaintenances.map((m) => ({
      id: m.id,
      title: pickLocalized(m.title, lang),
      description: pickLocalized(m.description, lang),
      affectedComponentIds: m.affectedComponentIds,
      scheduledStart: m.scheduledStart,
      scheduledEnd: m.scheduledEnd,
      status: m.status,
    })),
    pastIncidents: pastIncidents.map((i) => ({
      id: i.id,
      title: pickLocalized(i.title, lang),
      impact: i.impact,
      affectedComponentIds: i.affectedComponentIds,
      startedAt: i.startedAt,
      resolvedAt: i.resolvedAt,
      postmortem: i.postmortem ? pickLocalized(i.postmortem, lang) : null,
      postmortemPublishedAt: i.postmortemPublishedAt,
    })),
    generatedAt: now,
    windowHours: 24,
  }
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

async function buildPublicComponent(
  component: StatusComponent,
  ctx: {
    checks: StatusCheck[]
    underMaintenance: boolean
    windowFrom: Date
    thirtyDaysFrom: Date
    windowTo: Date
  },
): Promise<PublicStatusComponent> {
  // Check'ler için son probe + uptime % paralel.
  const checkSnapshots = await Promise.all(
    ctx.checks.map(async (check) => {
      const [last, uptime24h] = await Promise.all([
        statusProbeEventModel.findLatest(check.id),
        statusProbeEventModel.uptimePercentage(
          check.id,
          ctx.windowFrom,
          ctx.windowTo,
        ),
      ])
      return {
        id: check.id,
        name: check.name,
        status: (last?.status ?? "no-data") as ProbeStatus | "no-data",
        lastLatencyMs: last?.latencyMs ?? null,
        lastCheckedAt: last?.timestamp ?? null,
        uptime24h,
      }
    }),
  )

  // 90-day uptime bar chart — pre-aggregated rollup'tan oku (worker
  // her gün rollup yazar). Bugünkü partial gün için raw aggregate
  // fallback.
  const ninetyDaysFrom = new Date(ctx.windowTo.getTime() - NINETY_DAYS_MS)
  ninetyDaysFrom.setUTCHours(0, 0, 0, 0)
  const todayStart = new Date(ctx.windowTo)
  todayStart.setUTCHours(0, 0, 0, 0)

  // Rollup (dün ve önceki günler)
  const rollupsByCheck = await Promise.all(
    ctx.checks.map((check) =>
      statusUptimeRollupModel.findRange(check.id, ninetyDaysFrom, todayStart),
    ),
  )
  // Bugün için raw aggregate (rollup yarın yazılacak)
  const todayRawByCheck = await Promise.all(
    ctx.checks.map((check) =>
      statusProbeEventModel.aggregateDaily(check.id, todayStart, ctx.windowTo),
    ),
  )

  const dayMap = new Map<string, ProbeStatus | "no-data">()

  function mergeStatus(
    existing: ProbeStatus | "no-data" | undefined,
    next: ProbeStatus,
  ): ProbeStatus {
    if (existing === "down" || next === "down") return "down"
    if (existing === "degraded" || next === "degraded") return "degraded"
    return "operational"
  }

  for (const rollups of rollupsByCheck) {
    for (const r of rollups) {
      const key = r.day.toISOString().slice(0, 10)
      const merged = mergeStatus(dayMap.get(key), r.worstStatus)
      dayMap.set(key, merged)
    }
  }
  for (const aggregates of todayRawByCheck) {
    for (const a of aggregates) {
      const key = a.day.toISOString().slice(0, 10)
      const merged = mergeStatus(dayMap.get(key), a.worstStatus)
      dayMap.set(key, merged)
    }
  }

  // Forward-fill: probe.record dedup window'u (5dk) sürekli operational
  // bir check'i günler boyu event yazmamasına neden olur — dayMap'te
  // eksik gün "no-data" görünür ama gerçekte servis up'tı. Çözüm:
  // eksik bir gün için, ondan ÖNCEKİ en yakın bilinen status'u carry-
  // forward et, AMA sadece check'in createdAt'inden sonraki + ilk
  // bilinen event'ten sonraki günler için (daha öncesinde gerçekten
  // henüz monitoring yoktu, no-data bırak).
  //
  // Bilinen ilk gün: dayMap'teki en eski key. Daha öncesi gerçek no-data.
  let earliestKnownDay: string | null = null
  for (const k of dayMap.keys()) {
    if (earliestKnownDay === null || k < earliestKnownDay) earliestKnownDay = k
  }

  const dailyHistory: PublicStatusComponent["dailyHistory"] = []
  let lastSeen: ProbeStatus | "no-data" = "no-data"
  for (let i = 89; i >= 0; i--) {
    const d = new Date(ctx.windowTo.getTime() - i * 24 * 60 * 60 * 1000)
    const key = d.toISOString().slice(0, 10)
    const direct = dayMap.get(key)
    if (direct !== undefined) {
      lastSeen = direct
      dailyHistory.push({ date: key, status: direct })
    } else if (earliestKnownDay !== null && key >= earliestKnownDay) {
      // Eksik gün ama monitoring başlamış → son bilinen state'i forward-fill.
      // "down" hariç forward-fill'i koru: down bir status değişikliği gerektirir,
      // eksik veriyi down olarak göstermek yanıltıcı (worker kayıtsızdır,
      // gerçek state operational da olabilir). Operational'ı carry-forward,
      // down/degraded gördüysek bir sonraki bilinen event'i bekle.
      const safe: ProbeStatus | "no-data" =
        lastSeen === "down" || lastSeen === "degraded" ? "operational" : lastSeen
      dailyHistory.push({ date: key, status: safe })
    } else {
      dailyHistory.push({ date: key, status: "no-data" })
    }
  }

  // Component status: worst of check statuses
  const componentStatus: PublicStatusComponent["status"] = ctx.underMaintenance
    ? "maintenance"
    : checkSnapshots.length === 0
      ? "no-data"
      : checkSnapshots.some((c) => c.status === "down")
        ? "down"
        : checkSnapshots.some((c) => c.status === "degraded")
          ? "degraded"
          : checkSnapshots.every((c) => c.status === "no-data")
            ? "no-data"
            : "operational"

  // Component-wide uptime — check'lerin avg'i (tüm probe count'una göre weight
  // yok; basit avg yeterli, public görüntü için).
  const validUptimes = checkSnapshots
    .map((c) => c.uptime24h)
    .filter((v): v is number => v !== null)
  const uptime24h =
    validUptimes.length > 0
      ? validUptimes.reduce((a, b) => a + b, 0) / validUptimes.length
      : null

  // 30-day uptime — daha pahalı, sadece component-level (her check için
  // aggregation 30d window'da). Snapshot için yeterli.
  const uptime30dValues = await Promise.all(
    ctx.checks.map((check) =>
      statusProbeEventModel.uptimePercentage(
        check.id,
        ctx.thirtyDaysFrom,
        ctx.windowTo,
      ),
    ),
  )
  const valid30d = uptime30dValues.filter((v): v is number => v !== null)
  const uptime30d =
    valid30d.length > 0
      ? valid30d.reduce((a, b) => a + b, 0) / valid30d.length
      : null

  // Last checked = check'lerin en yenisi
  const lastCheckedAt = checkSnapshots
    .map((c) => c.lastCheckedAt)
    .filter((v): v is Date => v !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null

  return {
    id: component.id,
    name: component.name,
    description: component.description,
    groupKey: component.groupKey,
    position: component.position,
    status: componentStatus,
    uptime24h,
    uptime30d,
    lastCheckedAt,
    dailyHistory,
    checks: checkSnapshots.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      lastLatencyMs: c.lastLatencyMs,
      lastCheckedAt: c.lastCheckedAt,
    })),
  }
}

function computeOverall(
  components: PublicStatusComponent[],
): PublicStatusSnapshot["overall"] {
  if (components.length === 0) return "no-data"
  if (components.some((c) => c.status === "down")) return "down"
  if (components.some((c) => c.status === "degraded")) return "degraded"
  if (components.every((c) => c.status === "no-data")) return "no-data"
  if (components.some((c) => c.status === "maintenance")) return "maintenance"
  return "operational"
}

/**
 * OPTIONS preflight — embed widget cross-origin.
 */
export function publicOptions(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  })
}

const INCIDENTS_CACHE_SECONDS = 60
const INCIDENTS_MAX_PAGE_SIZE = 100
const INCIDENTS_DEFAULT_PAGE_SIZE = 20

export interface PublicIncidentDetail {
  id: string
  title: string
  status: string
  impact: string
  affectedComponentIds: string[]
  source: "manual" | "auto"
  startedAt: Date
  resolvedAt: Date | null
  updates: Array<{
    id: string
    status: string
    body: string
    createdAt: Date
    authorName: string | null
  }>
  postmortem: string | null
  postmortemPublishedAt: Date | null
}

export interface PublicIncidentsList {
  page: { name: string; slug: string }
  incidents: PublicIncidentDetail[]
  pagination: {
    page: number
    pageSize: number
    total: number
    hasMore: boolean
  }
  generatedAt: Date
}

/**
 * GET /api/v1/status/[slug]/incidents — paginated incident history.
 * Snapshot endpoint'inden farkı: tüm update'leri + postmortem'i içerir
 * (snapshot sadece son 30 günü ve özet). Atlassian Statuspage
 * `incidents.json` muadili.
 *
 * Query params:
 *   `?lang=tr|en` (default: Accept-Language)
 *   `?page=1` (1-indexed, default 1)
 *   `?pageSize=20` (default 20, max 100)
 *   `?status=active|resolved` (filter, optional)
 */
export async function publicIncidentsListGet(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const lang = resolveLang(request)
  const url = new URL(request.url)
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1)
  const pageSize = Math.min(
    INCIDENTS_MAX_PAGE_SIZE,
    Math.max(
      1,
      Number.parseInt(
        url.searchParams.get("pageSize") ?? String(INCIDENTS_DEFAULT_PAGE_SIZE),
        10,
      ) || INCIDENTS_DEFAULT_PAGE_SIZE,
    ),
  )
  const statusFilter = url.searchParams.get("status")?.trim().toLowerCase()

  const statusPage = await statusPageModel.findBySlug(slug)
  if (!statusPage || !statusPage.enabled) {
    return NextResponse.json(
      { error: "status page not found" },
      { status: 404, headers: { "Access-Control-Allow-Origin": "*" } },
    )
  }

  // Apply status filter via direct collection access — model'in
  // findRecentByPage'i status filter desteklemiyor.
  const skip = (page - 1) * pageSize
  let allIncidents: Awaited<ReturnType<typeof statusIncidentModel.findRecentByPage>>
  let total: number
  if (statusFilter === "active") {
    allIncidents = await statusIncidentModel.findActiveByPage(statusPage.id)
    total = allIncidents.length
    allIncidents = allIncidents.slice(skip, skip + pageSize)
  } else if (statusFilter === "resolved") {
    // findRecentByPage döner tümünü; resolved'ı filtrele + toplam say.
    // Atlassian pattern'ine sadık kalmak için 1 fazla limit alıp hasMore
    // kontrolü yap.
    const recent = await statusIncidentModel.findRecentByPage(statusPage.id, {
      limit: 1000,
    })
    const resolved = recent.filter((i) => i.status === "resolved")
    total = resolved.length
    allIncidents = resolved.slice(skip, skip + pageSize)
  } else {
    total = await statusIncidentModel.countByPage(statusPage.id)
    allIncidents = await statusIncidentModel.findRecentByPage(statusPage.id, {
      limit: pageSize,
      skip,
    })
  }

  const incidents: PublicIncidentDetail[] = allIncidents.map((i) => ({
    id: i.id,
    title: pickLocalized(i.title, lang),
    status: i.status,
    impact: i.impact,
    affectedComponentIds: i.affectedComponentIds,
    source: i.source,
    startedAt: i.startedAt,
    resolvedAt: i.resolvedAt,
    updates: i.updates.map((u) => ({
      id: u.id,
      status: u.status,
      body: pickLocalized(u.body, lang),
      createdAt: u.createdAt,
      authorName: u.authorName,
    })),
    postmortem: i.postmortem ? pickLocalized(i.postmortem, lang) : null,
    postmortemPublishedAt: i.postmortemPublishedAt,
  }))

  const payload: PublicIncidentsList = {
    page: { name: statusPage.name, slug: statusPage.slug },
    incidents,
    pagination: {
      page,
      pageSize,
      total,
      hasMore: skip + incidents.length < total,
    },
    generatedAt: new Date(),
  }

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": `public, s-maxage=${INCIDENTS_CACHE_SECONDS}, stale-while-revalidate=120`,
      "Access-Control-Allow-Origin": "*",
      "Content-Language": lang,
      Vary: "Accept-Language",
    },
  })
}

/**
 * GET /api/v1/status/[slug]/incidents/[incidentId] — tek incident detayı
 * (postmortem dahil, tüm timeline updates). Public, CORS-open.
 */
export async function publicIncidentDetailGet(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; incidentId: string }> },
) {
  const { slug, incidentId } = await params
  const lang = resolveLang(request)

  const statusPage = await statusPageModel.findBySlug(slug)
  if (!statusPage || !statusPage.enabled) {
    return NextResponse.json(
      { error: "status page not found" },
      { status: 404, headers: { "Access-Control-Allow-Origin": "*" } },
    )
  }

  const incident = await statusIncidentModel.findById(incidentId)
  if (!incident || incident.pageId !== statusPage.id) {
    return NextResponse.json(
      { error: "incident not found" },
      { status: 404, headers: { "Access-Control-Allow-Origin": "*" } },
    )
  }

  const detail: PublicIncidentDetail = {
    id: incident.id,
    title: pickLocalized(incident.title, lang),
    status: incident.status,
    impact: incident.impact,
    affectedComponentIds: incident.affectedComponentIds,
    source: incident.source,
    startedAt: incident.startedAt,
    resolvedAt: incident.resolvedAt,
    updates: incident.updates.map((u) => ({
      id: u.id,
      status: u.status,
      body: pickLocalized(u.body, lang),
      createdAt: u.createdAt,
      authorName: u.authorName,
    })),
    postmortem: incident.postmortem ? pickLocalized(incident.postmortem, lang) : null,
    postmortemPublishedAt: incident.postmortemPublishedAt,
  }

  return NextResponse.json(
    { page: { name: statusPage.name, slug: statusPage.slug }, incident: detail },
    {
      headers: {
        "Cache-Control": `public, s-maxage=${INCIDENTS_CACHE_SECONDS}, stale-while-revalidate=120`,
        "Access-Control-Allow-Origin": "*",
        "Content-Language": lang,
        Vary: "Accept-Language",
      },
    },
  )
}
