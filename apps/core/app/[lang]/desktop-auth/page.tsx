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
// Handoff yapan uygulamalar — şema allowlist'i. `?app=` paramı buradan
// doğrulanır; bilinmeyen değer varsayılana (desktop/mail: sentroy://) düşer.
// Yeni bir mobil/masaüstü uygulama eklerken buraya kaydet.
const HANDOFF_APPS: Record<string, { scheme: string; appName: string }> = {
  sentroy: { scheme: "sentroy", appName: "Sentroy" },
  meet: { scheme: "sentroy-meet", appName: "Sentroy Meet" },
}

export default async function DesktopAuthPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>
  searchParams: Promise<{ app?: string }>
}) {
  const { lang } = await params
  const { app } = await searchParams
  const target = HANDOFF_APPS[app ?? ""] ?? HANDOFF_APPS.sentroy
  const session = await auth.api.getSession({ headers: await headers() })

  // Not signed in → normal login, then return here (login honours callbackURL)
  // to mint the code and hand off to the desktop app. `app` paramı korunur.
  if (!session?.user?.id) {
    const back = `/${lang}/desktop-auth${app ? `?app=${encodeURIComponent(app)}` : ""}`
    redirect(`/${lang}/login?callbackURL=${encodeURIComponent(back)}`)
  }

  const code = await createDesktopAuthCode(session.user.id)
  return (
    <DesktopAuthLauncher
      code={code}
      email={session.user.email ?? ""}
      scheme={target.scheme}
      appName={target.appName}
    />
  )
}
