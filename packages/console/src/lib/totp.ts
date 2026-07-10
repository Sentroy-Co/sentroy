import { createHmac } from "node:crypto"

/**
 * RFC 6238 TOTP — Time-based One-Time Password generator/verifier.
 *
 * Minimal implementation (HMAC-SHA1, 6 digits, 30s step) — Google
 * Authenticator, 1Password, Authy hepsiyle uyumlu. Library yerine
 * el yazısı çünkü dış dep eklemeye gerek yok (~60 satır).
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

function fromBase32(input: string): Buffer {
  const clean = input.replace(/=+$/, "").toUpperCase().replace(/\s+/g, "")
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch)
    if (idx < 0) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/**
 * RFC 6238 hesaplama — secret base32, T0 = 0, X = 30s, K = HOTP step.
 */
export function generateTotpCode(
  secretBase32: string,
  opts: { stepSeconds?: number; digits?: number; now?: number } = {},
): string {
  const stepSeconds = opts.stepSeconds ?? 30
  const digits = opts.digits ?? 6
  const now = opts.now ?? Date.now()
  const counter = Math.floor(now / 1000 / stepSeconds)

  const counterBuf = Buffer.alloc(8)
  counterBuf.writeBigUInt64BE(BigInt(counter))

  const key = fromBase32(secretBase32)
  const hmac = createHmac("sha1", key).update(counterBuf).digest()

  // Dynamic truncation
  const offset = hmac[hmac.length - 1] & 0x0f
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)

  return String(code % 10 ** digits).padStart(digits, "0")
}

/**
 * Code'u kabul edilebilir bir step penceresinde verify et.
 * Default: -1, 0, +1 (önceki / mevcut / sonraki step) → clock drift
 * toleransı ±30s.
 */
export function verifyTotpCode(
  secretBase32: string,
  providedCode: string,
  opts: { stepSeconds?: number; digits?: number; window?: number; now?: number } = {},
): boolean {
  if (!providedCode || providedCode.length === 0) return false
  const stepSeconds = opts.stepSeconds ?? 30
  const window = opts.window ?? 1
  const now = opts.now ?? Date.now()
  for (let delta = -window; delta <= window; delta++) {
    const candidate = generateTotpCode(secretBase32, {
      stepSeconds,
      digits: opts.digits,
      now: now + delta * stepSeconds * 1000,
    })
    if (timingSafeEqualString(candidate, providedCode.trim())) return true
  }
  return false
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * `otpauth://totp/...` provisioning URI — QR code'a basılır.
 *
 * Format: `otpauth://totp/{Label}?secret={base32}&issuer={issuer}&algorithm=SHA1&digits=6&period=30`
 */
export function buildTotpProvisioningUri(input: {
  secret: string
  accountName: string
  issuer: string
}): string {
  const label = `${encodeURIComponent(input.issuer)}:${encodeURIComponent(input.accountName)}`
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  })
  return `otpauth://totp/${label}?${params.toString()}`
}
