import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"
import { randomBytes, createHash } from "crypto"

const COLLECTION = "oauth_access_tokens"
const DEFAULT_TTL_MS = 60 * 60 * 1000 // 1 hour

/**
 * OAuth access token (opaque) — `/oauth/token` issue eder, `/oauth/userinfo`
 * Bearer auth ile consume eder. Format `oat_<48hex>`. SHA-256 hash'li
 * saklanır; userinfo lookup hash üzerinden, plaintext asla.
 *
 * id_token (OIDC) bunun yanında HS256 JWT olarak issue edilir — JWT
 * stateless, DB'de tutulmaz. access_token ise stateful (revoke edilebilir).
 */

export interface OAuthAccessToken {
  id: string
  /** SHA-256 of plaintext. */
  tokenHash: string
  /** İlk 8 char (debug). */
  tokenPrefix: string
  clientId: string
  userId: string
  scopes: string[]
  expiresAt: Date
  /** Manuel revoke (logout, kullanıcı consent geri çekti vs.). */
  revokedAt: Date | null
  createdAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

function generateToken(): string {
  return `oat_${randomBytes(24).toString("hex")}`
}

function hash(plain: string): string {
  return createHash("sha256").update(plain).digest("hex")
}

export async function create(input: {
  clientId: string
  userId: string
  scopes: string[]
  ttlMs?: number
}): Promise<{ token: string; record: OAuthAccessToken }> {
  const c = await col()
  const token = generateToken()
  const now = new Date()
  const ttl = input.ttlMs ?? DEFAULT_TTL_MS
  const doc = {
    tokenHash: hash(token),
    tokenPrefix: token.slice(0, 8),
    clientId: input.clientId,
    userId: input.userId,
    scopes: input.scopes,
    expiresAt: new Date(now.getTime() + ttl),
    revokedAt: null,
    createdAt: now,
  }
  const result = await c.insertOne(doc)
  return {
    token,
    record: { id: result.insertedId.toString(), ...doc },
  }
}

export async function findByToken(plain: string): Promise<OAuthAccessToken | null> {
  const c = await col()
  const doc = await c.findOne({ tokenHash: hash(plain) })
  return doc ? toId(doc) : null
}

export async function revoke(id: string): Promise<boolean> {
  const c = await col()
  const r = await c.updateOne(
    { _id: toObjectId(id) },
    { $set: { revokedAt: new Date() } },
  )
  return (r.modifiedCount ?? 0) > 0
}

/** Bir kullanıcı + client çifti için tüm aktif token'ları revoke et. */
export async function revokeForUserClient(
  userId: string,
  clientId: string,
): Promise<number> {
  const c = await col()
  const r = await c.updateMany(
    { userId, clientId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  )
  return r.modifiedCount ?? 0
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ tokenHash: 1 }, { unique: true })
  await c.createIndex({ userId: 1, clientId: 1 })
  // TTL index — expired tokens auto-evict
  await c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 3600 })
}
