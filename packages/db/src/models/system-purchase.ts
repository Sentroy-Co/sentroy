import { getDb } from "../client"
import { toId } from "./_helpers"
import type { SystemPurchase } from "../types/system-purchase"

const COLLECTION = "system_purchases"

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function create(data: {
  userId: string
  app: string | null
  reference: string | null
  amountUsd: number
  polarOrderId: string
  polarProductId?: string | null
}): Promise<SystemPurchase> {
  const c = await col()
  const doc = {
    userId: data.userId,
    app: data.app ?? null,
    reference: data.reference ?? null,
    amountUsd: data.amountUsd,
    polarOrderId: data.polarOrderId,
    polarProductId: data.polarProductId ?? null,
    createdAt: new Date(),
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

/** Idempotency — bu Polar order için kayıt zaten var mı. */
export async function findByOrderId(
  polarOrderId: string,
): Promise<SystemPurchase | null> {
  const c = await col()
  return toId(await c.findOne({ polarOrderId })) as SystemPurchase | null
}

/** Kullanıcının satın alımları — opsiyonel app/reference filtresiyle, yeniye göre. */
export async function findByUser(
  userId: string,
  filter?: { app?: string; reference?: string },
): Promise<SystemPurchase[]> {
  const c = await col()
  const query: Record<string, unknown> = { userId }
  if (filter?.app) query.app = filter.app
  if (filter?.reference) query.reference = filter.reference
  const docs = await c.find(query).sort({ createdAt: -1 }).toArray()
  return docs.map(toId) as SystemPurchase[]
}

export async function ensureIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ polarOrderId: 1 }, { unique: true })
  await c.createIndex({ userId: 1, app: 1, createdAt: -1 })
  await c.createIndex({ userId: 1, reference: 1 })
}
