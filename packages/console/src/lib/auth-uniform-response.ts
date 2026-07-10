import type { NextRequest } from "next/server"
import {
  checkRateLimit,
  type RateLimitResult,
} from "@workspace/console/lib/rate-limit"

/**
 * Auth-as-a-Service public endpoint hardening helpers.
 *
 * **Email enumeration protection:**
 * Attacker bir endpoint'i bombardıman ederek "var/yok" sızıntısı yapamamalı.
 * Bu helper iki sızıntı vektörünü kapatır:
 *   1. **Response timing**: var olan vs olmayan user için response süresi
 *      farklı olursa attacker statistical analysis ile listeleyebilir.
 *      `enforceMinLatency(start, minMs)` her isteği aynı min süreye ölçer.
 *   2. **Per-IP + per-target rate limit**: brute-force veya scanning'i
 *      sınırlar; ek olarak per-email key ile aynı email'e aşırı
 *      reset/signup attempt'lerini engeller.
 *
 * Limit'ler genel olarak konservatif — gerçek bir RP/end-user 1
 * saatte 5 signup attempt'ten fazla yapmaz; brute-force eden 1000+ atar.
 */

export interface AuthRateLimitConfig {
  /** Endpoint identifier (örn. "signup", "login"). Per-project bucket. */
  key: string
  /** Time window in seconds. */
  window: number
  /** Max attempts within window per (IP, project). */
  max: number
  /** Opsiyonel: per-email/identifier bucket de yapılsın mı? Email/identifier
   *  geliyorsa ek olarak aynı email için ayrı sayım. Brute-force eden
   *  IP rotate eder ama hep aynı email'e vurursa bu yakalar. */
  perIdentifier?: boolean
}

const PROD_AUTH_LIMITS = {
  signup: { key: "auth-signup", window: 3600, max: 10, perIdentifier: true },
  login: { key: "auth-login", window: 60, max: 15, perIdentifier: true },
  passwordResetRequest: {
    key: "auth-pw-reset",
    window: 3600,
    max: 5,
    perIdentifier: true,
  },
  passwordResetConfirm: {
    key: "auth-pw-reset-confirm",
    window: 600,
    max: 10,
    perIdentifier: false,
  },
  verifyEmail: {
    key: "auth-verify",
    window: 600,
    max: 20,
    perIdentifier: false,
  },
  refresh: { key: "auth-refresh", window: 60, max: 60, perIdentifier: false },
} as const satisfies Record<string, AuthRateLimitConfig>

export const AUTH_LIMITS = PROD_AUTH_LIMITS

/**
 * Per-(project, ip[, identifier]) rate limit check. Aşılırsa null yerine
 * RateLimitResult ile fail döner; caller bunu jsonError ile 429 yapar.
 */
export function checkAuthLimit(
  request: NextRequest,
  projectId: string,
  cfg: AuthRateLimitConfig,
  identifier?: string | null,
): RateLimitResult {
  const ipResult = checkRateLimit(request, {
    key: `${cfg.key}:p:${projectId}`,
    window: cfg.window,
    max: cfg.max,
  })
  if (!ipResult.allowed) return ipResult

  if (cfg.perIdentifier && identifier && identifier.trim()) {
    // Email-keyed bucket — IP rotate eden attacker'ı aynı email için
    // limitle. Bu helper aynı `checkRateLimit` interface'i kullanmıyor
    // çünkü identifier IP yerine geçiyor; pseudo-request ile çağıralım.
    const normalized = identifier.trim().toLowerCase()
    const pseudo = new Request("https://internal/identifier-bucket", {
      headers: { "x-real-ip": `id:${normalized}` },
    })
    const idResult = checkRateLimit(pseudo as unknown as NextRequest, {
      key: `${cfg.key}:p:${projectId}:id`,
      window: cfg.window,
      max: cfg.max * 2, // Daha gevşek — gerçek kullanıcı email değiştirir, IP sabit kalır
    })
    if (!idResult.allowed) return idResult
  }

  return ipResult
}

/**
 * Min-latency enforcement — başlangıçtan minMs geçmemişse fark kadar
 * sleep et. Email enumeration timing attack'ını uniform response süresi
 * ile maskeleyen iyi-bilinen pattern.
 *
 * Kullanım: handler'ın en başında `const start = Date.now()`, return
 * etmeden önce `await enforceMinLatency(start, 250)`.
 */
export async function enforceMinLatency(
  startedAt: number,
  minMs: number,
): Promise<void> {
  const elapsed = Date.now() - startedAt
  const remaining = minMs - elapsed
  if (remaining > 0) {
    await new Promise((r) => setTimeout(r, remaining))
  }
}
