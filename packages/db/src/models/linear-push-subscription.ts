import { getDb } from "../client"
import { toId } from "./_helpers"

/**
 * Linear Lite Web Push aboneliği. Company + user + tarayıcı-başına (endpoint
 * unique). `linearUserId` abonelik anında Linear kullanıcısına eşlenir (varsa)
 * — webhook dispatch'i event'in ilgili Linear user'larına göre hedefler.
 */
const COLLECTION = "linear_push_subscriptions"

export interface LinearPushSubscription {
  id: string
  companyId: string
  userId: string
  linearUserId: string | null
  endpoint: string
  p256dh: string
  auth: string
  createdAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function upsertByEndpoint(data: {
  companyId: string
  userId: string
  linearUserId: string | null
  endpoint: string
  p256dh: string
  auth: string
}): Promise<void> {
  const c = await col()
  await c.updateOne(
    { endpoint: data.endpoint },
    {
      $set: {
        companyId: data.companyId,
        userId: data.userId,
        linearUserId: data.linearUserId,
        p256dh: data.p256dh,
        auth: data.auth,
      },
      $setOnInsert: { endpoint: data.endpoint, createdAt: new Date() },
    },
    { upsert: true },
  )
}

export async function deleteByEndpoint(endpoint: string): Promise<void> {
  const c = await col()
  await c.deleteOne({ endpoint })
}

/** Company içinde, linearUserId'si verilen kümede olan abonelikler. */
export async function findByCompanyAndLinearUsers(
  companyId: string,
  linearUserIds: string[],
): Promise<LinearPushSubscription[]> {
  if (linearUserIds.length === 0) return []
  const c = await col()
  const docs = await c
    .find({ companyId, linearUserId: { $in: linearUserIds } })
    .toArray()
  return docs.map(toId) as LinearPushSubscription[]
}

export async function deleteByCompany(companyId: string): Promise<number> {
  const c = await col()
  const r = await c.deleteMany({ companyId })
  return r.deletedCount
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ endpoint: 1 }, { unique: true })
  await c.createIndex({ companyId: 1, linearUserId: 1 })
}
