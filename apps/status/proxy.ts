import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * apps/status proxy (Next.js 16 — middleware.ts deprecated, use proxy.ts).
 *
 * Sorumluluk: lang-prefix routing. Public page'ler ve dashboard
 * `/[lang]/...` altında. Eski `/p/[slug]` veya `/d/[company-slug]`
 * URL'lerine gelen istek Accept-Language detect ederek 307 redirect.
 *
 * API path'leri ve static asset'ler exclude.
 */

const SUPPORTED = ["en", "tr", "ru", "zh", "es"] as const
const DEFAULT_LOCALE = "en"

function detectLocale(request: NextRequest): string {
  const acceptLang = request.headers.get("accept-language") ?? ""
  for (const part of acceptLang.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase().slice(0, 2)
    if (tag && SUPPORTED.includes(tag as (typeof SUPPORTED)[number])) {
      return tag
    }
  }
  return DEFAULT_LOCALE
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip: API, internal/static asset'ler, lang-prefixed paths
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/well-known/") ||
    pathname.startsWith("/.well-known/") ||
    pathname === "/favicon.ico" ||
    pathname === "/feed.json" ||
    /^\/[a-z]{2}(\/|$)/.test(pathname) // already has lang prefix
  ) {
    return NextResponse.next()
  }

  // No lang prefix → detect + redirect
  const locale = detectLocale(request)
  const url = request.nextUrl.clone()
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`
  return NextResponse.redirect(url, 307)
}

export const config = {
  matcher: [
    // Match all routes EXCEPT API, _next, favicon, well-known
    "/((?!api|_next|favicon\\.ico|well-known|\\.well-known).*)",
  ],
}
