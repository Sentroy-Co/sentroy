import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server/auth"
import { createDesktopAuthCode } from "@/lib/desktop-auth"
import { resolveHandoffApp } from "@/lib/handoff-apps"
import { DesktopAuthLauncher } from "../launcher"

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
  return (
    <DesktopAuthLauncher
      code={code}
      email={session.user.email ?? ""}
      scheme={target.scheme}
      appName={target.appName}
    />
  )
}
