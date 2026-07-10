import { getDb } from "../client"
import type { CompanyMember, Permission } from "../types"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "company_members"

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findByCompanyAndUser(
  companyId: string,
  userId: string,
): Promise<CompanyMember | null> {
  const c = await col()
  const doc = await c.findOne({ companyId, userId })
  return toId(doc)
}

export async function findByCompany(
  companyId: string,
): Promise<CompanyMember[]> {
  const c = await col()
  const docs = await c.find({ companyId }).toArray()
  return docs.map(toId)
}

export async function findByUser(userId: string): Promise<CompanyMember[]> {
  const c = await col()
  const docs = await c.find({ userId }).toArray()
  return docs.map(toId)
}

export async function create(
  data: Omit<CompanyMember, "id" | "joinedAt" | "updatedAt">,
): Promise<CompanyMember> {
  const c = await col()
  const now = new Date()
  const result = await c.insertOne({
    ...data,
    joinedAt: now,
    updatedAt: now,
  })
  return {
    id: result.insertedId.toString(),
    ...data,
    joinedAt: now,
    updatedAt: now,
  }
}

export async function updatePermissions(
  id: string,
  permissions: Permission[],
): Promise<CompanyMember | null> {
  const c = await col()
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { permissions, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return toId(result)
}

export async function updateById(
  id: string,
  data: Partial<Pick<CompanyMember, "role" | "permissions" | "status">>,
): Promise<CompanyMember | null> {
  const c = await col()
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { ...data, updatedAt: new Date() } },
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
  await c.createIndex({ companyId: 1, userId: 1 }, { unique: true })
  await c.createIndex({ userId: 1 })
}
