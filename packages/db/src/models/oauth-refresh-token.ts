import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"
import { randomBytes, createHash } from "crypto"

const COLLECTION = "oauth_refresh_tokens"
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

/**
 * OAuth refresh token (opaque) — RFC 6749 §6 + RFC 9700 BCP rotation.
 *
 * Issue edilir sadece `offline_access` scope onaylanmışsa. Format
 * `ort_<48hex>`. SHA-256 hash'li saklanır.
 *
 * **Rotation + family detection** (RFC 9700 §4.13):
 *   - Her refresh exchange'inde yeni token issue edilir + eski consumedAt
 *     set edilir.
 *   - Her token bir `familyId`'ye bağlı (initial issue'da yeni family,
 *     refresh'lerde aynı family devam eder).
 *   - Eğer tüketilmiş bir token tekrar kullanılmaya çalışılırsa
 *     (replay/theft signal), ENTIRE family revoke edilir → çalan attacker
 *     da meşru kullanıcı da yeni token alamaz, fresh login zorunlu.
 */

export interface OAuthRefreshToken {
  id: string
  /** SHA-256 of plaintext. */
  tokenHash: string
  /** İlk 8 char (debug). */
  tokenPrefix: string
  clientId: string
  userId: string
  scopes: string[]
  /** Bu refresh chain'inin ortak ID'si — rotation / theft detection için. */
  familyId: string
  /** Bu token rotate edildiğinde set; reuse fail signal. */
  consumedAt: Date | null
  /** Manuel revoke ya da family-revoke; null = aktif. */
  revokedAt: Date | null
  expiresAt: Date
  createdAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

function generateToken(): string {
  return `ort_${randomBytes(24).toString("hex")}`
}

function generateFamilyId(): string {
  return `fam_${randomBytes(12).toString("hex")}`
}

function hash(plain: string): string {
  return createHash("sha256").update(plain).digest("hex")
}

export async function create(input: {
  clientId: string
  userId: string
  scopes: string[]
  /** Mevcut bir family'nin devamı mı (refresh rotation), yoksa yeni mi (initial issue)? */
  familyId?: string
  ttlMs?: number
}): Promise<{ token: string; record: OAuthRefreshToken }> {
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
    familyId: input.familyId ?? generateFamilyId(),
    consumedAt: null,
    revokedAt: null,
    expiresAt: new Date(now.getTime() + ttl),
    createdAt: now,
  }
  const result = await c.insertOne(doc)
  return {
    token,
    record: { id: result.insertedId.toString(), ...doc },
  }
}

export async function findByToken(plain: string): Promise<OAuthRefreshToken | null> {
  const c = await col()
  const doc = await c.findOne({ tokenHash: hash(plain) })
  return doc ? toId(doc) : null
}

/** Tek bir token'ı consumed işaretle (rotation sırasında). */
export async function markConsumed(id: string): Promise<void> {
  const c = await col()
  await c.updateOne(
    { _id: toObjectId(id) },
    { $set: { consumedAt: new Date() } },
  )
}

/**
 * Bir family'deki TÜM token'ları revoke et — token reuse / theft signal.
 * Hem mevcut aktif token'lar (revokedAt set), hem de gelecekte refresh
 * çağrıları reddedilir.
 */
export async function revokeFamily(familyId: string): Promise<number> {
  const c = await col()
  const r = await c.updateMany(
    { familyId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  )
  return r.modifiedCount ?? 0
}

/** Manuel revoke (örn. logout, kullanıcı consent geri çekti). */
export async function revoke(id: string): Promise<boolean> {
  const c = await col()
  const r = await c.updateOne(
    { _id: toObjectId(id) },
    { $set: { revokedAt: new Date() } },
  )
  return (r.modifiedCount ?? 0) > 0
}

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
  await c.createIndex({ familyId: 1 })
  await c.createIndex({ userId: 1, clientId: 1 })
  // TTL index — expired refresh tokens auto-evict
  await c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 3600 })
}
