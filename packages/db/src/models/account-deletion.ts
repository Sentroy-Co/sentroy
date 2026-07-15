import { createHash, randomInt } from "node:crypto"
import { getDb } from "../client"
import { toId } from "./_helpers"

/**
 * Hesap silme doğrulama kodu — company-ownership-transfer deseninin
 * kullanıcı-kapsamlı versiyonu. 6 haneli kod kayıtlı e-postaya gider;
 * yalnız SHA-256 hash'i saklanır, 15 dk geçerli, 5 yanlış denemede yanar,
 * tek kullanımlık.
 */
const COLLECTION = "account_deletion_requests"
const TTL_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5

export interface AccountDeletionRequest {
  id: string
  userId: string
  codeHash: string
  attempts: number
  consumedAt: Date | null
  expiresAt: Date
  createdAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

function hash(plain: string): string {
  return createHash("sha256").update(plain).digest("hex")
}

export function generateCode(): string {
  return String(randomInt(100000, 1000000))
}

/** Bekleyen isteği değiştirir (kullanıcı başına tek istek); plaintext kodu döner. */
export async function create(userId: string): Promise<string> {
  const c = await col()
  await c.deleteMany({ userId })
  const code = generateCode()
  await c.insertOne({
    userId,
    codeHash: hash(code),
    attempts: 0,
    consumedAt: null,
    expiresAt: new Date(Date.now() + TTL_MS),
    createdAt: new Date(),
  })
  return code
}

export async function verifyAndConsume(
  userId: string,
  plainCode: string,
): Promise<{ status: "ok" | "wrong" | "none" }> {
  const c = await col()
  const doc = await c.findOne({ userId, consumedAt: null, expiresAt: { $gt: new Date() } })
  if (!doc) return { status: "none" }
  if (doc.codeHash !== hash(plainCode)) {
    const attempts = (doc.attempts ?? 0) + 1
    if (attempts >= MAX_ATTEMPTS) {
      await c.deleteOne({ _id: doc._id })
    } else {
      await c.updateOne({ _id: doc._id }, { $set: { attempts } })
    }
    return { status: "wrong" }
  }
  await c.updateOne({ _id: doc._id }, { $set: { consumedAt: new Date() } })
  return { status: "ok" }
}

export async function cancel(userId: string): Promise<void> {
  const c = await col()
  await c.deleteMany({ userId })
}

export async function findPending(userId: string): Promise<AccountDeletionRequest | null> {
  const c = await col()
  const doc = await c.findOne({ userId, consumedAt: null, expiresAt: { $gt: new Date() } })
  return doc ? (toId(doc) as AccountDeletionRequest) : null
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ userId: 1 })
  await c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 3600 })
}
