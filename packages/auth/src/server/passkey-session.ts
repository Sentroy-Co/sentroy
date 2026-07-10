import { randomBytes, createHmac } from "node:crypto"
import { ObjectId } from "mongodb"
import { getDb } from "@workspace/db/client"
import { auth } from "@workspace/auth/server/auth"

/**
 * Better-auth session cookie bridge — passkey-style custom auth flow için.
 *
 * better-auth normalde sadece kendi `auth.api.signIn*` endpoint'leri
 * üzerinden session açar. Custom WebAuthn akışı better-auth'un dışında
 * gerçekleşir; verify başarılıysa burada manuel olarak:
 *
 *   1. session koleksiyonuna better-auth ile aynı şemada bir kayıt eklenir
 *   2. better-auth/better-call'un kullandığı imzalama algoritması ile
 *      cookie değeri üretilir (`<token>.<HMAC-SHA256-base64(token)>`)
 *   3. Caller'a Set-Cookie header değeri ve attribute'ları döner
 *
 * Bu yaklaşım better-auth'un `setSessionCookie` helper'ı ile aynı çıktıyı
 * üretir; mevcut middleware / `getAuthSession` aynen çalışır.
 */

const COOKIE_PREFIX = "better-auth"
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7 // 7d

/**
 * Better-auth cookie adı HTTPS production'da `__Secure-` prefix alıyor —
 * `createCookieGetter` (better-auth/cookies/index.mjs) baseURL https ile
 * başlıyorsa veya NODE_ENV=production ise SECURE_COOKIE_PREFIX ekliyor.
 *
 * Bizim manuel passkey session de aynı isim ile set etmek zorunda; aksi
 * halde server `findSession({ field: "token" })` cookie'yi okuyamaz ve
 * login fail olur.
 */
function sessionCookieName(): string {
  const baseURL = authBaseURL()
  const isSecure =
    baseURL.startsWith("https://") || process.env.NODE_ENV === "production"
  const base = `${COOKIE_PREFIX}.session_token`
  return isSecure ? `__Secure-${base}` : base
}

function authSecret(): string {
  // better-auth env'i okur; biz aynı secret'i kullanıp signature'ı match
  // edelim. AUTH_SECRET veya BETTER_AUTH_SECRET — ikisinden hangisi
  // tanımlıysa.
  const s = process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET
  if (!s) throw new Error("BETTER_AUTH_SECRET / AUTH_SECRET not configured")
  return s
}

async function makeSignature(value: string, secret: string): Promise<string> {
  // better-call's signCookieValue: HMAC-SHA256, base64 (NOT base64url),
  // sonra encodeURIComponent ile URL-safe yapılır.
  return createHmac("sha256", secret).update(value).digest("base64")
}

export interface IssuedSession {
  cookieName: string
  cookieValue: string
  cookieAttributes: {
    httpOnly: true
    sameSite: "lax" | "none"
    secure: boolean
    path: "/"
    maxAge: number
    domain?: string
  }
}

/**
 * Verilmiş userId için session oluşturur ve Set-Cookie değeri üretir.
 * Caller `NextResponse` üzerinde `cookies.set(...)` ya da raw header
 * olarak ekleyebilir.
 */
export async function issueSessionForUser(
  userId: string,
  meta: {
    ipAddress?: string
    userAgent?: string
  } = {},
): Promise<IssuedSession> {
  const db = await getDb()
  const token = randomBytes(32).toString("hex")
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000)

  // better-auth mongo-adapter userId'yi ObjectId olarak saklayabiliyor;
  // ama tutarlılık için string saklayalım — getAuthSession her ikisini
  // de eşleştirir.
  await db.collection("session").insertOne({
    token,
    userId,
    expiresAt,
    createdAt: now,
    updatedAt: now,
    ipAddress: meta.ipAddress ?? null,
    userAgent: meta.userAgent ?? null,
  })

  const signature = await makeSignature(token, authSecret())
  // Better-auth signed cookie değerini RAW yazar (encode etmez —
  // better-call/cookies.mjs `serializeSignedCookie` `_serialize`'a
  // direct geçiriyor). Bizim de encodeURIComponent yapmamız gerekmez;
  // aksi halde server `parseCookies` decode ederken byte mismatch.
  const cookieValue = `${token}.${signature}`

  // Cookie attribute'ları auth.ts ile uyumlu: cross-subdomain cookie
  // production'da `.sentroy.com` domain'i + secure + sameSite lax,
  // local dev'de domain yok.
  const domain = process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined
  const cookieName = sessionCookieName()
  // __Secure- prefix'li cookie'ler RFC gereği secure=true zorunlu.
  const secure =
    cookieName.startsWith("__Secure-") ||
    !!domain ||
    process.env.NODE_ENV === "production"

  return {
    cookieName,
    cookieValue,
    cookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
      domain,
    },
  }
}

/** Auth tarafının base URL'ini döndüren küçük helper — RP origin için. */
export function authBaseURL(): string {
  return (
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "http://localhost:3000"
  )
}

/**
 * WebAuthn `expectedOrigin` için tam liste — kullanıcı hangi subdomain'de
 * (core/mail/storage) passkey ekliyorsa o origin'in matchlemesi gerek.
 *
 * Begin endpoint'inde kullanılan `rpID` (BETTER_AUTH_URL hostname'i) bütün
 * subdomain'leri kapsadığı için browser passkey'i kabul ediyor; ama
 * `verifyRegistration/Authentication` `clientDataJSON.origin`'u tek-tek
 * eşleştirir. Tek BETTER_AUTH_URL geçtiğinde kullanıcı mail.sentroy.com'dan
 * ekleyince fail oluyordu.
 *
 * NEXT_PUBLIC_* env'leri runtime'da set edildiği için server-side
 * okuyabiliyoruz; dev'de hepsi tanımsız → BETTER_AUTH_URL fallback.
 */
export function passkeyAllowedOrigins(): string[] {
  const set = new Set<string>()
  for (const name of [
    "BETTER_AUTH_URL",
    "NEXT_PUBLIC_BASE_URL",
    "NEXT_PUBLIC_CORE_APP_URL",
    "NEXT_PUBLIC_MAIL_APP_URL",
    "NEXT_PUBLIC_STORAGE_APP_URL",
  ]) {
    const v = process.env[name]
    if (v) set.add(v.replace(/\/+$/, ""))
  }
  if (set.size === 0) set.add("http://localhost:3000")
  return Array.from(set)
}

// Sadece auth'un her zaman boot olmasını garantilemek için (top-level
// import side-effect'i tetikler). better-auth instance kullanılmıyor ama
// import grafiğinde tutmak istiyoruz ki secret config edilsin.
void auth
