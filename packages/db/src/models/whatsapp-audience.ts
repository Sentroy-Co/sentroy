import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

/**
 * WhatsApp Santral — hedef kitle (audience). Company-scoped telefon listesi.
 * Her girdi bir telefon + opsiyonel per-alıcı değişkenler (mail `recipients[]`
 * muadili). Toplu gönderimde hedeflenir. Bkz. [[whatsapp-template]].
 */

const COLLECTION = "whatsapp_audiences"

export interface WhatsappAudienceEntry {
  phone: string
  variables?: Record<string, string>
}

export interface WhatsappAudience {
  id: string
  companyId: string
  name: string
  description: string | null
  entries: WhatsappAudienceEntry[]
  entryCount: number
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

/** Telefonları temizle + tekilleştir; boş variables objelerini düşür. */
function normalizeEntries(
  entries: WhatsappAudienceEntry[],
): WhatsappAudienceEntry[] {
  const seen = new Set<string>()
  const out: WhatsappAudienceEntry[] = []
  for (const e of entries ?? []) {
    const phone = String(e?.phone ?? "").trim()
    if (!phone || seen.has(phone)) continue
    seen.add(phone)
    const hasVars = e.variables && Object.keys(e.variables).length > 0
    out.push(hasVars ? { phone, variables: e.variables } : { phone })
  }
  return out
}

export async function findByCompany(
  companyId: string,
): Promise<WhatsappAudience[]> {
  const c = await col()
  const docs = await c.find({ companyId }).sort({ createdAt: -1 }).toArray()
  return docs.map(toId) as WhatsappAudience[]
}

export async function findById(
  companyId: string,
  id: string,
): Promise<WhatsappAudience | null> {
  const c = await col()
  try {
    return toId(
      await c.findOne({ companyId, _id: toObjectId(id) }),
    ) as WhatsappAudience | null
  } catch {
    return null
  }
}

export async function create(data: {
  companyId: string
  name: string
  description?: string | null
  entries: WhatsappAudienceEntry[]
}): Promise<WhatsappAudience> {
  const c = await col()
  const now = new Date()
  const entries = normalizeEntries(data.entries)
  const doc = {
    companyId: data.companyId,
    name: data.name,
    description: data.description ?? null,
    entries,
    entryCount: entries.length,
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
    description: string | null
    entries: WhatsappAudienceEntry[]
  }>,
): Promise<WhatsappAudience | null> {
  const c = await col()
  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (data.name !== undefined) set.name = data.name
  if (data.description !== undefined) set.description = data.description
  if (data.entries !== undefined) {
    const entries = normalizeEntries(data.entries)
    set.entries = entries
    set.entryCount = entries.length
  }
  const updated = await c.findOneAndUpdate(
    { companyId, _id: toObjectId(id) },
    { $set: set },
    { returnDocument: "after" },
  )
  return toId(updated) as WhatsappAudience | null
}

export async function deleteById(
  companyId: string,
  id: string,
): Promise<boolean> {
  const c = await col()
  const r = await c.deleteOne({ companyId, _id: toObjectId(id) })
  return r.deletedCount === 1
}

export async function deleteByCompany(companyId: string): Promise<void> {
  const c = await col()
  await c.deleteMany({ companyId })
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ companyId: 1, createdAt: -1 })
}
