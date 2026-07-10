import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"
import { randomBytes, createHash } from "crypto"

const COLLECTION = "env_tokens"

/**
 * Bir env-vault project'ine erişim için token. Format `stk_env_<48hex>`,
 * SHA-256 hash'lı saklanır (plaintext sadece `create` response'unda
 * döner; tekrar görünmez).
 *
 * **Scope**: token bir project'e ve bir environment'a bağlı (prod token
 * staging'i göremez). Permission'lar binary: read-only (default) ya da
 * read-write (admin'in vault'tan kayıt CRUD'unu otomatize eden tool'lar
 * için, ör. CLI publish — şimdilik tasarlanmadı, ileri için yer açık).
 */
export type EnvTokenPermission = "read" | "write"

export interface EnvToken {
  id: string
  projectId: string
  environment: string
  /** Human-readable label (admin UI'da). */
  name: string
  /** SHA-256 hash; plaintext asla saklanmaz. */
  tokenHash: string
  /** Plaintext'in ilk 16 karakteri (`stk_env_xxxxxxxx`) — UI identifier. */
  tokenPrefix: string
  permissions: EnvTokenPermission[]
  /** Opsiyonel sona erme tarihi (default: süresiz). */
  expiresAt: Date | null
  lastUsedAt: Date | null
  createdBy: string
  createdAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

function generateToken(): string {
  return `stk_env_${randomBytes(24).toString("hex")}`
}

export async function findByProject(projectId: string): Promise<EnvToken[]> {
  const c = await col()
  const docs = await c
    .find({ projectId })
    .sort({ createdAt: -1 })
    .toArray()
  return docs.map(toId)
}

/**
 * Plaintext token'dan eşleşen aktif kayıt. Lookup hash üzerinden;
 * bulunursa lastUsedAt güncellenir (best-effort, hata akışı bozmaz).
 */
export async function findByToken(plain: string): Promise<EnvToken | null> {
  const c = await col()
  const doc = await c.findOne({ tokenHash: hashToken(plain) })
  if (!doc) return null
  // Best-effort lastUsedAt update — fail bypass.
  c.updateOne(
    { _id: doc._id },
    { $set: { lastUsedAt: new Date() } },
  ).catch(() => {})
  return toId(doc)
}

export async function create(input: {
  projectId: string
  environment: string
  name: string
  permissions?: EnvTokenPermission[]
  expiresAt?: Date | null
  createdBy: string
}): Promise<{ token: EnvToken; plainToken: string }> {
  const c = await col()
  const plain = generateToken()
  const now = new Date()
  const doc = {
    projectId: input.projectId,
    environment: input.environment,
    name: input.name.trim(),
    tokenHash: hashToken(plain),
    tokenPrefix: plain.slice(0, 16),
    permissions: input.permissions ?? ["read"],
    expiresAt: input.expiresAt ?? null,
    lastUsedAt: null,
    createdBy: input.createdBy,
    createdAt: now,
  }
  const result = await c.insertOne(doc)
  return {
    token: { id: result.insertedId.toString(), ...doc },
    plainToken: plain,
  }
}

export async function remove(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}

export async function removeByProject(projectId: string): Promise<number> {
  const c = await col()
  const result = await c.deleteMany({ projectId })
  return result.deletedCount
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ tokenHash: 1 }, { unique: true })
  await c.createIndex({ projectId: 1 })
}
