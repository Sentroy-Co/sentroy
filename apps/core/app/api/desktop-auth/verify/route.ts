import { NextRequest, NextResponse } from "next/server"
import { issueSessionForUser } from "@workspace/auth/server/passkey-session"
import { serverRootDomain, rootOrigin } from "@workspace/auth/lib/domains"
import { consumeDesktopAuthCode } from "@/lib/desktop-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Desktop app session handoff — called by the desktop app's own web view with
 * the one-time code from the `sentroy://auth?code=…` deep link. Because the
 * request comes from the app's session, the session cookie we set here lands in
 * the app's partition, logging it in. See lib/desktop-auth.ts + the
 * /[lang]/desktop-auth page.
 */
export async function GET(request: NextRequest) {
  // request.url is the INTERNAL bind (e.g. 0.0.0.0:3000) behind the proxy, so
  // build redirect targets from the public root domain instead. Paths are
  // locale-prefixed — bare /d / /login have no [lang] segment and 404.
  const origin = rootOrigin(serverRootDomain())
  const code = request.nextUrl.searchParams.get("code") || ""
  const userId = await consumeDesktopAuthCode(code)

  if (!userId) {
    // Invalid / expired / already used → back to login.
    return NextResponse.redirect(`${origin}/en/login?desktop_auth=invalid`)
  }

  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined
  const userAgent = request.headers.get("user-agent") || undefined

  const issued = await issueSessionForUser(userId, { ipAddress, userAgent })

  // Land in the dashboard/OS. Set-Cookie on the redirect is applied before the
  // app's web view follows it, so /en/d sees the fresh session.
  const res = NextResponse.redirect(`${origin}/en/d`)
  res.cookies.set(issued.cookieName, issued.cookieValue, issued.cookieAttributes)
  return res
}
