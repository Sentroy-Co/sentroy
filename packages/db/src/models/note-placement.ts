import { getDb } from "../client"
import type { NoteWidgetPlacement } from "../types"
import { toId } from "./_helpers"

const COLLECTION = "note_widget_placements"

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

/** Kullanıcının bir şirketteki masaüstü not widget'ı yerleşimleri. */
export async function listForUser(
  companyId: string,
  userId: string,
): Promise<NoteWidgetPlacement[]> {
  const c = await col()
  const docs = await c.find({ companyId, userId }).toArray()
  return docs.map(toId) as NoteWidgetPlacement[]
}

/**
 * Pin/taşıma — (userId, companyId, noteId) üçlüsüne upsert. Filtre üçlüyü
 * tekilleştirdiği için unique index'e ihtiyaç duymaz (idempotent).
 */
export async function upsert(
  userId: string,
  companyId: string,
  noteId: string,
  geo: { x: number; y: number; w: number; h: number },
): Promise<NoteWidgetPlacement | null> {
  const c = await col()
  const result = await c.findOneAndUpdate(
    { userId, companyId, noteId },
    {
      $set: {
        x: geo.x,
        y: geo.y,
        w: geo.w,
        h: geo.h,
        updatedAt: new Date(),
      },
      $setOnInsert: { userId, companyId, noteId },
    },
    { upsert: true, returnDocument: "after" },
  )
  return result ? (toId(result) as NoteWidgetPlacement) : null
}

/** Unpin — bir notun bu kullanıcı için yerleşimini kaldırır. */
export async function remove(
  userId: string,
  companyId: string,
  noteId: string,
): Promise<boolean> {
  const c = await col()
  const res = await c.deleteOne({ userId, companyId, noteId })
  return res.deletedCount > 0
}

/** Not silindiğinde tüm kullanıcılardaki placement'larını temizle. */
export async function removeAllForNote(noteId: string): Promise<void> {
  const c = await col()
  await c.deleteMany({ noteId })
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ userId: 1, companyId: 1 })
  await c.createIndex(
    { userId: 1, companyId: 1, noteId: 1 },
    { unique: true },
  )
  await c.createIndex({ noteId: 1 })
}
