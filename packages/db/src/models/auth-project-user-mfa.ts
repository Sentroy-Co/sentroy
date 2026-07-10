import { randomBytes, createHash } from "node:crypto"
import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "auth_project_user_mfa"

/**
 * Per-user MFA factor — şu an v1 sadece TOTP (RFC 6238).
 * v2'de SMS, WebAuthn (passkey ayrı model), FIDO2 hardware key.
 *
 * recoveryCodesHash: 10 adet hex code. Hash'leri saklanır; consume
 * edilen biri unique olarak işaretlenir.
 */

export type MfaFactorType = "totp"

export interface AuthProjectUserMfa {
  id: string
  authProjectId: string
  userId: string
  factorType: MfaFactorType
  /** TOTP shared secret (base32 string). Plaintext saklanır; HMAC key. */
  secret: string
  /** Enrollment'in onaylanmış mı (initial code verify edildi mi). False ise
   *  login flow MFA gerektirmez. */
  verifiedAt: Date | null
  /** Recovery codes — `{ codeHash: string, consumedAt: Date | null }[]`.
   *  10 adet. consumedAt set olunca tekrar kullanılamaz. */
  recoveryCodes: Array<{ codeHash: string; consumedAt: Date | null }>
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

/**
 * Base32 alphabet (RFC 4648). TOTP shared secret formatı.
 */
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
function toBase32(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ""
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f]
  return out
}

export function generateTotpSecret(): string {
  return toBase32(randomBytes(20))
}

function generateRecoveryCode(): string {
  // 10 char (8 hex chars + dash) — kolay oku/yaz, brute-force güvenli.
  return `${randomBytes(2).toString("hex")}-${randomBytes(2).toString("hex")}`
}

function hashCode(plain: string): string {
  return createHash("sha256")
    .update(plain.toLowerCase().replace(/-/g, ""))
    .digest("hex")
}

// ─── Queries ──────────────────────────────────────────────────────────────

export async function findByUser(
  userId: string,
): Promise<AuthProjectUserMfa | null> {
  const c = await col()
  const doc = await c.findOne({ userId })
  return doc ? toId(doc) : null
}

// ─── Mutations ────────────────────────────────────────────────────────────

/**
 * Enrollment başlat — yeni secret üret, kaydet (verifiedAt=null). Caller
 * QR code'a basacağı `otpauth://` URI'sini üretir. Recovery codes henüz
 * yok — verify-enrollment sırasında üretilir.
 */
export async function enrollTotp(input: {
  authProjectId: string
  userId: string
}): Promise<AuthProjectUserMfa> {
  const c = await col()
  // Mevcut enrollment varsa replace (kullanıcı yeniden enroll ediyorsa
  // eski secret artık geçerli değil)
  const existing = await c.findOne({ userId: input.userId })
  if (existing) {
    await c.deleteOne({ _id: existing._id })
  }
  const secret = generateTotpSecret()
  const now = new Date()
  const doc = {
    authProjectId: input.authProjectId,
    userId: input.userId,
    factorType: "totp" as const,
    secret,
    verifiedAt: null as Date | null,
    recoveryCodes: [] as AuthProjectUserMfa["recoveryCodes"],
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

/**
 * Enrollment'ı onayla — verifiedAt set, 10 recovery code üret, hash'lerini
 * sakla, plaintext code'ları return et (sadece bir kez gösterilir).
 */
export async function verifyEnrollment(
  id: string,
): Promise<{ mfa: AuthProjectUserMfa; recoveryCodes: string[] } | null> {
  const c = await col()
  const codes = Array.from({ length: 10 }, () => generateRecoveryCode())
  const hashed = codes.map((code) => ({
    codeHash: hashCode(code),
    consumedAt: null as Date | null,
  }))
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    {
      $set: {
        verifiedAt: new Date(),
        recoveryCodes: hashed,
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  )
  if (!result) return null
  return { mfa: toId(result), recoveryCodes: codes }
}

export async function disable(userId: string): Promise<boolean> {
  const c = await col()
  const r = await c.deleteOne({ userId })
  return (r.deletedCount ?? 0) > 0
}

/**
 * Recovery code consume — eşleşen + consume edilmemiş ilk code'u
 * consumedAt ile işaretler. Başarılı ise true.
 */
export async function consumeRecoveryCode(
  userId: string,
  code: string,
): Promise<boolean> {
  const c = await col()
  const target = hashCode(code)
  const result = await c.findOneAndUpdate(
    {
      userId,
      "recoveryCodes.codeHash": target,
      "recoveryCodes.consumedAt": null,
    },
    {
      $set: {
        "recoveryCodes.$.consumedAt": new Date(),
        updatedAt: new Date(),
      },
    },
  )
  return result !== null
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ userId: 1 }, { unique: true })
  await c.createIndex({ authProjectId: 1 })
}
