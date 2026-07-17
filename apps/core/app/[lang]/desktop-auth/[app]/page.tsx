import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server/auth"
import { createDesktopAuthCode } from "@/lib/desktop-auth"
import { resolveHandoffApp } from "@/lib/handoff-apps"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * App-scoped sign-in handoff — hedef uygulama PATH segment'inde (`[app]`),
 * böylece social (OAuth) login callbackURL'inde bile korunur (query düşebilir).
 * `/[lang]/desktop-auth/meet` → sentroy-meet:// şeması. Bilinmeyen app →
 * varsayılan (sentroy://). Giriş yoksa login'e döner, callbackURL bu path.
 */
export default async function AppAuthPage({
  params,
}: {
  params: Promise<{ lang: string; app: string }>
}) {
  const { lang, app } = await params
  const target = resolveHandoffApp(app)
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session?.user?.id) {
    const back = `/${lang}/desktop-auth/${encodeURIComponent(app)}`
    redirect(`/${lang}/login?callbackURL=${encodeURIComponent(back)}`)
  }

  const code = await createDesktopAuthCode(session.user.id)
  // Silent handoff — oturum varken interstitial GÖSTERMEDEN doğrudan şema
  // deep-link'ine 307. iOS ASWebAuthenticationSession / Android Custom Tab bunu
  // oturum-içi yakalar (flutter_web_auth_2); masaüstü Electron'da OS şemayı açar.
  // Custom-scheme redirect JS window.location'dan daha güvenilir (tarayıcı bloklamaz).
  redirect(`${target.scheme}://auth?code=${encodeURIComponent(code)}`)
}
