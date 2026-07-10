import { getDb } from "../client"
import type { SmtpCredential } from "../types"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "smtp_credentials"

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findByCompany(
  companyId: string,
): Promise<SmtpCredential[]> {
  const c = await col()
  const docs = await c.find({ companyId }).toArray()
  return docs.map(toId)
}

export async function findById(id: string): Promise<SmtpCredential | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return toId(doc)
}

export async function create(
  data: Omit<SmtpCredential, "id" | "createdAt" | "updatedAt">,
): Promise<SmtpCredential> {
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
  data: Partial<SmtpCredential>,
): Promise<SmtpCredential | null> {
  const c = await col()
  const { id: _ignoreId, ...updateData } = data as any
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { ...updateData, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return toId(result)
}

export async function deleteById(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ companyId: 1 })
  await c.createIndex({ username: 1 }, { unique: true })
}
