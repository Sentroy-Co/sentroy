import { redirect } from "next/navigation"

/**
 * OAuth Client management auth.sentroy.com'a taşındı; eski core URL'ine
 * gelen kullanıcılar otomatik olarak auth2'ye yönlendirilir. Bookmark'lar
 * korunur, deep link'ler (örn. `?clientId=...` query string'leri) de
 * iletilir.
 *
 * UI + API handler'ları `packages/console/src/{components/auth,handlers}`
 * altında shared — her iki app aynı koddan çalışır.
 */
export default async function CoreOauthClientsRedirect({
  params,
}: {
  params: Promise<{ "company-slug": string; lang: string }>
}) {
  const { "company-slug": slug, lang } = await params
  const authUrl =
    process.env.NEXT_PUBLIC_AUTH_APP_URL || "https://auth.sentroy.com"
  redirect(`${authUrl}/${lang}/d/${slug}/oauth-clients`)
}
