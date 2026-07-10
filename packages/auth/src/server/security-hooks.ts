import { createAuthMiddleware, APIError } from "better-auth/api"
import { failedLoginAttemptModel } from "@workspace/db/models"
import { getDb } from "@workspace/db/client"
import { ObjectId } from "mongodb"
import { sendSystemMailEvent } from "@workspace/auth/server/system-mail-events"
import {
  isHoneypotFilledOnServer,
  verifyTurnstileToken,
} from "./security-protections"

// auth.ts'tekiyle aynı default — hook contextinde request locale bilgisi
// yok, system-mail için tek-noktadan gelen platform default'unu kullanırız.
const SYSTEM_MAIL_DEFAULT_LOCALE = (
  process.env.SYSTEM_MAIL_DEFAULT_LOCALE || "en"
).toLowerCase()

/**
 * Better-auth `hooks.before` ve `hooks.after` middleware'leri — sign-in
 * akışına şu güvenlik katmanlarını enjekte eder:
 *
 *  • **Account lockout**: aynı email'e karşı çok sayıda başarısız deneme
 *    olduğunda hesap geçici kilitlenir. IP-based rate-limit'in tamamlayıcısı:
 *    attacker IP rotasyonuyla rate-limit'i aşsa bile email-bazlı eşik onu
 *    durdurur.
 *  • **Failed-attempt tracking**: 401 dönen sign-in girişimini sayar ve
 *    eşik üstünde lockout'u tetikler.
 *  • **Successful-login cleanup**: 200 sign-in counter'ı sıfırlar.
 *  • **New-device alert**: kullanıcı için bilinmeyen IP'den login geldiyse
 *    `auth.new-device-login` mail event'ini fire eder. "Bilinmeyen" =
 *    bu user'ın session koleksiyonunda son 90 gün içinde bu IP'den hiç
 *    kayıt yok demek.
 *  • **Honeypot + Turnstile** (opsiyonel) — request body'sinde varsa
 *    server-side doğrula.
 *
 * Hata politikası: Lockout/honeypot/turnstile fail HARD'dır (APIError).
 * Yan etkili olanlar (failed counter increment, mail) try/catch ile
 * yumuşatılır → main auth path'i bozmasın.
 */

const NEW_DEVICE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000 // 90 gün

function clientIpFrom(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  )
}

function shortUserAgent(ua: string | null): string {
  if (!ua) return "unknown"
  // Compact form: kısa marka + OS — full UA token zinciri email'de gürültü
  const brand =
    /Edg\/(\d+)/.exec(ua)?.[0] ??
    /Chrome\/(\d+)/.exec(ua)?.[0] ??
    /Firefox\/(\d+)/.exec(ua)?.[0] ??
    /Safari\/(\d+)/.exec(ua)?.[0] ??
    "Browser"
  const os = /\((Windows|Macintosh|Linux|Android|iPhone|iPad)[^)]*\)/.exec(ua)?.[1] ?? ""
  return os ? `${brand} / ${os}` : brand
}

interface SignInRequestBody {
  email?: string
  password?: string
  /** Honeypot bot tuzağı — non-empty ise bot. */
  website?: string
  /** Cloudflare Turnstile doğrulama tokenı. */
  cfTurnstileToken?: string
}

/**
 * Email + password sign-in için before-hook:
 *   1. Honeypot kontrolü (server-side defense — client honeypot bypass ediliyorsa)
 *   2. Turnstile token doğrulaması (env'de yapılandırıldıysa)
 *   3. Account lockout kontrolü
 */
/**
 * Tüm /sign-in/email, /sign-up/email ve /request-password-reset
 * endpoint'lerinde honeypot + Turnstile koruması; lockout sadece
 * /sign-in/email'de (signup/forgot için lockout anlamsız).
 */
const PROTECTED_PATHS = new Set([
  "/sign-in/email",
  "/sign-up/email",
  "/request-password-reset",
])

