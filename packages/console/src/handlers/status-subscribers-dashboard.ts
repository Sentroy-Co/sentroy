import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import {
  statusPageModel,
  statusSubscriberModel,
  statusNotifyDeliveryModel,
} from "@workspace/db/models"
import type {
  DeliveryChannel,
  DeliveryStatus,
} from "@workspace/db/models/status-notify-delivery"
import type {
  SubscriberType,
  SubscriberEventTopic,
} from "@workspace/db/models/status-subscriber"
import { audit } from "@workspace/console/lib/audit"

/**
 * Dashboard subscriber yönetimi — RP company kendi page'inin subscribers
 * listesini görür ve kayıtları silebilir. Verify durumu, son aktivite ve
 * tip filtresi.
 *
 * v1: listele + sil. Edit/filter UI sonra.
 */

async function resolvePage(
  access: { companyId: string },
): Promise<{ id: string; slug: string } | null> {
  const page = await statusPageModel.findByCompany(access.companyId)
  if (!page) return null
  return { id: page.id, slug: page.slug }
}

export async function subscribersListGet(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await resolvePage(access)
  if (!page) return jsonError("status page not found", 404)

  // Dashboard tüm subscribers (pending + active + unsubscribed) görür;
  // findActiveByPage sadece delivery için filter eder.
  const subscribers = await statusSubscriberModel.findAllByPage(page.id)
  // Sensitive fields (webhookSecretHash, telegramBotTokenEncrypted) drop —
  // public projeksiyon; sadece prefix gösterilir
  const projected = subscribers.map((s) => ({
    id: s.id,
    type: s.type,
    target: s.target,
    verified: s.verified,
    componentFilter: s.componentFilter,
    topicFilter: s.topicFilter,
    webhookSecretPrefix: s.webhookSecretPrefix,
    telegramBotTokenPrefix: s.telegramBotTokenPrefix,
    createdAt: s.createdAt,
    verifiedAt: s.verifiedAt,
    unsubscribedAt: s.unsubscribedAt,
  }))
  return jsonSuccess(projected)
}

export async function subscriberPatch(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; subscriberId: string }> },
) {
  const { slug, subscriberId } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await resolvePage(access)
  if (!page) return jsonError("status page not found", 404)

  const subscriber = await statusSubscriberModel.findById(subscriberId)
  if (!subscriber || subscriber.pageId !== page.id) {
    return jsonError("subscriber not found", 404)
  }

  let body: { componentFilter?: string[]; topicFilter?: string[] }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const validTopics = new Set([
    "incident.opened",
    "incident.updated",
    "incident.resolved",
    "maintenance.scheduled",
    "maintenance.reminder",
    "maintenance.started",
    "maintenance.completed",
  ])

  const patch: {
    componentFilter?: string[]
    topicFilter?: Parameters<
      typeof statusSubscriberModel.updateFilters
    >[1]["topicFilter"]
  } = {}
  if (Array.isArray(body.componentFilter)) {
    patch.componentFilter = body.componentFilter.filter(
      (id) => typeof id === "string",
    )
  }
  if (Array.isArray(body.topicFilter)) {
    patch.topicFilter = body.topicFilter.filter(
      (t): t is (typeof patch.topicFilter & {})[number] =>
        typeof t === "string" && validTopics.has(t),
    )
  }

  const updated = await statusSubscriberModel.updateFilters(subscriberId, patch)
  if (!updated) return jsonError("update failed", 500)

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "status-page.subscriber.update",
    resource: "status-subscriber",
    resourceId: subscriberId,
    details: { pageSlug: page.slug, target: subscriber.target },
  })

  return jsonSuccess({
    componentFilter: updated.componentFilter,
    topicFilter: updated.topicFilter,
  })
}

