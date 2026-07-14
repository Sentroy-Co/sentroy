import { NextRequest, NextResponse } from "next/server"
import { issueSessionForUser } from "@workspace/auth/server/passkey-session"
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
  const code = request.nextUrl.searchParams.get("code") || ""
  const userId = await consumeDesktopAuthCode(code)

  if (!userId) {
    // Invalid / expired / already used → back to login (the app's web view
    // will show the normal login page).
    return NextResponse.redirect(new URL("/login?desktop_auth=invalid", request.url))
  }

  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined
  const userAgent = request.headers.get("user-agent") || undefined

  const issued = await issueSessionForUser(userId, { ipAddress, userAgent })

  // Land in the dashboard/OS. Set-Cookie on the redirect is applied before the
  // app's web view follows it, so /d sees the fresh session.
  const res = NextResponse.redirect(new URL("/d", request.url))
  res.cookies.set(issued.cookieName, issued.cookieValue, issued.cookieAttributes)
  return res
}
