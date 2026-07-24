import { ObjectId } from "mongodb"
import { getDb } from "../client"
import type { NoteFolder } from "../types"
import { toId } from "./_helpers"

const COLLECTION = "note_folders"

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

/** Kullanıcının bir şirketteki klasörleri (ada göre). */
export async function listForUser(
  companyId: string,
  userId: string,
): Promise<NoteFolder[]> {
  const c = await col()
  const docs = await c
    .find({ companyId, userId })
    .sort({ name: 1 })
    .toArray()
  return docs.map(toId) as NoteFolder[]
}

export async function findById(id: string): Promise<NoteFolder | null> {
  if (!ObjectId.isValid(id)) return null
  const c = await col()
  const doc = await c.findOne({ _id: new ObjectId(id) })
  return doc ? (toId(doc) as NoteFolder) : null
}

export async function create(data: {
  companyId: string
  userId: string
  name: string
  color?: string
}): Promise<NoteFolder> {
  const c = await col()
  const now = new Date()
  const doc = {
    companyId: data.companyId,
    userId: data.userId,
    name: data.name,
    color: data.color ?? "default",
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

/** Ad ve/veya renk güncelle (ikisi de opsiyonel — verilen alan yazılır). */
export async function update(
  id: string,
  patch: { name?: string; color?: string },
): Promise<NoteFolder | null> {
  if (!ObjectId.isValid(id)) return null
  const c = await col()
  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.name !== undefined) set.name = patch.name
  if (patch.color !== undefined) set.color = patch.color
  const result = await c.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: set },
    { returnDocument: "after" },
  )
  return result ? (toId(result) as NoteFolder) : null
}

export async function remove(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const c = await col()
  const res = await c.deleteOne({ _id: new ObjectId(id) })
  return res.deletedCount > 0
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ companyId: 1, userId: 1 })
}
