import { getDb } from "../client"
import type { Contact, ContactStatus } from "../types"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "contacts"

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findByCompany(
  companyId: string,
  opts?: {
    status?: ContactStatus
    tags?: string[]
    limit?: number
    skip?: number
  },
): Promise<Contact[]> {
  const c = await col()
  const filter: Record<string, unknown> = { companyId }
  if (opts?.status) filter.status = opts.status
  if (opts?.tags?.length) filter.tags = { $all: opts.tags }

  let cursor = c.find(filter)
  if (opts?.skip) cursor = cursor.skip(opts.skip)
  if (opts?.limit) cursor = cursor.limit(opts.limit)

  const docs = await cursor.toArray()
  return docs.map(toId)
}

export async function findByEmail(
  companyId: string,
  email: string,
): Promise<Contact | null> {
  const c = await col()
  const doc = await c.findOne({ companyId, email })
  return toId(doc)
}

/** Tek kontak — companyId ownership doğrulaması için (IDOR guard). */
export async function findById(id: string): Promise<Contact | null> {
  const c = await col()
  try {
    const doc = await c.findOne({ _id: toObjectId(id) })
    return toId(doc)
  } catch {
    return null
  }
}

export async function create(
  data: Omit<Contact, "id" | "createdAt" | "updatedAt">,
): Promise<Contact> {
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

export async function upsertByEmail(
  companyId: string,
  email: string,
  data: Partial<Contact>,
): Promise<Contact> {
  const c = await col()
  const now = new Date()
  const { id: _ignoreId, ...updateData } = data as any
  const result = await c.findOneAndUpdate(
    { companyId, email },
    {
      $set: { ...updateData, updatedAt: now },
      $setOnInsert: { companyId, email, createdAt: now },
    },
    { upsert: true, returnDocument: "after" },
  )
  return toId(result)
}

export async function updateById(
  id: string,
  data: Partial<Contact>,
): Promise<Contact | null> {
  const c = await col()
  const { id: _ignoreId, ...updateData } = data as any
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { ...updateData, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return toId(result)
}

export async function searchByEmail(
  companyId: string,
  query: string,
  limit = 10,
): Promise<Contact[]> {
  const c = await col()
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const docs = await c
    .find({
      companyId,
      email: { $regex: escaped, $options: "i" },
    })
    .limit(limit)
    .toArray()
  return docs.map(toId)
}

export async function countByCompany(companyId: string): Promise<number> {
  const c = await col()
  return c.countDocuments({ companyId })
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ companyId: 1, email: 1 }, { unique: true })
  await c.createIndex({ tags: 1 })
}
