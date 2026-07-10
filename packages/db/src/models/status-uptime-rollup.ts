import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"
import type { ProbeStatus } from "./status-probe-event"

const COLLECTION = "status_uptime_rollups"

/**
 * Daily pre-aggregated uptime rollup. Status worker her saatte bir
 * çalışıp tüm enabled check'lerin dünkü probe event'lerini bu
 * koleksiyona toplar (idempotent upsert).
 *
 * Probe event'leri 60d TTL'i ile auto-purge; rollup'lar forever
 * saklanır (ucuz data, 1 satır/gün/check). Public 90-day bar chart
 * ve dashboard line chart bu koleksiyonu okur (raw event aggregate
 * yerine çok daha hızlı).
 */

export interface StatusUptimeRollup {
  id: string
  checkId: string
  componentId: string
  pageId: string
  /** UTC midnight (Date — Mongo'da BSON Date). */
  day: Date
  totalProbes: number
  operationalProbes: number
  degradedProbes: number
  downProbes: number
  worstStatus: ProbeStatus
  avgLatencyMs: number | null
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findRange(
  checkId: string,
  fromDay: Date,
  toDay: Date,
): Promise<StatusUptimeRollup[]> {
  const c = await col()
  const docs = await c
    .find({
      checkId,
      day: { $gte: fromDay, $lte: toDay },
    })
    .sort({ day: 1 })
    .toArray()
  return docs.map((d) => toId(d))
}

export async function findByPageRange(
  pageId: string,
  fromDay: Date,
  toDay: Date,
): Promise<StatusUptimeRollup[]> {
  const c = await col()
  const docs = await c
    .find({
      pageId,
      day: { $gte: fromDay, $lte: toDay },
    })
    .sort({ day: 1 })
    .toArray()
  return docs.map((d) => toId(d))
}

/**
 * Idempotent upsert — worker'ın aynı gün için tekrar çağrısı no-op
 * (update aynı değerleri yazar). Race condition durumunda Mongo unique
 * index korur.
 */
export async function upsertDay(input: {
  checkId: string
  componentId: string
  pageId: string
  day: Date
  totalProbes: number
  operationalProbes: number
  degradedProbes: number
  downProbes: number
  worstStatus: ProbeStatus
  avgLatencyMs: number | null
}): Promise<void> {
  const c = await col()
  const now = new Date()
  await c.updateOne(
    { checkId: input.checkId, day: input.day },
    {
      $set: {
        componentId: input.componentId,
        pageId: input.pageId,
        totalProbes: input.totalProbes,
        operationalProbes: input.operationalProbes,
        degradedProbes: input.degradedProbes,
        downProbes: input.downProbes,
        worstStatus: input.worstStatus,
        avgLatencyMs: input.avgLatencyMs,
        updatedAt: now,
      },
      $setOnInsert: {
        checkId: input.checkId,
        day: input.day,
        createdAt: now,
      },
    },
    { upsert: true },
  )
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
  await c.createIndex({ checkId: 1, day: -1 }, { unique: true })
  await c.createIndex({ pageId: 1, day: -1 })
}
