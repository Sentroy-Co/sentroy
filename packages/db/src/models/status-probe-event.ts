import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "status_probe_events"

/**
 * Status Probe Event — bir check'in tek bir probe çıktısı. TTL'li
 * (60 gün — Sentroy internal `system_status_probes`'un 30 günden
 * uzun çünkü kullanıcı history dashboard'ında 30d uptime % istatistik'i
 * için margin gerek).
 *
 * Bir status değişikliği OLMASA da her başarılı probe yazılır mı?
 *   - Hayır — write amplification için. Aynı status 5dk içindeyse
 *     skip (Sentroy internal probe pattern'i: dedup window).
 *   - Status değişikliği veya `forceWrite=true` (e.g. severity escalation)
 *     anında yazılır.
 *
 * Aggregations (`aggregateHistory`) `status_probe_events` üzerinden
 * MongoDB pipeline ile (saatlik/dakikalık bucket'lara göre worst severity
 * + last status). Bu Sentroy internal'ın `system_status_probes` pattern'i.
 */

export type ProbeStatus = "operational" | "degraded" | "down"

export interface StatusProbeEvent {
  id: string
  /** Hangi check için. */
  checkId: string
  componentId: string
  pageId: string
  status: ProbeStatus
  /** Ne kadar sürdü probe (ms). Down ise null/0. */
  latencyMs: number | null
  /** HTTP status code (varsa). Down ise null. */
  httpStatus: number | null
  /** Hata mesajı (down/degraded ise). UI tooltip'inde. */
  error: string | null
  /** Worker region/instance (multi-region için). v1 single = "default". */
  region: string
  timestamp: Date
}

const TTL_DAYS = 60
const DEDUP_WINDOW_MS = 5 * 60 * 1000 // 5dk

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

// ─── Queries ──────────────────────────────────────────────────────────────

export async function findLatest(
  checkId: string,
): Promise<StatusProbeEvent | null> {
  const c = await col()
  const doc = await c
    .find({ checkId })
    .sort({ timestamp: -1 })
    .limit(1)
    .toArray()
  return doc[0] ? toId(doc[0]) : null
}

export async function findRange(
  checkId: string,
  from: Date,
  to: Date,
): Promise<StatusProbeEvent[]> {
  const c = await col()
  const docs = await c
    .find({ checkId, timestamp: { $gte: from, $lte: to } })
    .sort({ timestamp: 1 })
    .toArray()
  return docs.map((d) => toId(d))
}

/**
 * Hourly bucket aggregation — public status page'de 24h/7d/30d uptime
 * graph için. Saatlik worst severity + son status.
 */
export async function aggregateHourly(
  checkId: string,
  fromDate: Date,
  toDate: Date,
): Promise<
  Array<{
    hour: Date
    status: ProbeStatus
    worstStatus: ProbeStatus
    eventCount: number
    avgLatency: number | null
  }>
> {
  const c = await col()
  const pipeline = [
    {
      $match: {
        checkId,
        timestamp: { $gte: fromDate, $lte: toDate },
      },
    },
    {
      $group: {
        _id: {
          $dateTrunc: { date: "$timestamp", unit: "hour" },
        },
        events: {
          $push: {
            status: "$status",
            latencyMs: "$latencyMs",
            timestamp: "$timestamp",
          },
        },
        eventCount: { $sum: 1 },
        avgLatency: { $avg: "$latencyMs" },
      },
    },
    { $sort: { _id: 1 } },
  ]
  const docs = await c.aggregate(pipeline).toArray()
  return docs.map((d) => {
    const events = d.events as Array<{
      status: ProbeStatus
      latencyMs: number | null
      timestamp: Date
    }>
    // Worst: down > degraded > operational
    const worstStatus: ProbeStatus = events.some((e) => e.status === "down")
      ? "down"
      : events.some((e) => e.status === "degraded")
        ? "degraded"
        : "operational"
    // Last (chronologically) status
    const last = [...events].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    )[events.length - 1]
    return {
      hour: d._id as Date,
      status: last?.status ?? "operational",
      worstStatus,
      eventCount: d.eventCount as number,
      avgLatency: typeof d.avgLatency === "number" ? d.avgLatency : null,
    }
  })
}

/**
 * Daily aggregate — public page'in 90-day uptime bar chart'ı için.
 * Her gün için tek satır: down event'i varsa "down", degraded varsa
 * "degraded", aksi halde "operational". `no-data` günler dönmez —
 * caller fill etmesi gereken günleri kendisi tamamlar.
 */
