import type { NextRequest } from "next/server"

/**
 * Process-local in-memory rate limiter for custom Next.js route handlers
 * (better-auth'un kendi `/api/auth/*` endpoint'lerini bypass eden custom
 * akışlar için: `/api/auth/recover-by-slug`, `/api/passkey/*`, vb).
 *
 * **Limit'ler:**
 * - Single-instance: bu in-memory bucket yeterli; her process kendi
 *   counter'ını tutar.
 * - Multi-instance ya da edge runtime: Redis/secondary-storage gerekli;
 *   bu helper interface'i koruyup storage'ı swap edebilirsin.
 *
 * **IP extraction:** reverse proxy (Coolify/Cloudflare) arkasında
 * `cf-connecting-ip` > `x-forwarded-for` (ilk hop) > `x-real-ip` >
 * fallback "unknown". Spoof koruması için trust-proxy varsayımına
 * güveniyoruz — Coolify network'unde sadece Cloudflare/proxy'imiz
 * `x-forwarded-for` set eder.
 */

export interface RateLimitOptions {
  /** Time window in seconds. */
  window: number
  /** Max requests allowed within the window. */
  max: number
  /**
   * Bucket key prefix — endpoint identifier. Aynı IP farklı endpoint'lerde
   * ayrı sayılır (e.g., "recover-by-slug" vs "passkey-begin").
   */
  key: string
}

export interface RateLimitResult {
  allowed: boolean
  /** Saniye cinsinden ne kadar sonra yeni deneme yapılabilir (allowed=false ise). */
  retryAfter: number
  /** Window içinde yapılan toplam deneme sayısı. */
  count: number
}

interface Bucket {
  count: number
  resetAt: number
}

const store = new Map<string, Bucket>()

// Cleanup loop — process boyunca expire bucket'ları temizle, memory leak yok.
// 60 sn interval; tek process'te sayım küçük.
let cleanupTimer: ReturnType<typeof setInterval> | null = null
function ensureCleanupRunning() {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, bucket] of store) {
      if (bucket.resetAt <= now) store.delete(key)
    }
  }, 60_000)
  // Node `unref` — bu interval main loop'u block etmesin (test/serverless OK).
  if (typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    ;(cleanupTimer as unknown as { unref: () => void }).unref()
  }
}

export function getClientIp(request: NextRequest | Request): string {
  const headers =
    "headers" in request ? request.headers : (request as Request).headers
  const cf = headers.get("cf-connecting-ip")
  if (cf) return cf.trim()
  const xff = headers.get("x-forwarded-for")
  if (xff) {
    // İlk hop = orijinal client IP. Sonraki entry'ler proxy zinciri.
    const first = xff.split(",")[0]
    if (first) return first.trim()
  }
  const xri = headers.get("x-real-ip")
  if (xri) return xri.trim()
  return "unknown"
}

/**
 * Rate-limit kontrolü. `allowed: false` ise route 429 döndürmeli ve
 * `Retry-After: <retryAfter>` header'ı set etmeli.
 *
 * Idempotent değil — her çağrı counter'ı 1 artırır (allowed=false ise
 * de). Bu kasıtlı: brute-force eden attacker rate-limit duvarına
 * çarptıkça counter da artıyor → window dolu olduğu sürece kapı kapalı.
 */
export function checkRateLimit(
  request: NextRequest | Request,
  options: RateLimitOptions,
): RateLimitResult {
  ensureCleanupRunning()
  const ip = getClientIp(request)
  const bucketKey = `${options.key}:${ip}`
  const now = Date.now()
  const windowMs = options.window * 1000

  const existing = store.get(bucketKey)
  if (!existing || existing.resetAt <= now) {
    store.set(bucketKey, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfter: 0, count: 1 }
  }

  existing.count++
  if (existing.count > options.max) {
    return {
      allowed: false,
      retryAfter: Math.ceil((existing.resetAt - now) / 1000),
      count: existing.count,
    }
  }
  return { allowed: true, retryAfter: 0, count: existing.count }
}

export interface RateLimitStatus {
  /** count < max ise true (yeni işlem yapılabilir). */
  allowed: boolean
  /** Window içinde kullanılan sayı. */
  count: number
  /** Kalan hak (max - count, en az 0). */
  remaining: number
  /** Window sıfırlanma zamanı (epoch ms). */
  resetAt: number
  /** Sıfırlanmaya kalan saniye. */
  retryAfter: number
}

/**
 * Counter'ı ARTIRMADAN mevcut kullanımı döndürür — UI'da "kalan hak"
 * göstermek / quota peek için. Bucket yoksa veya expire ise sıfırdan başlar.
 */
export function peekRateLimit(
  request: NextRequest | Request,
  options: RateLimitOptions,
): RateLimitStatus {
  const ip = getClientIp(request)
  const bucketKey = `${options.key}:${ip}`
  const now = Date.now()
  const existing = store.get(bucketKey)
  if (!existing || existing.resetAt <= now) {
    return {
      allowed: true,
      count: 0,
      remaining: options.max,
      resetAt: now + options.window * 1000,
      retryAfter: 0,
    }
  }
  const remaining = Math.max(0, options.max - existing.count)
  return {
    allowed: existing.count < options.max,
    count: existing.count,
    remaining,
    resetAt: existing.resetAt,
    retryAfter: Math.ceil((existing.resetAt - now) / 1000),
  }
}

/**
 * Counter'ı 1 artırır ve yeni durumu döndürür — başarılı bir işlemden SONRA
 * "hak tüket" için (peek ile kontrol et, başarıda consume et → başarısız
 * işlemler hak yakmaz).
 */
export function consumeRateLimit(
  request: NextRequest | Request,
  options: RateLimitOptions,
): RateLimitStatus {
  ensureCleanupRunning()
  const ip = getClientIp(request)
  const bucketKey = `${options.key}:${ip}`
  const now = Date.now()
  const windowMs = options.window * 1000
  const existing = store.get(bucketKey)
  if (!existing || existing.resetAt <= now) {
    store.set(bucketKey, { count: 1, resetAt: now + windowMs })
    return {
      allowed: true,
      count: 1,
      remaining: Math.max(0, options.max - 1),
      resetAt: now + windowMs,
      retryAfter: 0,
    }
  }
  existing.count++
  return {
    allowed: existing.count <= options.max,
    count: existing.count,
    remaining: Math.max(0, options.max - existing.count),
    resetAt: existing.resetAt,
    retryAfter: Math.ceil((existing.resetAt - now) / 1000),
  }
}

/**
 * Rate-limit aşıldığında dönülecek standart response. Caller direkt
 * `return rateLimitResponse(result)` yapabilir.
 */
export function rateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: "Too many requests. Please try again later.",
      retryAfter: result.retryAfter,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfter),
      },
    },
  )
}
