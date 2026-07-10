import { ObjectId } from "mongodb"
import { getDb } from "../client"
import type { Note, NoteColor, NoteVisibility } from "../types"
import { toId } from "./_helpers"
import { buildVisibilityFilter } from "./social-post"

const COLLECTION = "notes"

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

interface CreateInput {
  companyId: string
  authorUserId: string
  title: string
  text: string
  bodyHtml?: string | null
  mentions?: string[]
  visibility?: NoteVisibility
  color?: NoteColor
  folderId?: string | null
}

export async function create(data: CreateInput): Promise<Note> {
  const c = await col()
  const now = new Date()
  const doc = {
    companyId: data.companyId,
    authorUserId: data.authorUserId,
    title: data.title,
    text: data.text,
    bodyHtml: data.bodyHtml ?? null,
    mentions: data.mentions ?? [],
    visibility: data.visibility ?? ("author" as NoteVisibility),
    color: data.color ?? ("default" as NoteColor),
    folderId: data.folderId ?? null,
    deletedAt: null as Date | null,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function findById(id: string): Promise<Note | null> {
  if (!ObjectId.isValid(id)) return null
  const c = await col()
  const doc = await c.findOne({ _id: new ObjectId(id) })
  return doc ? (toId(doc) as Note) : null
}

/**
 * Aynı id kümesini tek sorguda çeker — masaüstü widget katmanı pinli notları
 * placement listesinden toplu hydrate eder (N+1 önlenir). Silinmiş/visibility
 * dışı notlar filtrelenir.
 */
export async function findByIds(
  ids: string[],
  viewer: { userId: string; isAdmin: boolean },
): Promise<Note[]> {
  const valid = ids.filter((id) => ObjectId.isValid(id))
  if (valid.length === 0) return []
  const c = await col()
  const docs = await c
    .find({
      _id: { $in: valid.map((id) => new ObjectId(id)) },
      deletedAt: null,
      ...buildVisibilityFilter(viewer.userId, viewer.isAdmin),
    })
    .toArray()
  return docs.map(toId) as Note[]
}

/**
 * Şirket içindeki görünür notlar (Notlar uygulaması listesi). Kendi notlarını
 * (her gizlilikte) + `members`/`public` + (admin ise) `admins` görür — sosyal
 * post ile aynı filtre. Yeniden eskiye, cursor (`before`) sayfalama.
 */
export async function findByCompany(
  companyId: string,
  viewer: { userId: string; isAdmin: boolean },
  opts?: { limit?: number; before?: Date; folderId?: string; authorUserId?: string },
): Promise<Note[]> {
  const c = await col()
  const filter: Record<string, unknown> = {
    companyId,
    deletedAt: null,
    ...buildVisibilityFilter(viewer.userId, viewer.isAdmin),
  }
  // Klasör filtresi — yalnız caller'ın kendi notları klasörlenir (per-user).
  if (opts?.folderId) filter.folderId = opts.folderId
  if (opts?.authorUserId) filter.authorUserId = opts.authorUserId
  if (opts?.before) filter.updatedAt = { $lt: opts.before }
  const docs = await c
    .find(filter)
    .sort({ updatedAt: -1 })
    .limit(opts?.limit ?? 100)
    .toArray()
  return docs.map(toId) as Note[]
}

export async function updateById(
  id: string,
  data: Partial<Pick<Note, "title" | "text" | "bodyHtml" | "mentions" | "visibility" | "color" | "folderId">>,
): Promise<Note | null> {
  if (!ObjectId.isValid(id)) return null
  const c = await col()
  const result = await c.findOneAndUpdate(
    { _id: new ObjectId(id), deletedAt: null },
    { $set: { ...data, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return result ? (toId(result) as Note) : null
}

export async function softDelete(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const c = await col()
  const res = await c.updateOne(
    { _id: new ObjectId(id), deletedAt: null },
    { $set: { deletedAt: new Date(), updatedAt: new Date() } },
  )
  return res.modifiedCount > 0
}

/** Klasör silinince o kullanıcının o klasördeki notlarını kategorisiz (null) yap. */
export async function clearFolder(
  folderId: string,
  authorUserId: string,
): Promise<void> {
  const c = await col()
  await c.updateMany(
    { folderId, authorUserId },
    { $set: { folderId: null, updatedAt: new Date() } },
  )
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ companyId: 1, updatedAt: -1, deletedAt: 1 })
  await c.createIndex({ authorUserId: 1, updatedAt: -1, deletedAt: 1 })
  await c.createIndex({ authorUserId: 1, folderId: 1, updatedAt: -1 })
}