export async function aggregateDaily(
  checkId: string,
  fromDate: Date,
  toDate: Date,
): Promise<
  Array<{
    day: Date
    worstStatus: ProbeStatus
    eventCount: number
    operationalCount: number
    degradedCount: number
    downCount: number
  }>
> {
  const c = await col()
  const pipeline = [
    {
      $match: {
        checkId,
        timestamp: { $gte: fromDate, $lte: toDate },
      },
    },
    {
      $group: {
        _id: {
          $dateTrunc: { date: "$timestamp", unit: "day" },
        },
        eventCount: { $sum: 1 },
        operationalCount: {
          $sum: { $cond: [{ $eq: ["$status", "operational"] }, 1, 0] },
        },
        degradedCount: {
          $sum: { $cond: [{ $eq: ["$status", "degraded"] }, 1, 0] },
        },
        downCount: {
          $sum: { $cond: [{ $eq: ["$status", "down"] }, 1, 0] },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]
  const docs = await c.aggregate(pipeline).toArray()
  return docs.map((d) => {
    const downCount = d.downCount as number
    const degradedCount = d.degradedCount as number
    const worstStatus: ProbeStatus =
      downCount > 0 ? "down" : degradedCount > 0 ? "degraded" : "operational"
    return {
      day: d._id as Date,
      worstStatus,
      eventCount: d.eventCount as number,
      operationalCount: d.operationalCount as number,
      degradedCount,
      downCount,
    }
  })
}

/**
 * Uptime % hesaplaması — bir time window içinde toplam probe sayısına
 * göre operational olanların oranı. Public page'de "99.97%" gibi
 * göstermek için.
 */
export async function uptimePercentage(
  checkId: string,
  from: Date,
  to: Date,
): Promise<number | null> {
  const c = await col()
  const pipeline = [
    { $match: { checkId, timestamp: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        ok: {
          $sum: { $cond: [{ $eq: ["$status", "operational"] }, 1, 0] },
        },
      },
    },
  ]
  const docs = await c.aggregate(pipeline).toArray()
  const row = docs[0]
  if (!row || row.total === 0) return null
  return (row.ok / row.total) * 100
}

// ─── Mutations ────────────────────────────────────────────────────────────

/**
 * Probe sonucu yaz. Dedup: aynı check'in son probe'u 5dk içinde aynı
 * status ise skip (dedup window). Status değişikliği VEYA window aşımı
 * → yaz.
 */
export async function record(input: {
  checkId: string
  componentId: string
  pageId: string
  status: ProbeStatus
  latencyMs: number | null
  httpStatus: number | null
  error: string | null
  region?: string
  /** Dedup'ı atla (severity escalation gibi). */
  forceWrite?: boolean
}): Promise<{ recorded: boolean; reason?: "dedup" }> {
  const c = await col()
  const now = new Date()

  if (!input.forceWrite) {
    const last = await c
      .find({ checkId: input.checkId })
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray()
    const lastEvent = last[0]
    if (
      lastEvent &&
      lastEvent.status === input.status &&
      now.getTime() - new Date(lastEvent.timestamp).getTime() < DEDUP_WINDOW_MS
    ) {
      return { recorded: false, reason: "dedup" }
    }
  }

  await c.insertOne({
    checkId: input.checkId,
    componentId: input.componentId,
    pageId: input.pageId,
    status: input.status,
    latencyMs: input.latencyMs,
    httpStatus: input.httpStatus,
    error: input.error,
    region: input.region ?? "default",
    timestamp: now,
  })
  return { recorded: true }
}

export async function pruneOlderThan(cutoff: Date): Promise<number> {
  const c = await col()
  const r = await c.deleteMany({ timestamp: { $lt: cutoff } })
  return r.deletedCount ?? 0
}

export async function removeByCheck(checkId: string): Promise<number> {
  const c = await col()
  const r = await c.deleteMany({ checkId })
  return r.deletedCount ?? 0
}

export async function removeByPage(pageId: string): Promise<number> {
  const c = await col()
  const r = await c.deleteMany({ pageId })
  return r.deletedCount ?? 0
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ checkId: 1, timestamp: -1 })
  await c.createIndex({ pageId: 1, timestamp: -1 })
  // TTL — eski probe'lar otomatik silinir, history full DB doldurmaz
  await c.createIndex(
    { timestamp: 1 },
    { expireAfterSeconds: TTL_DAYS * 24 * 60 * 60 },
  )
}
