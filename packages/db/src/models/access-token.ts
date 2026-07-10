import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"
import { randomBytes, createHash } from "crypto"

const COLLECTION = "access_tokens"

export interface AccessToken {
  id: string
  companyId: string
  name: string
  /** SHA-256 hash of the token — plaintext is never stored */
  tokenHash: string
  /** First 8 chars of the token for identification */
  tokenPrefix: string
  createdById: string
  lastUsedAt: Date | null
  expiresAt: Date | null
  createdAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** Generate a secure random token: `stk_<48 hex chars>` */
function generateToken(): string {
  return `stk_${randomBytes(24).toString("hex")}`
}

export async function create(data: {
  companyId: string
  name: string
  createdById: string
  expiresAt?: Date | null
}): Promise<{ token: AccessToken; plainToken: string }> {
  const c = await col()
  const plainToken = generateToken()
  const now = new Date()

  const doc = {
    companyId: data.companyId,
    name: data.name,
    tokenHash: hashToken(plainToken),
    tokenPrefix: plainToken.slice(0, 12),
    createdById: data.createdById,
    lastUsedAt: null,
    expiresAt: data.expiresAt ?? null,
    createdAt: now,
  }

  const result = await c.insertOne(doc)
  return {
    token: { id: result.insertedId.toString(), ...doc },
    plainToken,
  }
}

export async function findByCompany(companyId: string): Promise<AccessToken[]> {
  const c = await col()
  const docs = await c
    .find({ companyId })
    .sort({ createdAt: -1 })
    .toArray()
  return docs.map(toId)
}

export async function findByToken(plainToken: string): Promise<AccessToken | null> {
  const c = await col()
  const hash = hashToken(plainToken)
  const doc = await c.findOne({ tokenHash: hash })
  if (!doc) return null

  // Expired check
  if (doc.expiresAt && new Date(doc.expiresAt) < new Date()) return null

  // Update lastUsedAt (fire-and-forget)
  c.updateOne({ _id: doc._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {})

  return toId(doc)
}

export async function deleteById(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}

export async function deleteByCompany(companyId: string): Promise<number> {
  const c = await col()
  const result = await c.deleteMany({ companyId })
  return result.deletedCount
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ tokenHash: 1 }, { unique: true })
  await c.createIndex({ companyId: 1 })
  await c.createIndex({ tokenPrefix: 1 })
}
