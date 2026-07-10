import { getDb } from "../client"
import type { Coupon } from "../types"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "coupons"

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findByCode(code: string): Promise<Coupon | null> {
  const c = await col()
  const doc = await c.findOne({ code })
  return toId(doc)
}

export async function findActive(): Promise<Coupon[]> {
  const c = await col()
  const docs = await c
    .find({ isActive: true, validUntil: { $gt: new Date() } })
    .toArray()
  return docs.map(toId)
}

export async function create(
  data: Omit<Coupon, "id" | "usedCount" | "createdAt" | "updatedAt">,
): Promise<Coupon> {
  const c = await col()
  const now = new Date()
  const result = await c.insertOne({
    ...data,
    usedCount: 0,
    createdAt: now,
    updatedAt: now,
  })
  return {
    id: result.insertedId.toString(),
    ...data,
    usedCount: 0,
    createdAt: now,
    updatedAt: now,
  }
}

export async function incrementUsage(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.updateOne(
    { _id: toObjectId(id) },
    {
      $inc: { usedCount: 1 },
      $set: { updatedAt: new Date() },
    },
  )
  return result.modifiedCount === 1
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ code: 1 }, { unique: true })
}
