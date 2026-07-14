import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server/auth"
import { createDesktopAuthCode } from "@/lib/desktop-auth"
import { DesktopAuthLauncher } from "./launcher"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Desktop app sign-in handoff. The user reaches this page in their normal
 * browser (Google session + saved passwords already there). Once authenticated
 * we mint a one-time code and deep-link it back to the desktop app, which
 * exchanges it for its own session — see lib/desktop-auth.ts + the
 * /api/desktop-auth/verify route.
 */
export default async function DesktopAuthPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  const session = await auth.api.getSession({ headers: await headers() })

  // Not signed in → send them through the normal login, then they reopen the
  // "Sign in with browser" action in the desktop app.
  if (!session?.user?.id) {
    redirect(`/${lang}/login`)
  }

  const code = await createDesktopAuthCode(session.user.id)
  return <DesktopAuthLauncher code={code} email={session.user.email ?? ""} />
}
