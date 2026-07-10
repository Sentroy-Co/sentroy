import { getDb } from "../client"
import { toId } from "./_helpers"
import { createHash, randomInt } from "crypto"
import type { CompanyOwnershipTransfer } from "../types"

const COLLECTION = "company_ownership_transfers"
const TTL_MS = 15 * 60 * 1000 // 15 dk
const MAX_ATTEMPTS = 5

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

function hash(plain: string): string {
  return createHash("sha256").update(plain).digest("hex")
}

/** 6 haneli sayısal kod (100000-999999). */
function generateCode(): string {
  return String(randomInt(100000, 1000000))
}

export async function create(input: {
  companyId: string
  initiatedBy: string
  targetUserId: string
  targetMemberId: string
}): Promise<{ code: string; record: CompanyOwnershipTransfer }> {
  const c = await col()
  // Aynı şirket için önceki bekleyeni temizle — yeni kod öncekini geçersizler.
  await c.deleteMany({ companyId: input.companyId })
  const code = generateCode()
  const now = new Date()
  const doc = {
    companyId: input.companyId,
    initiatedBy: input.initiatedBy,
    targetUserId: input.targetUserId,
    targetMemberId: input.targetMemberId,
    codeHash: hash(code),
    attempts: 0,
    expiresAt: new Date(now.getTime() + TTL_MS),
    consumedAt: null as Date | null,
    createdAt: now,
  }
  const result = await c.insertOne(doc)
  return { code, record: { id: result.insertedId.toString(), ...doc } }
}

export type VerifyResult =
  | { status: "ok"; record: CompanyOwnershipTransfer }
  | { status: "wrong" }
  | { status: "none" }

/**
 * Kodu doğrula + tek-kullanımlık consume. Eşleşmezse attempt++ (MAX'ta kaydı
 * sil → brute-force kapalı). Eşleşir + unconsumed + unexpired → consume.
 */
export async function verifyAndConsume(
  companyId: string,
  plainCode: string,
): Promise<VerifyResult> {
  const c = await col()
  const now = new Date()
  const pending = await c.findOne({
    companyId,
    consumedAt: null,
    expiresAt: { $gt: now },
  })
  if (!pending) return { status: "none" }
  if (pending.codeHash !== hash(plainCode)) {
    const attempts = ((pending.attempts as number) ?? 0) + 1
    if (attempts >= MAX_ATTEMPTS) {
      await c.deleteOne({ _id: pending._id })
    } else {
      await c.updateOne({ _id: pending._id }, { $inc: { attempts: 1 } })
    }
    return { status: "wrong" }
  }
  await c.updateOne({ _id: pending._id }, { $set: { consumedAt: now } })
  return { status: "ok", record: toId(pending) as CompanyOwnershipTransfer }
}

/** Bekleyen devri iptal et (owner vazgeçerse). */
export async function cancel(companyId: string): Promise<void> {
  const c = await col()
  await c.deleteMany({ companyId })
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ companyId: 1 })
  // TTL — süresi geçen kayıtlar otomatik silinir (grace 1 saat).
  await c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 3600 })
}
