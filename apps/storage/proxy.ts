import createMiddleware from "next-intl/middleware"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { routing } from "@workspace/auth/i18n/routing"
import { serverRootDomain, trustedOriginRegex } from "@workspace/auth/lib/domains"

const intlMiddleware = createMiddleware(routing)

const CORE_URL =
  process.env.NEXT_PUBLIC_CORE_APP_URL ||
  process.env.CORE_APP_URL ||
  "https://sentroy.com"

// `request.nextUrl.origin` Next.js standalone'da `HOSTNAME:PORT`
// (Dockerfile'da `0.0.0.0:3002`) döner, public URL'i değil. Reverse proxy
// arkasında callbackUrl olarak `https://0.0.0.0:3002` dönerdi → env'den okuyalım.
const PUBLIC_URL =
  process.env.NEXT_PUBLIC_STORAGE_APP_URL || "https://storage.sentroy.com"

/**
 * CORS gate for `/api/*`. Sentroy client SDKs run from arbitrary
 * browser origins (3rd-party apps, demo playgrounds, the gateway on
 * sentroy.com). The cookie auth flow in `client-sdk/typescript/src/http.ts`
 * issues `credentials: include` when no bearer token is configured, and
 * that mode rejects a `*` wildcard — we must echo `Origin` and stamp
 * `Allow-Credentials: true`. Wildcard remains as a fallback only when
 * `Origin` is missing (server-to-server callers).
 */
const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
const ALLOWED_HEADERS =
  "Authorization, Content-Type, X-Requested-With, Accept, X-Sentroy-Company-Slug, X-Sentroy-Bucket-Slug, X-Sentroy-Source"

// Kimlikli (cookie) CORS yalnız güvenilir *.sentroy.com + localhost origin'e;
// diğer origin (3rd-party browser SDK) Bearer stk_ token kullanmalı —
// credentials VERİLMEZ, böylece kötü site kurbanın session cookie'siyle
// credentialed istek atıp cevabı okuyamaz (credential theft / data exfil).
// Tek kök domain'den türetilir (default sentroy.com — mevcut davranış aynı).
const TRUSTED_ORIGIN_RE = trustedOriginRegex(serverRootDomain())
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i

function isTrustedOrigin(origin: string | null): boolean {
  return (
    !!origin && (TRUSTED_ORIGIN_RE.test(origin) || LOCAL_ORIGIN_RE.test(origin))
  )
}

function corsHeaders(origin: string | null): Record<string, string> {
  const base: Record<string, string> = {
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  }
  if (isTrustedOrigin(origin)) {
    base["Access-Control-Allow-Origin"] = origin as string
    base["Access-Control-Allow-Credentials"] = "true"
  } else {
    base["Access-Control-Allow-Origin"] = origin || "*"
  }
  return base
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // `/f/[id]` public dosya kısa URL'i — i18n locale prefix uygulanmasın
  // (`/en/f/...` gibi yönlendirme route handler'ı 404'e atar) ve session
  // cookie kontrolü yapılmasın (auth-less public path). Erken return ile
  // middleware tamamen bypass.
  if (pathname.startsWith("/f/")) {
    return NextResponse.next()
  }

  // `/embed/[id]` — public iframe-friendly player. Same auth-less +
  // no-locale-prefix treatment as `/f/`. Embedded on third-party
  // sites, must not redirect to /login on a missing session cookie.
  if (pathname.startsWith("/embed/")) {
    return NextResponse.next()
  }

  // `/v/[id]` — link ile paylaşılan dosyanın zengin (Drive-tarzı) görüntüleyici
  // sayfası. Public dosyada anonim erişilir → session cookie kontrolü + locale
  // prefix uygulanmasın (aksi halde login'e redirect edilir, paylaşım linki
  // kırılır). Erişim kontrolü sayfanın kendi public gate'inde yapılır.
  if (pathname.startsWith("/v/")) {
    return NextResponse.next()
  }

  // `/api/companies/<slug>/buckets/<bucket>/media/<id>/download` — public
  // bucket modunda `*` wildcard ile herkesin erişebilmesi gerek; proxy
  // burada CORS'u handler'a bırakır ki public path Access-Control-Allow-
  // Origin: * yazabilsin (credentials: include zaten reddedilir).
  // Private branch'te handler CORS yazmaz, browser'ın varsayılan SOP
  // koruması devreye girer (yine güvende).
  const isPublicDownloadPath =
    /^\/api\/companies\/[^/]+\/buckets\/[^/]+\/media\/[^/]+\/download(?:\/|$)/.test(
      pathname,
    )
  if (isPublicDownloadPath) {
    return NextResponse.next()
  }

  if (pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin")
    if (request.method === "OPTIONS") {
      return new NextResponse(null, {
        status: 204,
        headers: corsHeaders(origin),
      })
    }
    const apiRes = NextResponse.next()
    for (const [key, value] of Object.entries(corsHeaders(origin))) {
      apiRes.headers.set(key, value)
    }
    return apiRes
  }

  const response = intlMiddleware(request)

  // Locale root (`/tr`, `/en`, `/tr/`, `/en/`) anonim ziyaretçilere açık —
  // storage subdomain'in pazarlama landing'i burada render edilir
  // (bkz. `app/[lang]/page.tsx`). Yalnızca `/d/...` altındaki dashboard
  // route'ları session zorunlu.
  const isLocaleRoot = /^\/(en|tr)\/?$/.test(pathname)
  if (isLocaleRoot) {
    return response
  }

  const sessionCookie =
    request.cookies.get("better-auth.session_token") ??
    request.cookies.get("__Secure-better-auth.session_token")

  if (!sessionCookie) {
    const locale = pathname.match(/^\/(en|tr)/)?.[1] || routing.defaultLocale
    const loginUrl = new URL(`/${locale}/login`, CORE_URL)
    loginUrl.searchParams.set("callbackUrl", `${PUBLIC_URL}${pathname}`)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  // `/api/:path*` added so the CORS branch above can stamp headers and
  // answer OPTIONS preflights. Static assets and `_next` are still
  // excluded by the second matcher entry.
  // `/f/:path*` matcher'dan da çıkarıldı: erken return zaten yapsa bile
  // proxy fonksiyonunun hiç çağrılmaması Edge cold-start'ı tetiklemez.
  matcher: ["/api/:path*", "/((?!api|f|embed|_next|_vercel|.*\\..*).*)"],
}
