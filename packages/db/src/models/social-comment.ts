import { ObjectId } from "mongodb"
import { getDb } from "../client"
import type { SocialComment } from "../types"
import { toId } from "./_helpers"

const COLLECTION = "social_comments"

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

interface CreateInput {
  postId: string
  companyId: string
  authorUserId: string
  text: string
}

export async function create(data: CreateInput): Promise<SocialComment> {
  const c = await col()
  const now = new Date()
  const doc = {
    postId: data.postId,
    companyId: data.companyId,
    authorUserId: data.authorUserId,
    text: data.text,
    reactionCount: 0,
    deletedAt: null as Date | null,
    createdAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function findById(id: string): Promise<SocialComment | null> {
  if (!ObjectId.isValid(id)) return null
  const c = await col()
  const doc = await c.findOne({ _id: new ObjectId(id) })
  return doc ? (toId(doc) as SocialComment) : null
}

export async function findByPost(
  postId: string,
  opts?: { limit?: number; before?: Date },
): Promise<SocialComment[]> {
  const c = await col()
  const filter: Record<string, unknown> = { postId, deletedAt: null }
  if (opts?.before) filter.createdAt = { $lt: opts.before }
  const docs = await c
    .find(filter)
    .sort({ createdAt: 1 })
    .limit(opts?.limit ?? 100)
    .toArray()
  return docs.map(toId) as SocialComment[]
}

export async function softDelete(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const c = await col()
  const res = await c.updateOne(
    { _id: new ObjectId(id), deletedAt: null },
    { $set: { deletedAt: new Date() } },
  )
  return res.modifiedCount > 0
}

export async function incrementReactionCount(
  id: string,
  delta: 1 | -1,
): Promise<void> {
  if (!ObjectId.isValid(id)) return
  const c = await col()
  await c.updateOne(
    { _id: new ObjectId(id) },
    { $inc: { reactionCount: delta } },
  )
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ postId: 1, createdAt: 1, deletedAt: 1 })
  await c.createIndex({ companyId: 1, createdAt: -1 })
}
