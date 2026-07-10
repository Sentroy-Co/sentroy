import { ObjectId } from "mongodb"
import { betterAuth } from "better-auth"
import { mongodbAdapter } from "better-auth/adapters/mongodb"
import { createAuthMiddleware } from "better-auth/api"
import { twoFactor, magicLink, emailOTP } from "better-auth/plugins"
import { fetchIpInfo } from "@workspace/auth/lib/ipinfo"
import { dash } from "@better-auth/infra";
import { clientPromise } from "@workspace/db/client"
import { sendSystemMailEvent } from "@workspace/auth/server/system-mail-events"
import { userNotificationModel } from "@workspace/db/models"
import {
  signInBeforeHook,
  signInAfterHook,
} from "@workspace/auth/server/security-hooks"

// Default locale for transactional system mail. Better-auth callbacks
// don't carry a locale (no request context), and the user record has no
// preferredLanguage field today. Admins can flip this with the env
// `SYSTEM_MAIL_DEFAULT_LOCALE=tr` to flip the platform default to
// Turkish; per-user resolution can be added later by widening the user
// schema and threading the locale through the callbacks.
const SYSTEM_MAIL_DEFAULT_LOCALE = (
  process.env.SYSTEM_MAIL_DEFAULT_LOCALE || "en"
).toLowerCase()

/**
 * better-auth'un ürettiği bazı default URL'ler locale-prefix'siz gelir
 * (örn. reset-password `${baseURL}/reset-password?...`). Bu sayfalar
 * `app/[lang]/(auth)/...` altında olduğundan locale segment'i olmadan 404 olur.
 * Bu helper origin'den sonra locale'i enjekte eder. Zaten locale'liyse veya bir
 * `/api/` yoluysa (lang gerekmez) dokunmaz; parse edilemezse olduğu gibi döner.
 */
function withMailLocale(rawUrl: string, locale: string): string {
  try {
    const u = new URL(rawUrl)
    if (u.pathname.startsWith("/api/")) return rawUrl
    if (/^\/(en|tr)(\/|$)/.test(u.pathname)) return rawUrl
    u.pathname = `/${locale}${u.pathname}`
    return u.toString()
  } catch {
    return rawUrl
  }
}

// Paylasilmis MongoDB client'i kullan — ayri bir MongoClient acma.
// clientPromise top-level promise'dir; modul seviyesinde await edilmez.
// Bunun yerine await sonucunu bloke etmeden cozup db'yi hazirliyoruz.
const client = await clientPromise
const db = client.db(process.env.MONGODB_DATABASE)

/** Request header'larından client IP'sini çıkarır (Cloudflare / proxy uyumlu). */
function extractIp(headers: Headers): string | undefined {
  const cfIp = headers.get("cf-connecting-ip")
  if (cfIp) return cfIp
  const forwarded = headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  const realIp = headers.get("x-real-ip")
  if (realIp) return realIp
  return undefined
}

const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
const githubClientId = process.env.GITHUB_CLIENT_ID
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET

// Env'de credentials tanımlı olan provider'ları topla
const socialProviders: Record<
  string,
  { clientId: string; clientSecret: string }
> = {}
if (googleClientId && googleClientSecret) {
  socialProviders.google = {
    clientId: googleClientId,
    clientSecret: googleClientSecret,
  }
}
if (githubClientId && githubClientSecret) {
  socialProviders.github = {
    clientId: githubClientId,
    clientSecret: githubClientSecret,
  }
}

const trustedProviders = Object.keys(socialProviders)

/**
 * Cross-subdomain cookie domain — prod'da ".sentroy.com" olarak geçip
 * core + mail + storage subdomain'lerinin aynı oturum cookie'sini
 * paylaşmasını sağlar. Local dev'de boş bırakılır (her port kendi
 * cookie'sini kullanır).
 *
 * `AUTH_COOKIE_DOMAIN=.sentroy.com` env değeri prod'da, dev'de
 * unset kalır.
 */
const cookieDomain = process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined

