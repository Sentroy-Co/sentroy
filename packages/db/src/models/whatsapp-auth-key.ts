import { getDb } from "../client"

/**
 * WhatsApp Santral — Baileys Signal protokol anahtar deposu.
 * `(companyId, sessionId)` ile scope'lanır (çoklu numara). `valueBlob`
 * BufferJSON + AES-256-GCM şifreli. Bkz. [[whatsapp-session]].
 */

const COLLECTION = "whatsapp_auth_keys"

interface AuthKeyDoc {
  companyId: string
  sessionId: string
  category: string
  keyId: string
  valueBlob: string
}

function col() {
  return getDb().then((db) => db.collection<AuthKeyDoc>(COLLECTION))
}

export async function getMany(
  companyId: string,
  sessionId: string,
  category: string,
  ids: string[],
): Promise<Record<string, string>> {
  if (ids.length === 0) return {}
  const c = await col()
  const docs = await c
    .find({ companyId, sessionId, category, keyId: { $in: ids } })
    .toArray()
  const out: Record<string, string> = {}
  for (const d of docs) out[d.keyId] = d.valueBlob
  return out
}

export async function setMany(
  companyId: string,
  sessionId: string,
  entries: { category: string; keyId: string; valueBlob: string | null }[],
): Promise<void> {
  if (entries.length === 0) return
  const c = await col()
  const ops = entries.map((e) =>
    e.valueBlob === null
      ? {
          deleteOne: {
            filter: {
              companyId,
              sessionId,
              category: e.category,
              keyId: e.keyId,
            },
          },
        }
      : {
          updateOne: {
            filter: {
              companyId,
              sessionId,
              category: e.category,
              keyId: e.keyId,
            },
            update: { $set: { valueBlob: e.valueBlob } },
            upsert: true,
          },
        },
  )
  await c.bulkWrite(ops, { ordered: false })
}

export async function clearBySession(
  companyId: string,
  sessionId: string,
): Promise<void> {
  const c = await col()
  await c.deleteMany({ companyId, sessionId })
}

export async function clearByCompany(companyId: string): Promise<void> {
  const c = await col()
  await c.deleteMany({ companyId })
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex(
    { companyId: 1, sessionId: 1, category: 1, keyId: 1 },
    { unique: true },
  )
}
