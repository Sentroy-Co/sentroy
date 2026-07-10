import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "app_reviews"

/**
 * Sentroy App Store — yıldız + yorum. Yalnız aktif `AppInstall` olan kullanıcı
 * yazabilir (server-side enforce edilir); (appId,userId) unique → tek yorum,
 * düzenlenebilir, çoğaltılamaz. Aggregate (`ratingAvg`/`ratingCount`)
 * `SentroyApp`'te denormalize; write'ta `computeAggregate` ile yeniden hesaplanır.
 */

export interface AppReview {
  id: string
  appId: string
  userId: string
  rating: number // 1-5
  body: string | null
  /** Moderasyon — suistimal/askıya alınmış kullanıcı yorumu gizlenir. */
  hidden: boolean
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findByUserAndApp(appId: string, userId: string): Promise<AppReview | null> {
  const c = await col()
  const doc = await c.findOne({ appId, userId })
  return doc ? toId(doc) : null
}

export async function listForApp(appId: string, opts?: { includeHidden?: boolean }): Promise<AppReview[]> {
  const c = await col()
  const filter: Record<string, unknown> = { appId }
  if (!opts?.includeHidden) filter.hidden = { $ne: true }
  const docs = await c.find(filter).sort({ createdAt: -1 }).toArray()
  return docs.map(toId)
}

/** Tek-yorum upsert — (appId,userId) unique sayesinde idempotent. */
export async function upsert(input: { appId: string; userId: string; rating: number; body: string | null }): Promise<AppReview> {
  const c = await col()
  const now = new Date()
  const result = await c.findOneAndUpdate(
    { appId: input.appId, userId: input.userId },
    {
      $set: { rating: input.rating, body: input.body, updatedAt: now },
      $setOnInsert: { appId: input.appId, userId: input.userId, hidden: false, createdAt: now },
    },
    { upsert: true, returnDocument: "after" },
  )
  return toId(result!)
}

export async function setHidden(id: string, hidden: boolean): Promise<void> {
  const c = await col()
  await c.updateOne({ _id: toObjectId(id) }, { $set: { hidden, updatedAt: new Date() } })
}

export async function remove(appId: string, userId: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ appId, userId })
  return result.deletedCount === 1
}

/** Görünür yorumlardan aggregate (avg yuvarlanmış 0.1, count). */
export async function computeAggregate(appId: string): Promise<{ ratingAvg: number; ratingCount: number }> {
  const c = await col()
  const agg = await c
    .aggregate([
      { $match: { appId, hidden: { $ne: true } } },
      { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ])
    .toArray()
  const row = agg[0] as { avg?: number; count?: number } | undefined
  if (!row || !row.count) return { ratingAvg: 0, ratingCount: 0 }
  return { ratingAvg: Math.round((row.avg ?? 0) * 10) / 10, ratingCount: row.count }
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ appId: 1, userId: 1 }, { unique: true })
  await c.createIndex({ appId: 1, createdAt: -1 })
}
