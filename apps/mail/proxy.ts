import createMiddleware from "next-intl/middleware"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { routing } from "@workspace/auth/i18n/routing"
import { serverRootDomain, trustedOriginRegex } from "@workspace/auth/lib/domains"

const intlMiddleware = createMiddleware(routing)

/**
 * Core app (sentroy.com) URL'i. Subdomain'de login/landing yok — auth
 * gereken her yerde buraya yönlendirilir. Cross-subdomain cookie
 * sayesinde user core'da login olunca subdomain otomatik tanır.
 *
 * Lokal dev için NEXT_PUBLIC_CORE_APP_URL `http://localhost:3000` olmalı.
 */
const CORE_URL =
  process.env.NEXT_PUBLIC_CORE_APP_URL ||
  process.env.CORE_APP_URL ||
  "https://sentroy.com"

// `request.nextUrl.origin` Next.js standalone'da `HOSTNAME:PORT`
// (Dockerfile'da `0.0.0.0:3001`) döner, public URL'i değil. Reverse proxy
// (Coolify/Traefik) arkasında callbackUrl olarak `https://0.0.0.0:3001`
// dönerdi → env'den okuyalım.
const PUBLIC_URL =
  process.env.NEXT_PUBLIC_MAIL_APP_URL || "https://mail.sentroy.com"

/**
 * CORS gate for `/api/*` — see apps/storage/proxy.ts for full rationale.
 * The two subdomains share the same SDK clients so the policy is
 * intentionally identical.
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
  matcher: ["/api/:path*", "/((?!api|_next|_vercel|.*\\..*).*)"],
}
