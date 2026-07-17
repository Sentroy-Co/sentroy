import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server/auth"
import { createDesktopAuthCode } from "@/lib/desktop-auth"
import { resolveHandoffApp } from "@/lib/handoff-apps"

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
  searchParams,
}: {
  params: Promise<{ lang: string }>
  searchParams: Promise<{ app?: string }>
}) {
  const { lang } = await params
  const { app } = await searchParams
  // Masaüstü/mail varsayılanı sentroy://. App-scoped handoff (Meet vb.) PATH
  // route'unu kullanır (/[lang]/desktop-auth/[app]) — OAuth-güvenli. Buradaki
  // `?app=` yalnız email-login akışı için korunur (geriye-uyum).
  const target = resolveHandoffApp(app)
  const session = await auth.api.getSession({ headers: await headers() })

  // Not signed in → normal login, then return here (login honours callbackURL)
  // to mint the code and hand off to the app. App verildiyse PATH route'una
  // yönlendir (OAuth-güvenli); yoksa bu sayfaya dön.
  if (!session?.user?.id) {
    const back = app
      ? `/${lang}/desktop-auth/${encodeURIComponent(app)}`
      : `/${lang}/desktop-auth`
    redirect(`/${lang}/login?callbackURL=${encodeURIComponent(back)}`)
  }

  const code = await createDesktopAuthCode(session.user.id)
  // Silent handoff — oturum varken doğrudan şema deep-link'ine 307 (interstitial
  // yok). ASWebAuthenticationSession/Custom Tab yakalar; masaüstünde OS açar.
  redirect(`${target.scheme}://auth?code=${encodeURIComponent(code)}`)
}
