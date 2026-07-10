import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "status_components"

/**
 * Status Component — bir status page'in altındaki bileşen (örn. "API",
 * "Database", "Web App"). Her component'in altında `status_checks` var
 * (gerçek probe target'ları). Component group'lanabilir; component status'u
 * altındaki check'lerin worst severity'sinden derive edilir.
 *
 * Display order'ı `position` field'ı ile (drag-drop UI için).
 */

export interface StatusComponent {
  id: string
  pageId: string
  /** Display name (örn. "API Server"). */
  name: string
  /** Opsiyonel açıklama (public page'de tooltip). */
  description: string | null
  /** Display order — küçük sayı üstte. */
  position: number
  /** Public page'de göster mi (private check için false). */
  visible: boolean
  /** Component group key (opsiyonel). Aynı `groupKey`'li component'ler
   *  public page'de tek başlık altında gruplanır. Null = ungrouped. */
  groupKey: string | null
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

// ─── Queries ──────────────────────────────────────────────────────────────

export async function findById(id: string): Promise<StatusComponent | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return doc ? toId(doc) : null
}

export async function findByPage(
  pageId: string,
  opts: { onlyVisible?: boolean } = {},
): Promise<StatusComponent[]> {
  const c = await col()
  const filter: Record<string, unknown> = { pageId }
  if (opts.onlyVisible) filter.visible = true
  const docs = await c.find(filter).sort({ position: 1, createdAt: 1 }).toArray()
  return docs.map((d) => toId(d))
}

export async function countByPage(pageId: string): Promise<number> {
  const c = await col()
  return c.countDocuments({ pageId })
}

// ─── Mutations ────────────────────────────────────────────────────────────

export async function create(input: {
  pageId: string
  name: string
  description?: string | null
  groupKey?: string | null
  visible?: boolean
}): Promise<StatusComponent> {
  const c = await col()
  // Sondaki position'u bul (yeni component en alta).
  const last = await c
    .find({ pageId: input.pageId })
    .sort({ position: -1 })
    .limit(1)
    .toArray()
  const nextPos = last[0]?.position != null ? last[0].position + 1 : 0

  const now = new Date()
  const doc = {
    pageId: input.pageId,
    name: input.name.trim(),
    description: input.description ?? null,
    position: nextPos,
    visible: input.visible ?? true,
    groupKey: input.groupKey ?? null,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function update(
  id: string,
  patch: Partial<
    Pick<StatusComponent, "name" | "description" | "position" | "visible" | "groupKey">
  >,
): Promise<StatusComponent | null> {
  const c = await col()
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { ...patch, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return result ? toId(result) : null
}

/**
 * Bulk reorder — `[{id, position}, ...]` array'i alır, atomic update.
 * Drag-drop sonrası tüm component'lerin position'unu tek seferde günceller.
 */
export async function reorder(
  pageId: string,
  positions: Array<{ id: string; position: number }>,
): Promise<void> {
  const c = await col()
  const ops = positions.map((p) => ({
    updateOne: {
      filter: { _id: toObjectId(p.id), pageId },
      update: { $set: { position: p.position, updatedAt: new Date() } },
    },
  }))
  if (ops.length > 0) await c.bulkWrite(ops)
}

export async function remove(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}

export async function removeByPage(pageId: string): Promise<number> {
  const c = await col()
  const r = await c.deleteMany({ pageId })
  return r.deletedCount ?? 0
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ pageId: 1, position: 1 })
  await c.createIndex({ pageId: 1, groupKey: 1 })
}
