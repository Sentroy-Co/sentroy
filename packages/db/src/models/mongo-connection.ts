import { ObjectId } from "mongodb"
import { getDb } from "../client"
import { toId } from "./_helpers"

/**
 * Company-scoped MongoDB bağlantı kaydı (MongoDB Backuper app'i).
 *
 * ⚠ URI parola içerir → yalnız `uriEncrypted` (AES-256-GCM, env-vault-crypto ile
 * şifreli) saklanır; UI'a asla plaintext dönmez. Görüntüleme için `uriMasked`
 * (sanitizeUri, kredensiyal maskeli) kullanılır. Şifreleme/maskeleme API
 * katmanında yapılır (bu paket crypto-agnostic — @workspace/console'a bağımlı olmaz).
 */

const COLLECTION = "mongo_connections"

export interface MongoConnection {
  id: string
  companyId: string
  label: string
  /** AES-256-GCM cipher blob (encryptValue). ASLA client'a dönme. */
  uriEncrypted: string
  /** Kredensiyal maskeli URI — UI/audit için güvenli. */
  uriMasked: string
  /** Boşsa yedek sırasında URI'den türetilir. */
  defaultDbName: string | null
  createdByUserId: string
  createdAt: Date
  updatedAt: Date
  lastBackupAt: Date | null
}

/** Client-safe projeksiyon — uriEncrypted asla dışarı sızmaz. */
export type MongoConnectionPublic = Omit<MongoConnection, "uriEncrypted">

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

/** uriEncrypted'i düşürüp güvenli kaydı döndürür. */
export function toPublic(conn: MongoConnection): MongoConnectionPublic {
  const { uriEncrypted: _omit, ...rest } = conn
  void _omit
  return rest
}

export async function create(data: {
  companyId: string
  label: string
  uriEncrypted: string
  uriMasked: string
  defaultDbName?: string | null
  createdByUserId: string
}): Promise<MongoConnection> {
  const c = await col()
  const now = new Date()
  const doc = {
    companyId: data.companyId,
    label: data.label,
    uriEncrypted: data.uriEncrypted,
    uriMasked: data.uriMasked,
    defaultDbName: data.defaultDbName ?? null,
    createdByUserId: data.createdByUserId,
    createdAt: now,
    updatedAt: now,
    lastBackupAt: null as Date | null,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function findById(id: string): Promise<MongoConnection | null> {
  if (!ObjectId.isValid(id)) return null
  const c = await col()
  const doc = await c.findOne({ _id: new ObjectId(id) })
  return toId(doc) as MongoConnection | null
}

/** Company scope zorunlu — cross-tenant erişimi engeller. */
export async function findByIdForCompany(
  id: string,
  companyId: string,
): Promise<MongoConnection | null> {
  if (!ObjectId.isValid(id)) return null
  const c = await col()
  const doc = await c.findOne({ _id: new ObjectId(id), companyId })
  return toId(doc) as MongoConnection | null
}

export async function listByCompany(companyId: string): Promise<MongoConnection[]> {
  const c = await col()
  const docs = await c.find({ companyId }).sort({ createdAt: -1 }).toArray()
  return docs.map((d) => toId(d) as MongoConnection)
}

export async function update(
  id: string,
  companyId: string,
  patch: Partial<{
    label: string
    uriEncrypted: string
    uriMasked: string
    defaultDbName: string | null
  }>,
): Promise<MongoConnection | null> {
  if (!ObjectId.isValid(id)) return null
  const c = await col()
  const res = await c.findOneAndUpdate(
    { _id: new ObjectId(id), companyId },
    { $set: { ...patch, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return toId(res) as MongoConnection | null
}

export async function touchLastBackup(id: string): Promise<void> {
  if (!ObjectId.isValid(id)) return
  const c = await col()
  await c.updateOne({ _id: new ObjectId(id) }, { $set: { lastBackupAt: new Date() } })
}

export async function remove(id: string, companyId: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const c = await col()
  const res = await c.deleteOne({ _id: new ObjectId(id), companyId })
  return res.deletedCount > 0
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ companyId: 1, createdAt: -1 })
}
