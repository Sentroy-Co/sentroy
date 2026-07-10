import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"
import { randomBytes, createHash } from "crypto"

const COLLECTION = "auth_project_tokens"

/**
 * Auth-as-a-Service tek-kullanımlık token — email verification,
 * password reset, magic link.
 *
 * Token URL-safe, 32 hex char (~128 bit). SHA-256 hash'li saklanır;
 * plaintext sadece tetiklenen mail içinde kullanıcıya gönderilir.
 * Bir kez consume edildiğinde `consumedAt` set edilir, sonraki kullanım
 * reddedilir.
 *
 * Default TTL'ler:
 *   - verify-email: 24 saat
 *   - password-reset: 1 saat (kısa — sensitive)
 *   - magic-link: 15 dakika (kısa — geçici giriş)
 */

export type AuthProjectTokenPurpose =
  | "verify-email"
  | "password-reset"
  | "magic-link"
  | "email-change"
  | "account-deletion"
  | "mfa-pending"
  | "passkey-challenge"
  | "invitation"
  | "social-state"

export interface AuthProjectToken {
  id: string
  authProjectId: string
  userId: string
  purpose: AuthProjectTokenPurpose
  tokenHash: string
  tokenPrefix: string
  /** Purpose-specific payload (e.g. email-change'de yeni email adresi). */
  payload: Record<string, unknown> | null
  consumedAt: Date | null
  expiresAt: Date
  createdAt: Date
}

const DEFAULT_TTL_MS: Record<AuthProjectTokenPurpose, number> = {
  "verify-email": 24 * 60 * 60 * 1000,
  "password-reset": 60 * 60 * 1000,
  "magic-link": 15 * 60 * 1000,
  "email-change": 60 * 60 * 1000,
  "account-deletion": 60 * 60 * 1000,
  "mfa-pending": 5 * 60 * 1000,
  "passkey-challenge": 5 * 60 * 1000,
  invitation: 7 * 24 * 60 * 60 * 1000, // 7 days
  "social-state": 10 * 60 * 1000, // 10 min
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

function generateToken(): string {
  return randomBytes(16).toString("hex")
}

function hash(plain: string): string {
  return createHash("sha256").update(plain).digest("hex")
}

export async function create(input: {
  authProjectId: string
  userId: string
  purpose: AuthProjectTokenPurpose
  ttlMs?: number
  /** Purpose-specific payload (e.g. email-change için { newEmail }). */
  payload?: Record<string, unknown> | null
}): Promise<{ token: string; record: AuthProjectToken }> {
  const c = await col()
  const token = generateToken()
  const now = new Date()
  const ttl = input.ttlMs ?? DEFAULT_TTL_MS[input.purpose]
  const doc = {
    authProjectId: input.authProjectId,
    userId: input.userId,
    purpose: input.purpose,
    tokenHash: hash(token),
    tokenPrefix: token.slice(0, 8),
    payload: input.payload ?? null,
    consumedAt: null as Date | null,
    expiresAt: new Date(now.getTime() + ttl),
    createdAt: now,
  }
  const result = await c.insertOne(doc)
  return { token, record: { id: result.insertedId.toString(), ...doc } }
}

export async function findByToken(
  plain: string,
  purpose: AuthProjectTokenPurpose,
): Promise<AuthProjectToken | null> {
  const c = await col()
  const doc = await c.findOne({ tokenHash: hash(plain), purpose })
  return doc ? toId(doc) : null
}

/**
 * Atomic consume — döner: {ok: true, token} eğer token aktif ve consume
 * edildi; {ok: false, reason: ...} aksi halde. Race condition'a karşı
 * `findOneAndUpdate` ile filter ediliyor.
 */
export async function consume(
  plain: string,
  purpose: AuthProjectTokenPurpose,
):
  Promise<
    | { ok: true; token: AuthProjectToken }
    | { ok: false; reason: "not-found" | "expired" | "already-used" }
  > {
  const c = await col()
  const now = new Date()
  const doc = await c.findOneAndUpdate(
    {
      tokenHash: hash(plain),
      purpose,
      consumedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { consumedAt: now } },
    { returnDocument: "after" },
  )
  if (doc) return { ok: true, token: toId(doc) }
  // Lookup neden başarısız oldu? Diagnostic için ayrıştır:
  const stale = await c.findOne({ tokenHash: hash(plain), purpose })
  if (!stale) return { ok: false, reason: "not-found" }
  if (stale.consumedAt) return { ok: false, reason: "already-used" }
  return { ok: false, reason: "expired" }
}

/**
 * Non-consuming validity probe — token'ı tüketmeden geçerli mi diye
 * bakar. Reset-password landing page'i kullanır: form prompt'unu render
 * etmeden önce kötü bir token üzerinde kullanıcıyı şifre girdirip son
 * adımda reddetmek yerine baştan hata mesajı göster.
 *
 * Sonuç `consume` ile aynı reason union'ını paylaşır (UI logic tek
 * yerden).
 */
export async function peek(
  plain: string,
  purpose: AuthProjectTokenPurpose,
):
  Promise<
    | { ok: true; token: AuthProjectToken }
    | { ok: false; reason: "not-found" | "expired" | "already-used" }
  > {
  const c = await col()
  const doc = await c.findOne({ tokenHash: hash(plain), purpose })
  if (!doc) return { ok: false, reason: "not-found" }
  if (doc.consumedAt) return { ok: false, reason: "already-used" }
  if (doc.expiresAt < new Date()) return { ok: false, reason: "expired" }
  return { ok: true, token: toId(doc) }
}

export async function invalidateAllForUser(
  authProjectId: string,
  userId: string,
  purpose: AuthProjectTokenPurpose,
): Promise<number> {
  const c = await col()
  const r = await c.updateMany(
    { authProjectId, userId, purpose, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  )
  return r.modifiedCount ?? 0
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ tokenHash: 1 }, { unique: true })
  await c.createIndex({ authProjectId: 1, userId: 1 })
  // TTL — expired token'lar auto-evict 1 saat grace ile
  await c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 3600 })
}
