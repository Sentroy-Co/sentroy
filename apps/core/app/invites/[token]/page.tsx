import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { routing } from "@workspace/auth/i18n/routing"

/**
 * Lang-less davet kabul route'u — `/invites/{token}`.
 *
 * Davet mailleri ve in-app notification'lar her zaman locale-prefix'siz
 * URL ile gidiyor (`${origin}/invites/{token}`). Asıl sayfa
 * `/[lang]/invites/[token]` altında olduğu için locale resolve edip
 * oraya redirect ediyoruz; aksi halde her email link 404 düşer.
 *
 * Locale öncelik sırası — public profile redirect'iyle aynı:
 *   1. NEXT_LOCALE cookie
 *   2. Accept-Language ilk segmenti
 *   3. routing.defaultLocale
 */
export default async function InviteAcceptanceLanglessPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const cookieStore = await cookies()
  const cookieLang = cookieStore.get("NEXT_LOCALE")?.value
  const acceptLang = (await headers())
    .get("accept-language")
    ?.split(",")[0]
    ?.split("-")[0]
    ?.toLowerCase()

  const supported = routing.locales as readonly string[]
  const lang =
    cookieLang && supported.includes(cookieLang)
      ? cookieLang
      : acceptLang && supported.includes(acceptLang)
        ? acceptLang
        : routing.defaultLocale

  redirect(`/${lang}/invites/${encodeURIComponent(token)}`)
}
