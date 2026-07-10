import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto"

/**
 * AES-256-GCM şifreleme — Baileys oturum kimlik bilgileri (creds) ve Signal
 * protokol anahtarları DB'de **şifreli** saklanır. Bu materyal ele geçerse
 * saldırgan kurbanın WhatsApp oturumunu klonlayabilir; bu yüzden at-rest
 * şifreleme zorunlu.
 *
 * Format: `v1:<iv>:<authTag>:<cipherText>` (hepsi base64). Master key
 * `WHATSAPP_ENC_KEY` env'inden; yoksa platform geneli `SENTROY_ENV_MASTER_KEY`
 * (status-worker / env-vault ile aynı zincir) fallback.
 */

const VERSION = "v1"
const KEY_LENGTH = 32
const SCRYPT_SALT = Buffer.from("sentroy-whatsapp-v1")

function getMasterKey(): Buffer {
  const raw =
    process.env.WHATSAPP_ENC_KEY ||
    process.env.SENTROY_ENV_MASTER_KEY ||
    process.env.STATUS_ENV_MASTER_KEY
  if (!raw) {
    throw new Error(
      "WHATSAPP_ENC_KEY (or SENTROY_ENV_MASTER_KEY fallback) not set — refusing to store WhatsApp credentials unencrypted.",
    )
  }
  return scryptSync(raw, SCRYPT_SALT, KEY_LENGTH)
}

export function encrypt(plaintext: string): string {
  const key = getMasterKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const cipherText = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return `${VERSION}:${iv.toString("base64")}:${authTag.toString("base64")}:${cipherText.toString("base64")}`
}

export function decrypt(blob: string): string {
  const parts = blob.split(":")
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Invalid ciphertext format")
  }
  const iv = Buffer.from(parts[1]!, "base64")
  const authTag = Buffer.from(parts[2]!, "base64")
  const cipherText = Buffer.from(parts[3]!, "base64")
  const key = getMasterKey()
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(authTag)
  const plain = Buffer.concat([decipher.update(cipherText), decipher.final()])
  return plain.toString("utf8")
}