export async function subscriberDelete(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; subscriberId: string }> },
) {
  const { slug, subscriberId } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await resolvePage(access)
  if (!page) return jsonError("status page not found", 404)

  const subscriber = await statusSubscriberModel.findById(subscriberId)
  if (!subscriber || subscriber.pageId !== page.id) {
    return jsonError("subscriber not found", 404)
  }

  const ok = await statusSubscriberModel.remove(subscriberId)
  if (!ok) return jsonError("delete failed", 500)

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "status-page.subscriber.delete",
    resource: "status-subscriber",
    resourceId: subscriberId,
    details: { pageSlug: page.slug, type: subscriber.type, target: subscriber.target },
  })

  return jsonSuccess({ ok: true })
}

// ─── Delivery log ─────────────────────────────────────────────────────────

const VALID_DELIVERY_CHANNELS: DeliveryChannel[] = ["email", "webhook", "telegram"]
const VALID_DELIVERY_STATUSES: DeliveryStatus[] = ["delivered", "failed", "skipped"]

/**
 * GET /api/companies/[slug]/status-page/deliveries
 * Query params: `channel`, `status`, `subscriberId`, `page` (1-indexed), `pageSize` (default 50, max 200)
 *
 * Per-subscriber notify dispatch history. Atlassian Statuspage'in
 * "Webhook deliveries" muadili — gönderim sonuçlarını debug için.
 */
export async function deliveriesListGet(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await resolvePage(access)
  if (!page) return jsonError("status page not found", 404)

  const url = new URL(request.url)
  const channelParam = url.searchParams.get("channel")?.trim().toLowerCase() as
    | DeliveryChannel
    | undefined
  const statusParam = url.searchParams.get("status")?.trim().toLowerCase() as
    | DeliveryStatus
    | undefined
  const subscriberId = url.searchParams.get("subscriberId")?.trim() ?? undefined

  const opts: {
    channel?: DeliveryChannel
    status?: DeliveryStatus
    subscriberId?: string
  } = {}
  if (channelParam && VALID_DELIVERY_CHANNELS.includes(channelParam)) {
    opts.channel = channelParam
  }
  if (statusParam && VALID_DELIVERY_STATUSES.includes(statusParam)) {
    opts.status = statusParam
  }
  if (subscriberId) opts.subscriberId = subscriberId

  const pageNum = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1)
  const pageSize = Math.min(
    200,
    Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "50", 10) || 50),
  )
  const skip = (pageNum - 1) * pageSize

  const [items, total] = await Promise.all([
    statusNotifyDeliveryModel.findByPage(page.id, { ...opts, limit: pageSize, skip }),
    statusNotifyDeliveryModel.countByPage(page.id, opts),
  ])

  return jsonSuccess({
    items,
    pagination: { page: pageNum, pageSize, total, hasMore: skip + items.length < total },
  })
}

// ─── CSV subscriber import ────────────────────────────────────────────────

const VALID_TOPICS: SubscriberEventTopic[] = [
  "incident.opened",
  "incident.updated",
  "incident.resolved",
  "maintenance.scheduled",
  "maintenance.reminder",
  "maintenance.started",
  "maintenance.completed",
]

// CSV bulk import sadece email destekler — webhook/telegram credential
// gerektirir, bulk pattern'ine uymaz. Dashboard'dan tek tek eklenir.
const CSV_VALID_TYPES: SubscriberType[] = ["email"]

interface CsvImportRow {
  type: SubscriberType
  target: string
  topicFilter?: SubscriberEventTopic[]
  componentFilter?: string[]
}

/**
 * POST /api/companies/[slug]/status-page/subscribers/import
 * Body: `{ csv: string }` veya `{ rows: CsvImportRow[] }`
 *
 * CSV format (header line ZORUNLU):
 *   `type,target,topics,components`
 *   `email,alice@example.com,incident.opened;incident.resolved,`
 *   `email,bob@example.com,,`  → tüm topic'ler / hiç component filter
 *
 * Validate + dedup (aynı pageId + target için tek subscriber). verified=true
 * (RP onaylı bulk import — opt-in zinciri RP tarafında).
 */
