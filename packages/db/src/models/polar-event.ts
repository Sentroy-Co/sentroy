import { getDb } from "../client"
import type { PolarEvent } from "../types/polar-event"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "polar_events"

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findByEventId(
  polarEventId: string,
): Promise<PolarEvent | null> {
  const c = await col()
  const doc = await c.findOne({ polarEventId })
  return toId(doc)
}

export async function create(
  data: Omit<PolarEvent, "id" | "createdAt">,
): Promise<PolarEvent> {
  const c = await col()
  const now = new Date()
  const result = await c.insertOne({ ...data, createdAt: now })
  return { id: result.insertedId.toString(), ...data, createdAt: now }
}

export async function markProcessed(
  id: string,
  result: { companyId?: string | null; error?: string | null },
): Promise<void> {
  const c = await col()
  await c.updateOne(
    { _id: toObjectId(id) },
    {
      $set: {
        processedAt: new Date(),
        ...(result.companyId !== undefined ? { companyId: result.companyId } : {}),
        error: result.error ?? null,
      },
    },
  )
}

/** Son Polar webhook olayları (admin billing olay günlüğü). */
export async function listRecent(limit = 50): Promise<PolarEvent[]> {
  const c = await col()
  const docs = await c
    .find({})
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 200))
    .toArray()
  return docs.map(toId)
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ polarEventId: 1 }, { unique: true })
  await c.createIndex({ createdAt: -1 })
}
