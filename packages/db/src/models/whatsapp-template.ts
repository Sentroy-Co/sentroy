import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

/**
 * WhatsApp Santral — mesaj şablonu. Company-scoped. Tek dilli `body` +
 * `{{değişken}}`'ler (render engine: @workspace/ui/lib/email-template). Mail'in
 * mail-template-source deseninin WhatsApp muadili. Bkz. [[whatsapp-audience]],
 * [[whatsapp-send-log]].
 */

const COLLECTION = "whatsapp_templates"

export interface WhatsappTemplate {
  id: string
  companyId: string
  name: string
  /** Gövde metni; `{{ad}}` / `{{siparişNo}}` gibi değişkenler render'da doldurulur. */
  body: string
  /** Gövdeden çıkarılan değişken adları (UI + validation için cache'lenir). */
  variables: string[]
  /** Opsiyonel medya başlık URL'i (görsel/döküman) — gönderimde eklenir. */
  mediaUrl: string | null
  category: string | null
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findByCompany(
  companyId: string,
  opts: { limit?: number; skip?: number } = {},
): Promise<WhatsappTemplate[]> {
  const c = await col()
  const docs = await c
    .find({ companyId })
    .sort({ createdAt: -1 })
    .skip(opts.skip ?? 0)
    .limit(Math.min(opts.limit ?? 500, 2000))
    .toArray()
  return docs.map(toId) as WhatsappTemplate[]
}

export async function findById(
  companyId: string,
  id: string,
): Promise<WhatsappTemplate | null> {
  const c = await col()
  try {
    return toId(
      await c.findOne({ companyId, _id: toObjectId(id) }),
    ) as WhatsappTemplate | null
  } catch {
    return null
  }
}

export async function create(data: {
  companyId: string
  name: string
  body: string
  variables: string[]
  mediaUrl?: string | null
  category?: string | null
}): Promise<WhatsappTemplate> {
  const c = await col()
  const now = new Date()
  const doc = {
    companyId: data.companyId,
    name: data.name,
    body: data.body,
    variables: data.variables,
    mediaUrl: data.mediaUrl ?? null,
    category: data.category ?? null,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function updateById(
  companyId: string,
  id: string,
  data: Partial<{
    name: string
    body: string
    variables: string[]
    mediaUrl: string | null
    category: string | null
  }>,
): Promise<WhatsappTemplate | null> {
  const c = await col()
  const updated = await c.findOneAndUpdate(
    { companyId, _id: toObjectId(id) },
    { $set: { ...data, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return toId(updated) as WhatsappTemplate | null
}

export async function deleteById(
  companyId: string,
  id: string,
): Promise<boolean> {
  const c = await col()
  const r = await c.deleteOne({ companyId, _id: toObjectId(id) })
  return r.deletedCount === 1
}

export async function countByCompany(companyId: string): Promise<number> {
  const c = await col()
  return c.countDocuments({ companyId })
}

export async function deleteByCompany(companyId: string): Promise<void> {
  const c = await col()
  await c.deleteMany({ companyId })
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ companyId: 1, createdAt: -1 })
}
