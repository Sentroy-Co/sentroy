import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "crypto"

/**
 * Sentroy Env Vault — value encryption (AES-256-GCM).
 *
 * Master key kaynağı: `SENTROY_ENV_MASTER_KEY` env (32-byte secret,
 * base64 ya da hex; herhangi bir uzunluk verilirse scrypt ile 32-byte'a
 * normalize edilir → string parolalar da güvenle kullanılabilir).
 *
 * Format: `v1:<iv>:<authTag>:<cipherText>` (hepsi base64). v1 prefix
 * future-proof — şema değişirse v2 ekler, eski kayıtları decrypt
 * edilebilir tutarız.
 *
 * Not: Master key rotation: yeni key'le tüm cipher text'leri decrypt +
 * re-encrypt eden migration script gerekir; bu helper sadece tek
 * key okur. Rotation desteği için `SENTROY_ENV_MASTER_KEY_PREVIOUS`
 * fallback eklenebilir; şimdilik tek key.
 */

const VERSION = "v1"
const KEY_LENGTH = 32
const IV_LENGTH = 12 // GCM önerilen IV uzunluğu
const SCRYPT_SALT = Buffer.from("sentroy-env-vault-v1") // sabit salt — key
//   normalize amaçlı; gerçek entropy zaten master env'de.

// Bir parola string'i scrypt ile 32-byte'a normalize edilecekse minimum
// uzunluk şartı. Sabit salt kullandığımız için scrypt brute-force'a karşı
// tek savunma master key'in kendi entropisidir — "secret"/"password" gibi
// kısa girdiler sessizce kabul edilmemeli (sahte güvenlik). `openssl rand
// -base64 32` (44 char → 32 byte) zaten doğrudan-decode yoluna girer.
const MIN_PASSPHRASE_LENGTH = 32

let cachedKey: Buffer | null = null

function weakKeyError(len: number): Error {
  return new Error(
    `SENTROY_ENV_MASTER_KEY is too weak (${len} chars). Provide either a ` +
      "32-byte key (hex/base64, e.g. `openssl rand -base64 32`) or a " +
      `passphrase of at least ${MIN_PASSPHRASE_LENGTH} characters.`,
  )
}

function deriveKey(): Buffer {
  if (cachedKey) return cachedKey
  const raw = process.env.SENTROY_ENV_MASTER_KEY
  if (!raw) {
    throw new Error(
      "SENTROY_ENV_MASTER_KEY env is not set — env-vault encryption disabled. " +
        "Generate one with `openssl rand -base64 32` and add to platform env.",
    )
  }
  // Eğer hex/base64 ile direkt 32-byte gelmişse onu kullan, yoksa scrypt'le
  // normalize et. Heuristic: hex 64 char → 32 byte; base64 44 char → 32 byte.
  // scrypt fallback'e düşen ham parolalar MIN_PASSPHRASE_LENGTH'i geçmeli.
  let key: Buffer
  try {
    if (/^[A-Fa-f0-9]{64}$/.test(raw)) {
      key = Buffer.from(raw, "hex")
    } else if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length >= 43) {
      const buf = Buffer.from(raw, "base64")
      if (buf.length === KEY_LENGTH) {
        key = buf
      } else {
        if (raw.length < MIN_PASSPHRASE_LENGTH) throw weakKeyError(raw.length)
        key = scryptSync(raw, SCRYPT_SALT, KEY_LENGTH)
      }
    } else {
      if (raw.length < MIN_PASSPHRASE_LENGTH) throw weakKeyError(raw.length)
      key = scryptSync(raw, SCRYPT_SALT, KEY_LENGTH)
    }
  } catch (err) {
    // weakKeyError'ı yut(ma) — yukarı fırlat; sadece hex/base64 decode
    // exception'ında (malformed input) scrypt'e düş, o da uzunluk şartlı.
    if (err instanceof Error && err.message.includes("too weak")) throw err
    if (raw.length < MIN_PASSPHRASE_LENGTH) throw weakKeyError(raw.length)
    key = scryptSync(raw, SCRYPT_SALT, KEY_LENGTH)
  }
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `Derived env-vault key has unexpected length (${key.length}); ` +
        "ensure SENTROY_ENV_MASTER_KEY is at least 32 bytes of entropy.",
    )
  }
  cachedKey = key
  return key
}

export function encryptValue(plaintext: string): string {
  const key = deriveKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return [
    VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":")
}

export function decryptValue(blob: string): string {
  const parts = blob.split(":")
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error(
      `env-vault: unsupported cipher format (expected ${VERSION}:...:...:..., got ${parts[0]})`,
    )
  }
  const [, ivB64, authTagB64, encryptedB64] = parts
  const key = deriveKey()
  const iv = Buffer.from(ivB64, "base64")
  const authTag = Buffer.from(authTagB64, "base64")
  const encrypted = Buffer.from(encryptedB64, "base64")
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ])
  return decrypted.toString("utf8")
}

/**
 * Audit log için checksum. Plain value'yu hash'ler — audit'te değer
 * görünmez ama "değişip değişmediği" karşılaştırılabilir.
 */
export function checksumValue(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex")
}

/** Master key sağlığı testi. Admin UI banner'ı için: env yoksa false. */
export function isVaultConfigured(): boolean {
  return !!process.env.SENTROY_ENV_MASTER_KEY
}
