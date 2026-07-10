import { getDb } from "../client"
import type { Plan } from "../types"
import { normalizeLocalized } from "../types/localized"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "plans"

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

/**
 * DB doc'unu Plan'a çevir + geriye uyumluluk normalizasyonu.
 * `features` eskiden `string[]` idi; her item `normalizeLocalized` ile
 * `{ tr, en }` shape'ine sarılır → zero-migration. Object zaten ise korunur.
 */
function normalizePlan(doc: unknown): Plan | null {
  const plan = toId(doc)
  if (!plan) return null
  plan.features = Array.isArray(plan.features)
    ? plan.features.map((f: unknown) => normalizeLocalized(f))
    : []
  return plan as Plan
}

export async function findById(id: string): Promise<Plan | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return normalizePlan(doc)
}

export async function findDefault(): Promise<Plan | null> {
  const c = await col()
  const doc = await c.findOne({ isDefault: true })
  return normalizePlan(doc)
}

export async function findActive(): Promise<Plan[]> {
  const c = await col()
  const docs = await c.find({ isActive: true }).toArray()
  return docs.map(normalizePlan).filter((p): p is Plan => p !== null)
}

export async function create(
  data: Omit<Plan, "id" | "createdAt" | "updatedAt">,
): Promise<Plan> {
  const c = await col()
  const now = new Date()
  const result = await c.insertOne({
    ...data,
    createdAt: now,
    updatedAt: now,
  })
  return {
    id: result.insertedId.toString(),
    ...data,
    createdAt: now,
    updatedAt: now,
  }
}

export async function updateById(
  id: string,
  data: Partial<Plan>,
): Promise<Plan | null> {
  const c = await col()
  const { id: _ignoreId, ...updateData } = data as any
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { ...updateData, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return normalizePlan(result)
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ isDefault: 1 })
  await c.createIndex({ isActive: 1 })
}