export const signInBeforeHook = createAuthMiddleware(async (ctx) => {
  if (!PROTECTED_PATHS.has(ctx.path)) return

  const body = (ctx.body ?? {}) as SignInRequestBody

  // Honeypot — sunucu tarafı kontrol; client formundan gelen `website`
  // alanı dolu ise bot. Generic 401 dön; ayrı status verirsek attacker
  // bunu sinyal olarak görür ve honeypot'tan kaçınır.
  if (isHoneypotFilledOnServer(body)) {
    await new Promise((r) => setTimeout(r, 250 + Math.random() * 1250))
    throw new APIError("UNAUTHORIZED", { message: "Invalid request" })
  }

  // Turnstile — `BETTER_AUTH_TURNSTILE_SECRET` set edilmişse zorunlu.
  // Token yok ya da invalid → 403. Set edilmediği ortamlarda
  // `verifyTurnstileToken` no-op true döner (geri uyumluluk).
  const turnstileResult = await verifyTurnstileToken(
    body.cfTurnstileToken,
    clientIpFrom(ctx.request?.headers ?? new Headers()),
  )
  if (!turnstileResult.ok) {
    // Diagnostic mesajı: client toast'ında reason görünür ki user
    // hangi yapılandırma adımını kaçırdığını anlasın. Production'da
    // bu mesaj end-user'a leak — kabul edilebilir, çünkü Turnstile
    // failure modları tek tek attacker için bilgisi olmayan teknik
    // string'ler (örn. "missing_token", "invalid-input-secret").
    throw new APIError("FORBIDDEN", {
      message: `Captcha verification failed (${turnstileResult.reason})`,
      code: "CAPTCHA_FAILED",
    })
  }

  // Account lockout — sadece sign-in için anlamlı (signup hesap yoksa
  // başarısız attempt yapmıyor; forgot-password rate-limit'le yeterince
  // korunuyor).
  if (ctx.path === "/sign-in/email") {
    const email = (body.email || "").trim().toLowerCase()
    if (!email) return
    const lock = await failedLoginAttemptModel.getLockStatus(email)
    if (lock.locked && lock.until) {
      const retryAfter = Math.ceil((lock.until.getTime() - Date.now()) / 1000)
      throw new APIError("TOO_MANY_REQUESTS", {
        message: `Account temporarily locked due to too many failed attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
        code: "ACCOUNT_LOCKED",
      })
    }
  }
})

/**
 * Email + password sign-in için after-hook:
 *   1. 4xx → recordFailure: failed counter artar, eşik aşılırsa lockout.
 *   2. 2xx → clearAttempts + new-device alert (opsiyonel).
 *
 * Better-auth hook'ta response status'una `ctx.context.returned` üzerinden
 * erişiriz; APIError throw edildiyse `returned` instanceof APIError olur,
 * başarılıysa user/session bilgisi içerir.
 */
export const signInAfterHook = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/sign-in/email") return

  const body = (ctx.body ?? {}) as SignInRequestBody
  const email = (body.email || "").trim().toLowerCase()
  if (!email) return

  const returned = (ctx.context as { returned?: unknown }).returned
  const isFail =
    returned instanceof APIError ||
    (returned &&
      typeof returned === "object" &&
      "status" in returned &&
      typeof (returned as { status?: number }).status === "number" &&
      ((returned as { status: number }).status >= 400))

  if (isFail) {
    try {
      await failedLoginAttemptModel.recordFailure(email)
    } catch (err) {
      console.warn("[security-hooks] recordFailure failed:", err)
    }
    return
  }

  // ── Success path ────────────────────────────────────────────────────
  try {
    await failedLoginAttemptModel.clearAttempts(email)
  } catch (err) {
    console.warn("[security-hooks] clearAttempts failed:", err)
  }

  // New-device alert — best-effort; session yaratıldıktan SONRA çalışır,
  // user.id'ye `returned` üzerinden erişiriz (better-auth setSession callback'i
  // user objesini doldurmuş olur).
  try {
    const data = returned as
      | { user?: { id?: string; email?: string; name?: string } }
      | undefined
    const userId = data?.user?.id
    if (!userId) return
    const ip = clientIpFrom(ctx.request?.headers ?? new Headers())
    const ua = shortUserAgent(ctx.request?.headers?.get("user-agent") ?? null)

    // 90 gün içinde aynı IP'den session var mı? Varsa "yeni cihaz değil"
    // → alert gönderme. session koleksiyonunda `userId` ObjectId, `ipAddress`
    // string olarak tutuluyor (better-auth default).
    const db = await getDb()
    const cutoff = new Date(Date.now() - NEW_DEVICE_WINDOW_MS)
    const existingSession = await db.collection("session").findOne({
      userId: new ObjectId(userId),
      ipAddress: ip,
      createdAt: { $gte: cutoff },
    })
    // Şu anki sign-in'in oluşturduğu session da eşleşir; o yüzden
    // 1'den fazla mı bakıyoruz: ilkini bu session sayar, ikincisi varsa
    // gerçekten önceden de gelmiş demektir.
    const sessionCount = await db.collection("session").countDocuments(
      {
        userId: new ObjectId(userId),
        ipAddress: ip,
        createdAt: { $gte: cutoff },
      },
      { limit: 2 },
    )
    void existingSession
    if (sessionCount > 1) return // daha önce de görülmüş, yeni cihaz değil

    const baseUrl =
      process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_CORE_APP_URL || ""
    const sessionsUrl = baseUrl
      ? `${baseUrl}/${SYSTEM_MAIL_DEFAULT_LOCALE}/profile`
      : "/profile"
    const loginTime = new Date()
      .toISOString()
      .replace("T", " ")
      .slice(0, 16) + " UTC"

    await sendSystemMailEvent("auth.new-device-login", {
      to: data?.user?.email ?? email,
      locale: SYSTEM_MAIL_DEFAULT_LOCALE,
      variables: {
        userName: data?.user?.name ?? data?.user?.email ?? email,
        userEmail: data?.user?.email ?? email,
        ipAddress: ip,
        userAgent: ua,
        loginTime,
        sessionsUrl,
      },
    })
  } catch (err) {
    console.warn("[security-hooks] new-device alert failed:", err)
  }
})
