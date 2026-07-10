import { getDb } from "../client"

/**
 * Kullanıcının Linear Lite "Inbox"'ı en son ne zaman gördüğü — company + user
 * başına tek kayıt. Unread rozeti (OS section tab) için: seenAt'ten sonra
 * güncellenen inbox issue'ları "okunmamış" sayılır. Server-side olduğu için
 * cihazlar arası tutarlı (client localStorage seenInboxStates ise per-cihaz
 * satır-vurgusu için ayrı kalır).
 */
const COLLECTION = "linear_inbox_seen"

export interface LinearInboxSeen {
  companyId: string
  userId: string
  seenAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

/** Inbox görüldü → seenAt = now (upsert). */
export async function markSeen(companyId: string, userId: string): Promise<void> {
  const c = await col()
  await c.updateOne(
    { companyId, userId },
    { $set: { seenAt: new Date() } },
    { upsert: true },
  )
}

/** Son görülme zamanı (yoksa null → her şey okunmamış). */
export async function getSeenAt(
  companyId: string,
  userId: string,
): Promise<Date | null> {
  const c = await col()
  const doc = await c.findOne({ companyId, userId })
  return doc?.seenAt ? new Date(doc.seenAt) : null
}

export async function deleteByCompany(companyId: string): Promise<number> {
  const c = await col()
  const r = await c.deleteMany({ companyId })
  return r.deletedCount
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ companyId: 1, userId: 1 }, { unique: true })
}
