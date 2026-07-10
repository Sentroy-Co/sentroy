import { getDb } from "../client"
import type { OsPreferences, OsDesktopWidgetInstance } from "../types"
import { toId } from "./_helpers"

const COLLECTION = "os_preferences"

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

/** İstemcinin gönderebileceği partial patch — yalnız verilen alanlar $set edilir. */
export interface OsPreferencesPatch {
  wallpaper?: string
  dockOrder?: string[]
  dockPinned?: string[]
  dockHidden?: string[]
  widgets?: OsDesktopWidgetInstance[]
}

/** Kullanıcının bir şirketteki OS tercih dokümanı (yoksa null). */
export async function getForUser(
  companyId: string,
  userId: string,
): Promise<OsPreferences | null> {
  const c = await col()
  const doc = await c.findOne({ companyId, userId })
  return doc ? (toId(doc) as OsPreferences) : null
}

/**
 * Partial upsert — (companyId, userId) tekiline. Yalnız patch'te AÇIKÇA verilen
 * alanlar $set edilir (undefined alanlar dokunulmaz). Filtre üçlüyü/ikiliyi
 * tekilleştirdiği için idempotent; unique index defansif (bkz. createIndexes).
 */
export async function upsertForUser(
  companyId: string,
  userId: string,
  patch: OsPreferencesPatch,
): Promise<OsPreferences | null> {
  const c = await col()
  const $set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.wallpaper !== undefined) $set.wallpaper = patch.wallpaper
  if (patch.dockOrder !== undefined) $set.dockOrder = patch.dockOrder
  if (patch.dockPinned !== undefined) $set.dockPinned = patch.dockPinned
  if (patch.dockHidden !== undefined) $set.dockHidden = patch.dockHidden
  if (patch.widgets !== undefined) $set.widgets = patch.widgets

  const result = await c.findOneAndUpdate(
    { companyId, userId },
    { $set, $setOnInsert: { companyId, userId } },
    { upsert: true, returnDocument: "after" },
  )
  return result ? (toId(result) as OsPreferences) : null
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ companyId: 1, userId: 1 }, { unique: true })
}
