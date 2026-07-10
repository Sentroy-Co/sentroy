import { getDb } from "../client"
import type { Bucket } from "../types"
import { toId, toObjectId } from "./_helpers"
import { isSystemManagedBucketSlug } from "../constants"

const COLLECTION = "buckets"

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findByCompany(companyId: string): Promise<Bucket[]> {
  const c = await col()
  const docs = await c
    .find({ companyId })
    .sort({ createdAt: -1 })
    .toArray()
  return docs.map(toId)
}

export async function findUserVisibleByCompany(
  companyId: string,
): Promise<Bucket[]> {
  const buckets = await findByCompany(companyId)
  return buckets.filter((bucket) => !isSystemManagedBucketSlug(bucket.slug))
}

export async function findById(id: string): Promise<Bucket | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return toId(doc)
}

export async function findBySlug(
  companyId: string,
  slug: string,
): Promise<Bucket | null> {
  const c = await col()
  const doc = await c.findOne({ companyId, slug })
  return toId(doc)
}

export async function findUserVisibleBySlug(
  companyId: string,
  slug: string,
): Promise<Bucket | null> {
  if (isSystemManagedBucketSlug(slug)) return null
  return findBySlug(companyId, slug)
}

export async function create(
  data: Omit<Bucket, "id" | "createdAt" | "updatedAt">,
): Promise<Bucket> {
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
  data: Partial<Bucket>,
): Promise<Bucket | null> {
  const c = await col()
  const { id: _ignoreId, ...updateData } = data as any
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { ...updateData, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return toId(result)
}

export async function incrementUsage(
  id: string,
  delta: { storageUsed?: number; fileCount?: number },
): Promise<void> {
  const c = await col()
  const inc: Record<string, number> = {}
  if (delta.storageUsed !== undefined) inc.storageUsed = delta.storageUsed
  if (delta.fileCount !== undefined) inc.fileCount = delta.fileCount
  if (Object.keys(inc).length === 0) return
  await c.updateOne(
    { _id: toObjectId(id) },
    { $inc: inc, $set: { updatedAt: new Date() } },
  )
}

export async function deleteById(id: string): Promise<void> {
  const c = await col()
  await c.deleteOne({ _id: toObjectId(id) })
}

export async function countByCompany(companyId: string): Promise<number> {
  const c = await col()
  return c.countDocuments({ companyId })
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ companyId: 1, slug: 1 }, { unique: true })
  await c.createIndex({ companyId: 1, createdAt: -1 })
}
