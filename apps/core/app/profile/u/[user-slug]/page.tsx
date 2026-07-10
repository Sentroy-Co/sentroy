import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { routing } from "@workspace/auth/i18n/routing"

/**
 * Lang-less public profile route — `/profile/u/{slug}`'a doğrudan gelen
 * istekler için. Asıl render `/{lang}/profile/u/{slug}` route'unda; biz
 * burada locale resolve edip oraya redirect ederiz.
 *
 * Public profil URL'leri sosyal paylaşım friendly olmalı (LinkedIn'in
 * `/in/{handle}`'ı gibi locale prefix istemez). next-intl middleware
 * eklemeden tek route ekleyerek bu UX'i sağlıyoruz; başka route'lar
 * etkilenmez.
 *
 * Locale öncelik sırası:
 *   1. NEXT_LOCALE cookie (next-intl'in yaptığı)
 *   2. Accept-Language header'ın ilk segmenti
 *   3. routing.defaultLocale
 */
export default async function PublicProfileLanglessPage({
  params,
}: {
  params: Promise<{ "user-slug": string }>
}) {
  const { "user-slug": slug } = await params

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

  // Encode — slug bir Latin handle olsa da Unicode emniyet için.
  redirect(`/${lang}/profile/u/${encodeURIComponent(slug)}`)
}