export async function subscribersImportPost(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await resolvePage(access)
  if (!page) return jsonError("status page not found", 404)

  let body: { csv?: string; rows?: CsvImportRow[] }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  let rows: CsvImportRow[]
  if (typeof body.csv === "string" && body.csv.trim().length > 0) {
    const parsed = parseCsv(body.csv)
    if (parsed.error) return jsonError(parsed.error)
    rows = parsed.rows
  } else if (Array.isArray(body.rows)) {
    rows = body.rows
  } else {
    return jsonError("either csv string or rows array required")
  }

  if (rows.length === 0) return jsonError("no rows to import")
  if (rows.length > 1000) {
    return jsonError("too many rows (max 1000 per request)")
  }

  // Existing subscribers — dedup by (type, target)
  const existing = await statusSubscriberModel.findAllByPage(page.id)
  const existingKeys = new Set(
    existing.map((s) => `${s.type}:${s.target.trim().toLowerCase()}`),
  )

  let imported = 0
  let skipped = 0
  let invalid = 0
  const errors: Array<{ row: number; reason: string }> = []

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!r || !CSV_VALID_TYPES.includes(r.type)) {
      invalid++
      errors.push({ row: i + 1, reason: "type must be email (csv import)" })
      continue
    }
    if (typeof r.target !== "string" || !r.target.trim()) {
      invalid++
      errors.push({ row: i + 1, reason: "target required" })
      continue
    }
    if (r.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.target.trim())) {
      invalid++
      errors.push({ row: i + 1, reason: "invalid email" })
      continue
    }
    const key = `${r.type}:${r.target.trim().toLowerCase()}`
    if (existingKeys.has(key)) {
      skipped++
      continue
    }
    const topicFilter = (r.topicFilter ?? []).filter((t) =>
      VALID_TOPICS.includes(t),
    )
    try {
      await statusSubscriberModel.create({
        pageId: page.id,
        type: r.type,
        target: r.target.trim(),
        componentFilter: r.componentFilter ?? [],
        topicFilter,
        preVerified: true,
      })
      existingKeys.add(key)
      imported++
    } catch (err) {
      invalid++
      errors.push({
        row: i + 1,
        reason: err instanceof Error ? err.message.slice(0, 200) : "create failed",
      })
    }
  }

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "status-page.subscribers.import",
    resource: "status-page",
    resourceId: page.id,
    details: {
      pageSlug: page.slug,
      imported,
      skipped,
      invalid,
      totalRows: rows.length,
    },
  })

  return jsonSuccess({ imported, skipped, invalid, totalRows: rows.length, errors })
}

function parseCsv(csv: string): { rows: CsvImportRow[]; error?: string } {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"))
  if (lines.length === 0) return { rows: [], error: "empty csv" }

  // Header parse — accept flexible column order
  const header = lines[0]!.toLowerCase().split(",").map((h) => h.trim())
  const idxType = header.indexOf("type")
  const idxTarget = header.indexOf("target")
  const idxTopics = header.indexOf("topics")
  const idxComponents = header.indexOf("components")
  if (idxType < 0 || idxTarget < 0) {
    return {
      rows: [],
      error: "csv header must include `type` and `target`",
    }
  }

  const rows: CsvImportRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(",").map((c) => c.trim())
    const type = cells[idxType] as SubscriberType
    const target = cells[idxTarget] ?? ""
    const topicStr = idxTopics >= 0 ? (cells[idxTopics] ?? "") : ""
    const compStr = idxComponents >= 0 ? (cells[idxComponents] ?? "") : ""
    const topicFilter = topicStr
      ? (topicStr.split(/[;|]/).map((t) => t.trim()).filter(Boolean) as SubscriberEventTopic[])
      : []
    const componentFilter = compStr
      ? compStr.split(/[;|]/).map((c) => c.trim()).filter(Boolean)
      : []
    rows.push({ type, target, topicFilter, componentFilter })
  }
  return { rows }
}
