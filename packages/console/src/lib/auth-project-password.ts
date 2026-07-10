import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto"
import type { AuthProjectPasswordPolicy } from "@workspace/db/models/auth-project"

/**
 * Auth-as-a-Service password hashing.
 *
 * **Algorithm**: scrypt (Node.js built-in). OWASP'ın bcrypt/argon2 alternatifi
 * — memory-hard KDF, GPU/ASIC attack resistance. Argon2id'in tek
 * dezavantajı: native binding gerektirir, Docker build'de prebuilt binary
 * sorunları çıkarır. Pure Node.js scrypt prod-ready: parametreler OWASP
 * minimum cost.
 *
 * **Storage format**: `scrypt$<N>$<r>$<p>$<saltB64>$<hashB64>` — self-
 * describing, future cost upgrade'leri için forward-compatible. Algo
 * field (`passwordAlgo: "scrypt-v1"`) DB'de ayrıca tutulur (migration için).
 *
 * **Cost**: N=2^16 → ~64MB RAM, ~80-150ms hash on commodity x86. Production
 * için makul; signup/login latency kabul edilebilir, attacker'a 10K+ guess/sec
 * GPU avantajı vermez.
 *
 * **Constant-time compare**: `timingSafeEqual` ile, length check üst seviyede
 * (Buffer.length'lar SHA-derived deterministic; equal length zaten).
 */

const COST_N = 2 ** 16
const COST_R = 8
const COST_P = 1
const KEY_LEN = 32
const SALT_LEN = 16
const MAX_MEM = 128 * 1024 * 1024 // 128 MB ceiling

export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_LEN)
  const derived = scryptSync(plain, salt, KEY_LEN, {
    N: COST_N,
    r: COST_R,
    p: COST_P,
    maxmem: MAX_MEM,
  })
  return [
    "scrypt",
    String(COST_N),
    String(COST_R),
    String(COST_P),
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$")
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split("$")
  if (parts.length !== 6 || parts[0] !== "scrypt") return false
  const N = Number.parseInt(parts[1], 10)
  const r = Number.parseInt(parts[2], 10)
  const p = Number.parseInt(parts[3], 10)
  if (
    !Number.isFinite(N) ||
    !Number.isFinite(r) ||
    !Number.isFinite(p) ||
    N < 2 ** 14 ||
    r < 1 ||
    p < 1
  ) {
    // Reject implausible parameters (could come from corrupted/older
    // weak record); fail-closed.
    return false
  }
  let salt: Buffer
  let expected: Buffer
  try {
    salt = Buffer.from(parts[4], "base64")
    expected = Buffer.from(parts[5], "base64")
  } catch {
    return false
  }
  let derived: Buffer
  try {
    derived = scryptSync(plain, salt, expected.length, {
      N,
      r,
      p,
      maxmem: MAX_MEM,
    })
  } catch {
    return false
  }
  if (derived.length !== expected.length) return false
  return timingSafeEqual(derived, expected)
}

/**
 * Project-specific password policy validation. Caller'a {ok|reason}
 * döner — UI'da spesifik hata mesajı gösterilebilsin diye gerekçe
 * machine-readable.
 */
export function validatePasswordPolicy(
  password: string,
  policy: AuthProjectPasswordPolicy,
):
  | { ok: true }
  | {
      ok: false
      reason:
        | "too-short"
        | "missing-uppercase"
        | "missing-number"
      details: { required: number }
    } {
  if (password.length < policy.minLength) {
    return {
      ok: false,
      reason: "too-short",
      details: { required: policy.minLength },
    }
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    return { ok: false, reason: "missing-uppercase", details: { required: 1 } }
  }
  if (policy.requireNumber && !/[0-9]/.test(password)) {
    return { ok: false, reason: "missing-number", details: { required: 1 } }
  }
  return { ok: true }
}
