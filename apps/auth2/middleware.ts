import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Next.js `app/` router dot-prefix dizinleri (`.well-known`) "private"
 * sayıp routing'e dahil etmiyor. Dosyalarımız `app/well-known/...`
 * altında; bu middleware standart spec URL'lerini (`/.well-known/...`)
 * o route'lara rewrite ediyor. RP'lere şeffaf — discovery / JWKS
 * URL'leri spec'e uygun yerinde.
 *
 * `next.config.ts` rewrites alternatifi denenip çalışmadı (Path-to-RegExp
 * `.` patternini özel yorumladığı için). Middleware level low-level
 * URL rewriting → ambiguity yok.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (pathname === "/.well-known/openid-configuration") {
    return NextResponse.rewrite(
      new URL("/well-known/openid-configuration", request.url),
    )
  }
  if (pathname === "/.well-known/jwks.json") {
    return NextResponse.rewrite(
      new URL("/well-known/jwks.json", request.url),
    )
  }
  return NextResponse.next()
}

export const config = {
  // Matcher: yalnızca dot-prefix well-known path'leri — gereksiz overhead yok.
  matcher: ["/.well-known/:path*"],
}
