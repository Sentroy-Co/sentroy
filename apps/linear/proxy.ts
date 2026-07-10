import createMiddleware from "next-intl/middleware"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { routing } from "@workspace/auth/i18n/routing"

const intlMiddleware = createMiddleware(routing)

const CORE_URL =
  process.env.NEXT_PUBLIC_CORE_APP_URL ||
  process.env.CORE_APP_URL ||
  "https://sentroy.com"

const PUBLIC_URL =
  process.env.NEXT_PUBLIC_LINEAR_APP_URL || "https://linear.sentroy.com"

/**
 * Linear Lite proxy (Next.js 16 middleware).
 *   - `/api/*` → same-origin, dokunma (cookie auth, kendi handler'ları;
 *     webhook alıcısı da burada — session'sız).
 *   - Diğer her path session zorunlu — landing yok, tüm UI dashboard.
 *   - next-intl locale yönlendirmesi.
 */
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith("/api/")) {
    return NextResponse.next()
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
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
}
