import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"
import { randomBytes, createHash } from "crypto"

const COLLECTION = "auth_project_sessions"
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

/**
 * Auth-as-a-Service end-user refresh token + session storage.
 *
 * `oauth-refresh-token` pattern'inin per-project versiyonu: RFC 9700 §4.13
 * family-based rotation + reuse detection (revokeFamily). Aynı kullanıcı
 * birden çok cihazda ayrı family'lere sahip olabilir — birinin reuse'u
 * diğerlerini etkilemez.
 *
 * **Access token saklama yok**: access token (JWT) verify edilirken
 * stateless çalışır (sign + verify oauth-jwt pattern'iyle, per-project key).
 * Sadece refresh token persist edilir.
 */

export interface AuthProjectSession {
  id: string
  authProjectId: string
  userId: string
  /** SHA-256 of plain refresh token (`apt_<48hex>`). */
  refreshTokenHash: string
  /** İlk 8 char (UI/debug). */
  refreshTokenPrefix: string
  /** Rotation chain ID — bir family'deki tüm token'lar bir mantıksal session. */
  familyId: string
  /** Rotate edildi → consumedAt set. Reuse signal. */
  consumedAt: Date | null
  /** Manuel revoke veya family-revoke; null = aktif. */
  revokedAt: Date | null
  expiresAt: Date
  userAgent: string | null
  ip: string | null
  createdAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

function generateToken(): string {
  // `apt_` = "auth project token" — refresh token format.
  return `apt_${randomBytes(24).toString("hex")}`
}

function generateFamilyId(): string {
  return `fam_${randomBytes(12).toString("hex")}`
}

function hash(plain: string): string {
  return createHash("sha256").update(plain).digest("hex")
}

export async function create(input: {
  authProjectId: string
  userId: string
  familyId?: string
  ttlMs?: number
  userAgent?: string | null
  ip?: string | null
}): Promise<{ token: string; record: AuthProjectSession }> {
  const c = await col()
  const token = generateToken()
  const now = new Date()
  const ttl = input.ttlMs ?? DEFAULT_TTL_MS
  const doc = {
    authProjectId: input.authProjectId,
    userId: input.userId,
    refreshTokenHash: hash(token),
    refreshTokenPrefix: token.slice(0, 8),
    familyId: input.familyId ?? generateFamilyId(),
    consumedAt: null as Date | null,
    revokedAt: null as Date | null,
    expiresAt: new Date(now.getTime() + ttl),
    userAgent: input.userAgent ?? null,
    ip: input.ip ?? null,
    createdAt: now,
  }
  const result = await c.insertOne(doc)
  return {
    token,
    record: { id: result.insertedId.toString(), ...doc },
  }
}

export async function findByToken(
  plain: string,
): Promise<AuthProjectSession | null> {
  const c = await col()
  const doc = await c.findOne({ refreshTokenHash: hash(plain) })
  return doc ? toId(doc) : null
}

export async function markConsumed(id: string): Promise<void> {
  const c = await col()
  await c.updateOne(
    { _id: toObjectId(id) },
    { $set: { consumedAt: new Date() } },
  )
}

export async function revokeFamily(familyId: string): Promise<number> {
  const c = await col()
  const r = await c.updateMany(
    { familyId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  )
  return r.modifiedCount ?? 0
}

export async function revoke(id: string): Promise<boolean> {
  const c = await col()
  const r = await c.updateOne(
    { _id: toObjectId(id) },
    { $set: { revokedAt: new Date() } },
  )
  return (r.modifiedCount ?? 0) > 0
}

/** Tüm user session'larını revoke et — "force logout all devices". */
export async function revokeAllForUser(
  authProjectId: string,
  userId: string,
): Promise<number> {
  const c = await col()
  const r = await c.updateMany(
    { authProjectId, userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  )
  return r.modifiedCount ?? 0
}

export async function listForUser(
  authProjectId: string,
  userId: string,
): Promise<AuthProjectSession[]> {
  const c = await col()
  const docs = await c
    .find({ authProjectId, userId, revokedAt: null, consumedAt: null })
    .sort({ createdAt: -1 })
    .toArray()
  return docs.map(toId)
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ refreshTokenHash: 1 }, { unique: true })
  await c.createIndex({ familyId: 1 })
  await c.createIndex({ authProjectId: 1, userId: 1 })
  // Expired session'lar auto-evict — TTL index, expireAfter 1 hour grace
  await c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 3600 })
}
