import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { auth } from "@workspace/auth/server/auth"
import { ProfileContent } from "@workspace/console/components/profile/profile-content"
import { ProfileShell } from "@workspace/console/components/profile/profile-shell"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "profile" })
  return { title: t("title") }
}

/**
 * Own profile — company-agnostic. Kullanıcının hiç company'si olmasa bile
 * profilini düzenleyebilir; avatar picker company seçimi ProfileContent
 * içinde lazy yapılır (kullanıcının bir company'sine sahipse o
 * company'nin bucket'larından seçer; yoksa "company yok" mesajı).
 *
 * ProfileShell wrapper'ı public profile sayfasındaki aynı navbar +
 * footer iskeletini ekler — owner mode'da CTA'lar "View public profile"
 * (varsa) + "Sign out". Kullanıcının session'undaki `profileSlug`
 * shell'e geçirilir; yoksa View link'i gizlenir.
 */
export default async function ProfilePage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect(`/${lang}/login`)
  }
  // better-auth additionalFields ile genişletilmiş user'da `profileSlug`
  // varsa shell'e ver. Type'ı geniş tutmak için runtime cast.
  const slug =
    (session.user as { profileSlug?: string | null } | undefined)
      ?.profileSlug ?? null
  return (
    <ProfileShell mode="owner" slug={slug}>
      <ProfileContent />
    </ProfileShell>
  )
}
