import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "auth_users"

/**
 * Sentroy Auth-as-a-Service end-user.
 *
 * RP'nin (Sentroy üzerinde host eden geliştirici) kullanıcısı — Sentroy
 * platform user'larıyla (`user` koleksiyonu) **karışmaz**. Çoklu RP'lerin
 * end-user'ları aynı `auth_users` koleksiyonunda yaşar ama `authProjectId`
 * field'ı ile izole edilir; composite unique index `{authProjectId,
 * emailLower}` sayesinde aynı email farklı project'lerde aynı anda
 * bağımsız user olabilir.
 *
 * **Password hash**: `argon2id` zorunlu (NIST + OWASP önerisi). Hash
 * inputu raw password; salt argon2 paketinin kendi içinde üretilir,
 * hash string'i `$argon2id$...` formatında salt'ı taşır.
 *
 * **metadata**: caller (RP) tarafından serbest JSON; örn. `{tier: "pro",
 * preferences: {theme: "dark"}}`. Sentroy üzerinde indexlenmez, sadece
 * read/write. Schemanın esnek kalması için typed alan açılmadı.
 */

export interface AuthProjectUser {
  id: string
  authProjectId: string
  /** Görüntülenen email (case preserved). */
  email: string
  /** Lookup için lowercased — composite unique index üzerinde kullanılır. */
  emailLower: string
  emailVerified: boolean
  /** Argon2id encoded string ($argon2id$v=19$...). Plaintext asla saklanmaz. */
  passwordHash: string
  /** Şu an "argon2id" sabit; ileride farklı algo migration için ayrı field. */
  passwordAlgo: "argon2id"
  displayName: string | null
  /** Profile picture URL (caller upload edip URL'i kaydedebilir; v1'de SDK upload helper yok). */
  image: string | null
  /** RP-defined free-form metadata — Sentroy yorumlamaz. */
  metadata: Record<string, unknown>
  lastLoginAt: Date | null
  lastLoginIp: string | null
  /** Brute-force korumasyla set edilir; null = aktif. */
  lockedUntil: Date | null
  /** Failed login counter (lockout decision için). */
  failedLoginCount: number
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// ─── Queries ──────────────────────────────────────────────────────────────

export async function findById(id: string): Promise<AuthProjectUser | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return doc ? toId(doc) : null
}

export async function findByEmail(
  authProjectId: string,
  email: string,
): Promise<AuthProjectUser | null> {
  const c = await col()
  const doc = await c.findOne({
    authProjectId,
    emailLower: normalizeEmail(email),
  })
  return doc ? toId(doc) : null
}

export async function listByProject(
  authProjectId: string,
  opts: { limit?: number; skip?: number; emailVerified?: boolean } = {},
): Promise<AuthProjectUser[]> {
  const c = await col()
  const filter: Record<string, unknown> = { authProjectId }
  if (typeof opts.emailVerified === "boolean") {
    filter.emailVerified = opts.emailVerified
  }
  const docs = await c
    .find(filter)
    .sort({ createdAt: -1 })
    .skip(opts.skip ?? 0)
    .limit(opts.limit ?? 50)
    .toArray()
  return docs.map(toId)
}

export async function countByProject(authProjectId: string): Promise<number> {
  const c = await col()
  return c.countDocuments({ authProjectId })
}

// ─── Mutations ────────────────────────────────────────────────────────────

export async function create(input: {
  authProjectId: string
  email: string
  passwordHash: string
  displayName?: string | null
  emailVerified?: boolean
  metadata?: Record<string, unknown>
}): Promise<AuthProjectUser> {
  const c = await col()
  const now = new Date()
  const doc = {
    authProjectId: input.authProjectId,
    email: input.email.trim(),
    emailLower: normalizeEmail(input.email),
    emailVerified: input.emailVerified ?? false,
    passwordHash: input.passwordHash,
    passwordAlgo: "argon2id" as const,
    displayName: input.displayName ?? null,
    image: null as string | null,
    metadata: input.metadata ?? {},
    lastLoginAt: null as Date | null,
    lastLoginIp: null as string | null,
    lockedUntil: null as Date | null,
    failedLoginCount: 0,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function update(
  id: string,
  patch: Partial<
    Pick<
      AuthProjectUser,
      | "displayName"
      | "image"
      | "emailVerified"
      | "passwordHash"
      | "metadata"
      | "lockedUntil"
      | "failedLoginCount"
    >
  >,
): Promise<AuthProjectUser | null> {
  const c = await col()
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { ...patch, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return result ? toId(result) : null
}

/**
 * Email değiştir — composite unique (authProjectId, emailLower) constraint'i
 * karşılayacak şekilde transactional değil ama race-safe:
 * 1. Yeni email aynı project'te kayıtlı mı kontrol et (precondition)
 * 2. updateOne ile email + emailLower set, emailVerified=true (zaten token
 *    confirm ile geldi)
 *
 * Aynı anda iki user aynı email'i alırsa Mongo unique index conflict atar →
 * caller `null` yakalar.
 */
export async function changeEmail(
  id: string,
  newEmail: string,
): Promise<AuthProjectUser | null> {
  const trimmed = newEmail.trim()
  const lower = normalizeEmail(trimmed)
  const c = await col()
  const current = await c.findOne({ _id: toObjectId(id) })
  if (!current) return null
  const conflict = await c.findOne({
    authProjectId: current.authProjectId,
    emailLower: lower,
    _id: { $ne: current._id },
  })
  if (conflict) return null
  try {
    const result = await c.findOneAndUpdate(
      { _id: toObjectId(id) },
      {
        $set: {
          email: trimmed,
          emailLower: lower,
          emailVerified: true,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    )
    return result ? toId(result) : null
  } catch {
    // Unique index violation (race condition)
    return null
  }
}

export async function recordLoginSuccess(
  id: string,
  ip: string | null,
): Promise<void> {
  const c = await col()
  await c.updateOne(
    { _id: toObjectId(id) },
    {
      $set: {
        lastLoginAt: new Date(),
        lastLoginIp: ip,
        failedLoginCount: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      },
    },
  )
}

/**
 * Failed login → counter++ + threshold aşımında lock. Threshold 5 attempt,
 * lock duration 15 dakika (linear; geometric backoff v2'de).
 */
export async function recordLoginFailure(
  id: string,
): Promise<{ locked: boolean; until: Date | null }> {
  const c = await col()
  const THRESHOLD = 5
  const LOCK_MS = 15 * 60 * 1000
  const updated = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $inc: { failedLoginCount: 1 }, $set: { updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  if (!updated) return { locked: false, until: null }
  const count = (updated as { failedLoginCount?: number }).failedLoginCount ?? 0
  if (count >= THRESHOLD) {
    const until = new Date(Date.now() + LOCK_MS)
    await c.updateOne(
      { _id: toObjectId(id) },
      { $set: { lockedUntil: until, failedLoginCount: 0 } },
    )
    return { locked: true, until }
  }
  return { locked: false, until: null }
}

export async function remove(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  // Per-project email uniqueness — aynı email iki farklı project'te
  // bağımsız user'lar olabilir.
  await c.createIndex(
    { authProjectId: 1, emailLower: 1 },
    { unique: true },
  )
  await c.createIndex({ authProjectId: 1, createdAt: -1 })
}
