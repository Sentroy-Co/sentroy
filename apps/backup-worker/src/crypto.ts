import { createDecipheriv, scryptSync } from "node:crypto"

/**
 * backup-worker AES-256-GCM decrypt — packages/console/src/lib/env-vault-crypto.ts
 * ile BİREBİR aynı format (v1:<iv>:<authTag>:<cipherText>, hepsi base64) ve aynı
 * master key (`SENTROY_ENV_MASTER_KEY`). Core bağlantı URI'lerini bu şemayla
 * şifreler; worker yalnız decrypt eder. Worker standalone olduğundan console
 * import edilemez → helper burada mirror'lanır. Format değişirse İKİSİ birden güncellenmeli.
 */

const VERSION = "v1"
const KEY_LENGTH = 32
const SCRYPT_SALT = Buffer.from("sentroy-env-vault-v1")
const MIN_PASSPHRASE_LENGTH = 32

let cachedKey: Buffer | null = null

function deriveKey(): Buffer {
  if (cachedKey) return cachedKey
  const raw = process.env.SENTROY_ENV_MASTER_KEY
  if (!raw) {
    throw new Error(
      "SENTROY_ENV_MASTER_KEY env is not set — cannot decrypt connection URIs.",
    )
  }
  let key: Buffer
  if (/^[A-Fa-f0-9]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex")
  } else if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length >= 43) {
    const buf = Buffer.from(raw, "base64")
    key =
      buf.length === KEY_LENGTH
        ? buf
        : scryptSync(assertLen(raw), SCRYPT_SALT, KEY_LENGTH)
  } else {
    key = scryptSync(assertLen(raw), SCRYPT_SALT, KEY_LENGTH)
  }
  if (key.length !== KEY_LENGTH) {
    throw new Error("Derived master key has unexpected length.")
  }
  cachedKey = key
  return key
}

function assertLen(raw: string): string {
  if (raw.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error("SENTROY_ENV_MASTER_KEY is too weak (< 32 chars).")
  }
  return raw
}

export function decryptValue(blob: string): string {
  const parts = blob.split(":")
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Unsupported cipher format")
  }
  const [, ivB64, authTagB64, encryptedB64] = parts
  const key = deriveKey()
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64!, "base64"),
  )
  decipher.setAuthTag(Buffer.from(authTagB64!, "base64"))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64!, "base64")),
    decipher.final(),
  ])
  return decrypted.toString("utf8")
}