/**
 * E-posta doğrulama zorunluluğu — self-host'ta mail yığını olmadan signup/login
 * için kapatılabilir (REQUIRE_EMAIL_VERIFICATION=false). Env UNSET → "true"
 * (hosted davranışı AYNEN korunur); yalnız açık `false/0/off/no` kapatır.
 * Aynı değer hem emailVerification.sendOnSignUp/SignIn hem
 * emailAndPassword.requireEmailVerification'a beslenir → kapalıyken (no-op)
 * doğrulama maili de tetiklenmez ve signup doğrudan session açar.
 */
const requireEmailVerification = !/^(0|false|off|no)$/i.test(
  (process.env.REQUIRE_EMAIL_VERIFICATION ?? "true").trim(),
)

export const auth = betterAuth({
  appName: "Sentroy",
  baseURL: process.env.BETTER_AUTH_URL,
  database: mongodbAdapter(db),
  trustedOrigins: (process.env.AUTH_TRUSTED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  advanced: cookieDomain
    ? {
        crossSubDomainCookies: {
          enabled: true,
          domain: cookieDomain,
        },
        defaultCookieAttributes: {
          sameSite: "lax",
          secure: true,
        },
      }
    : undefined,
  /**
   * Yeni signup'ta otomatik doğrulama maili gönderilir; kullanıcı linke
   * tıklayınca better-auth'un /verify-email endpoint'i çalışır →
   * `autoSignInAfterVerification: true` olduğu için aynı request'te
   * session açılır → callbackURL'e (locale-aware /d) yönlenir.
   *
   * `requireEmailVerification` kapalı bırakıldı: mevcut kullanıcılar (önceki
   * release'lerde verified=false ile kayıt olmuş olabilir) aniden login
   * edemez hale gelmesin. UI tarafında signup sonrası "inbox kontrol et"
   * notice'ı göstereceğiz.
   */
  emailVerification: {
    sendOnSignUp: requireEmailVerification,
    sendOnSignIn: requireEmailVerification,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url, token }) => {
      // Better-auth'un default `url`'i `${baseURL}/api/auth/verify-email?...` —
      // user'a raw JSON gösteren bir endpoint. Bunun yerine kendi friendly
      // landing page'imize yönlendiriyoruz; o page server-side verification
      // çağrısını kendi yapar ve durumu (success/expired/invalid) gösterir.
      const baseURL = process.env.BETTER_AUTH_URL || new URL(url).origin
      // Verify landing page `app/[lang]/(auth)/verify-email/page.tsx`
      // altında — locale segment'i olmadan route resolve etmiyor.
      // SYSTEM_MAIL_DEFAULT_LOCALE her zaman set (en/tr), prepend ediyoruz.
      const friendlyUrl = `${baseURL}/${SYSTEM_MAIL_DEFAULT_LOCALE}/verify-email?token=${encodeURIComponent(token)}`
      const result = await sendSystemMailEvent("auth.verify-email", {
        to: user.email,
        locale: SYSTEM_MAIL_DEFAULT_LOCALE,
        variables: {
          userName: user.name || user.email,
          userEmail: user.email,
          verifyUrl: friendlyUrl,
        },
      })
      if (!result.sent) {
        console.warn(
          `[auth] sendVerificationEmail skipped (${result.reason ?? "unknown"})`,
        )
      }

      // In-app notification — kullanıcı dashboard'a girince inbox bell'inde
      // "verification email sent" bildirimini görsün. Best-effort, fail
      // bypass; mail gönderildi mesaj UI'da daha hassas (toast).
      userNotificationModel
        .create({
          userId: user.id,
          type: "system",
          title: "Verification email sent",
          body: "Open the link we just emailed you to finish verifying your address.",
          href: "/verify-email-pending",
          meta: { email: user.email },
        })
        .catch((err) =>
          console.warn("[auth] verification notification failed:", err),
        )
    },
  },
  emailAndPassword: {
    enabled: true,
    /**
     * Yeni hesaplar e-postalarını doğrulamadan sign-in açamaz. Mevcut
     * verified=false hesaplar bir sonraki login denemelerinde
     * `sendOnSignIn: true` ile otomatik doğrulama maili alır → kullanıcı
     * linke tıklar → `autoSignInAfterVerification: true` session'ı açar.
     * Self-host: REQUIRE_EMAIL_VERIFICATION=false → mail yığını olmadan login.
     */
    requireEmailVerification,
    /**
     * Şifre sıfırlama maili — sender registry'sini (apps/core
     * instrumentation.ts'te set edilir) çağırır. Sender kurulu değilse
     * silently no-op; user akış kırılmaz, kullanıcıya generic "if your
     * email exists you'll receive a link" mesajı gösterilir.
     */
    sendResetPassword: async ({ user, url }) => {
      // better-auth'un default reset url'i locale-prefix'siz → `[lang]` route'u
      // 404 verir. Origin'den sonra locale enjekte et (verify-email ile tutarlı).
      const resetUrl = withMailLocale(url, SYSTEM_MAIL_DEFAULT_LOCALE)
      const result = await sendSystemMailEvent("auth.reset-password", {
        to: user.email,
        locale: SYSTEM_MAIL_DEFAULT_LOCALE,
        variables: {
          userEmail: user.email,
          resetUrl,
        },
      })
      if (!result.sent) {
        console.warn(
          `[auth] sendResetPassword skipped (${result.reason ?? "unknown"})`,
        )
      }
    },
  },
  // Social providers — credentials env'de varsa aktif olur
  socialProviders:
    Object.keys(socialProviders).length > 0 ? socialProviders : undefined,
  // Farklı provider'lar aynı hesaba bağlanabilir
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders,
      // Kullanicinin Google/GitHub hesabinin email'i ana hesap email'i ile
      // uyusmak zorunda degil. linkSocial cagrisi zaten oturum acmis bir
      // kullanici tarafindan yapildigi icin guvenli.
      allowDifferentEmails: true,
    },
  },
  /**
   * Rate limiting — better-auth tüm `/api/auth/*` endpoint'leri için
   * IP-based rate limit uygular. Default 100 req / 10s; auth-sensitive
   * endpoint'lerde sıkılaştırıyoruz:
   *
   * - `/sign-in/email`     → 5 deneme / 5 dk  (brute force koruması)
   * - `/sign-up/email`     → 3 deneme / 15 dk (spam hesap koruması)
   * - `/request-password-reset` → 3 deneme / 1 saat (kullanıcının inbox'ı bombalanmasın)
   * - `/two-factor/verify` → 10 deneme / 5 dk (2FA kod brute force)
   *
   * Storage memory (default) — single-instance Coolify deploy için yeterli.
   * Multi-instance scale ederken Redis'e taşı: `storage: "secondary-storage"`.
   *
   * `enabled: true` — dev'de de aktif; production-only default'u geçersiz
   * kılıyoruz çünkü dev'de test ederken limit'leri görmek istiyoruz
   * (özellikle yeni kuralları doğrularken).
   */
  rateLimit: {
    enabled: true,
    window: 10,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 300, max: 5 },
      "/sign-up/email": { window: 900, max: 3 },
      "/request-password-reset": { window: 3600, max: 3 },
      "/two-factor/verify": { window: 300, max: 10 },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
      },
      status: {
        type: "string",
        defaultValue: "active",
      },
      planId: {
        type: "string",
        required: false,
      },
      lastLoginAt: {
        type: "date",
        required: false,
      },
      // Public profile alanları — hiçbiri zorunlu değil. Kullanıcı
      // /profile sayfasından doldurur; profileSlug set edilirse
      // /profile/u/{slug} URL'inden public erişilir, isPublicProfile=false
      // ise public endpoint 404 döner. Avatar (image) zaten built-in.
      profileSlug: { type: "string", required: false },
      bio: { type: "string", required: false },
      headline: { type: "string", required: false },
      location: { type: "string", required: false },
      website: { type: "string", required: false },
      coverImage: { type: "string", required: false },
      isPublicProfile: { type: "boolean", required: false },
    },
  },
  plugins: [
    twoFactor({
      skipVerificationOnEnable: false,
      // OAuth-only kullanıcılar (Google vb.) şifre olmadan 2FA yönetebilir.
      // Credential account'u olanlar için şifre yine gerekir.
      allowPasswordless: true,
    }),
    /**
     * Magic link login — kullanıcı şifre yerine inbox'una gelen tek-tıklık
     * link ile login olur. 5 dk expiry, 1 deneme; yanlış token kullanılırsa
     * link tüketilir → güvenli.
     */
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        const result = await sendSystemMailEvent("auth.magic-link", {
          to: email,
          locale: SYSTEM_MAIL_DEFAULT_LOCALE,
          variables: { userEmail: email, magicUrl: url },
        })
        if (!result.sent) {
          console.warn(
            `[auth] sendMagicLink skipped (${result.reason ?? "unknown"})`,
          )
        }
      },
    }),
    /**
     * Email OTP — şifre yerine 6 haneli kod ile login. Magic link'e
     * alternatif: link açılmıyorsa (mobil POS, kişisel olmayan cihaz vb.)
     * kullanıcı kodu manuel okuyup yazabilir.
     */
    emailOTP({
      sendVerificationOTP: async ({ email, otp, type }) => {
        const eventKey =
          type === "sign-in"
            ? "auth.otp.sign-in"
            : type === "email-verification"
            ? "auth.otp.email-verification"
            : type === "forget-password"
            ? "auth.otp.forget-password"
            : "auth.otp.generic"
        const result = await sendSystemMailEvent(eventKey, {
          to: email,
          locale: SYSTEM_MAIL_DEFAULT_LOCALE,
          variables: { userEmail: email, otp },
        })
        if (!result.sent) {
          console.warn(
            `[auth] sendVerificationOTP skipped (${result.reason ?? "unknown"})`,
          )
        }
      },
    }),
    dash()
  ],
  hooks: {
    /**
     * Sign-in öncesi güvenlik kontrolleri — security-hooks.ts modülünde
     * (account lockout, server-side honeypot, Cloudflare Turnstile).
     * Sadece `/sign-in/email` path'i yakalanır; diğer endpoint'ler
     * ekstra middleware geçirmeden devam eder.
     */
    before: signInBeforeHook,
    after: createAuthMiddleware(async (ctx) => {
      // Önce security-hook'un after kısmını çağır — failed-attempt
      // tracking + new-device alert. Path filter'ı kendi içinde, başka
      // path'lerde no-op.
      try {
        await signInAfterHook(ctx)
      } catch (err) {
        // Security side-effects auth akışını kırmasın (yan etki best-effort).
        console.warn("[auth] security after-hook error:", err)
      }

      // ── Mevcut session enrichment (IP info) — sign-in/sign-up/social
      //    callback'inde çalışır, session koleksiyonunu IP/UA/IPInfo
      //    metadata'sıyla zenginleştirir. */
      const path = ctx.path
      if (
        path !== "/sign-in/email" &&
        path !== "/sign-up/email" &&
        path !== "/sign-in/social" &&
        path !== "/callback/:id"
      ) {
        return
      }

      const newSession = ctx.context.newSession
      if (!newSession?.session?.token) return

      // Son giriş zamanı — admin panel "Last login" sütunu için. Best-effort
      // (await etmeyiz; auth response'unu bekletmesin). additionalFields'taki
      // lastLoginAt hiçbir akışta set edilmiyordu → her zaman boş görünüyordu.
      const loggedInUserId = newSession.session?.userId
      if (loggedInUserId) {
        const loginAt = new Date()
        let userFilter: Record<string, unknown> = { _id: loggedInUserId }
        try {
          userFilter = { _id: new ObjectId(loggedInUserId) }
        } catch {
          /* string id — olduğu gibi bırak */
        }
        db.collection("user")
          .updateOne(userFilter, { $set: { lastLoginAt: loginAt } })
          .catch((err) => console.error("[auth] lastLoginAt update failed:", err))
      }

      const req = ctx.request
      if (!req) return

      const ip = extractIp(req.headers)
      const userAgent = req.headers.get("user-agent") || undefined

      // IPInfo — asenkron arka plan olarak yap, auth response'u bekletme
      fetchIpInfo(ip || "")
        .then((ipInfo) => {
          const update: Record<string, unknown> = {}
          if (ip) update.ipAddress = ip
          if (userAgent) update.userAgent = userAgent
          if (ipInfo) update.ipInfo = ipInfo
          if (Object.keys(update).length === 0) return
          return db
            .collection("session")
            .updateOne(
              { token: newSession.session.token },
              { $set: update },
            )
        })
        .catch((err) => {
          console.error("[auth] session enrichment failed:", err)
        })
    }),
  },
})
