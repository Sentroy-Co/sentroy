import {
  createCipheriv,
  createDecipheriv,
  scryptSync,
} from "node:crypto"

/**
 * AES-256-GCM decrypt — `packages/console/src/lib/env-vault-crypto.ts`'in
 * minimal worker-side eşi. Restart target'larda saklanan şifreli auth
 * header / SSH key / API token'larını decrypt etmek için.
 *
 * Format: `v1:<iv>:<authTag>:<cipherText>` (hepsi base64). Master key
 * `STATUS_ENV_MASTER_KEY` env'inden (env-vault'la aynı master kullansa
 * da kullanmasa da farketmez — RP'lerin kendi şifrelenmiş value'ları
 * için ortak key).
 *
 * Worker write etmez — sadece decrypt. Encryption dashboard handler'da
 * (packages/console) yapılır.
 */

const VERSION = "v1"
const KEY_LENGTH = 32
const SCRYPT_SALT = Buffer.from("sentroy-env-vault-v1")

function getMasterKey(): Buffer {
  const raw = process.env.STATUS_ENV_MASTER_KEY || process.env.SENTROY_ENV_MASTER_KEY
  if (!raw) {
    throw new Error(
      "STATUS_ENV_MASTER_KEY (or SENTROY_ENV_MASTER_KEY fallback) not set — cannot decrypt restart target credentials.",
    )
  }
  return scryptSync(raw, SCRYPT_SALT, KEY_LENGTH)
}

export function decryptValue(blob: string): string {
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

/**
 * Encrypt helper — worker write etmez ama symmetric test için lazım
 * olabilir. Production'da çağrılmamalı.
 */
export function encryptValue(plaintext: string): string {
  const key = getMasterKey()
  const { randomBytes } = require("node:crypto") as typeof import("node:crypto")
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const cipherText = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return `${VERSION}:${iv.toString("base64")}:${authTag.toString("base64")}:${cipherText.toString("base64")}`
}
