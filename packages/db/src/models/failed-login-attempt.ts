import { getDb } from "../client"

const COLLECTION = "failed_login_attempts"

/**
 * Account-level brute-force koruması — IP-based rate limit'in tamamlayıcısı.
 * IP rate-limit attacker'ı yavaşlatır ama IP rotasyonuyla atlatılabilir;
 * aynı email'e karşı yapılan başarısız denemeleri sayıp belirli bir eşiğin
 * üzerinde hesabı geçici kilitleriz.
 *
 * **Politika:** 10 başarısız deneme / 15 dk → 30 dk lockout. Başarılı login
 * counter'ı sıfırlar. TTL index `expiresAt`'te → mongo otomatik temizler.
 */
export interface FailedLoginAttempt {
  /** Normalized email — lowercase + trim. */
  email: string
  /** Window içinde toplam fail sayısı. */
  count: number
  /** Counter'ın expire olacağı zaman. TTL index bunu okur. */
  expiresAt: Date
  /** Account locked-until — `count` eşiği aşılınca set edilir. */
  lockedUntil: Date | null
  updatedAt: Date
}

export const FAIL_WINDOW_SECONDS = 15 * 60 // 15 dk
export const FAIL_THRESHOLD = 10
export const LOCKOUT_SECONDS = 30 * 60 // 30 dk

function col() {
  return getDb().then((db) => db.collection<FailedLoginAttempt>(COLLECTION))
}

/**
 * Check if account is currently locked. Caller bunu sign-in başlamadan
 * önce çağırır; dönen `lockedUntil` future ise sign-in reddedilmeli.
 */
export async function getLockStatus(
  email: string,
): Promise<{ locked: boolean; until: Date | null; count: number }> {
  const c = await col()
  const normalized = email.trim().toLowerCase()
  const doc = await c.findOne({ email: normalized })
  if (!doc) return { locked: false, until: null, count: 0 }
  const now = new Date()
  if (doc.lockedUntil && doc.lockedUntil > now) {
    return { locked: true, until: doc.lockedUntil, count: doc.count }
  }
  return { locked: false, until: doc.lockedUntil, count: doc.count }
}

/**
 * Increment fail counter. Eşik aşılırsa lockedUntil set eder ve döner.
 * Pencere `FAIL_WINDOW_SECONDS` içinde reset olur (TTL).
 */
export async function recordFailure(email: string): Promise<{
  count: number
  locked: boolean
  lockedUntil: Date | null
}> {
  const c = await col()
  const normalized = email.trim().toLowerCase()
  const now = new Date()
  const windowEnd = new Date(now.getTime() + FAIL_WINDOW_SECONDS * 1000)

  // Mevcut doc'u oku — `expiresAt` geçtiyse sıfırla.
  const existing = await c.findOne({ email: normalized })
  if (existing && existing.expiresAt <= now) {
    await c.deleteOne({ email: normalized })
  }

  const updated = await c.findOneAndUpdate(
    { email: normalized },
    {
      $inc: { count: 1 },
      $setOnInsert: { email: normalized, expiresAt: windowEnd },
      $set: { updatedAt: now },
    },
    { upsert: true, returnDocument: "after" },
  )

  if (!updated) {
    return { count: 1, locked: false, lockedUntil: null }
  }

  if (updated.count >= FAIL_THRESHOLD) {
    const lockedUntil = new Date(now.getTime() + LOCKOUT_SECONDS * 1000)
    await c.updateOne({ email: normalized }, { $set: { lockedUntil } })
    return { count: updated.count, locked: true, lockedUntil }
  }
  return { count: updated.count, locked: false, lockedUntil: null }
}

/** Successful login sonrası counter'ı sıfırla (lockout kalkar). */
export async function clearAttempts(email: string): Promise<void> {
  const c = await col()
  await c.deleteOne({ email: email.trim().toLowerCase() })
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ email: 1 }, { unique: true })
  // TTL — `expiresAt` zamanı geldiğinde mongo doc'u siler.
  await c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
}
