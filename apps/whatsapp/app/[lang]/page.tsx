import { redirect } from "next/navigation"

/**
 * WhatsApp app'inin landing'i yok — kullanıcı doğrudan şirket seçiciye
 * (core dashboard) yönlendirilir. Oradan bir şirkete girince app launcher
 * veya doğrudan URL ile `/{lang}/d/{slug}/chats`'e gelir.
 */
export default async function LocaleRootPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  const coreUrl = (
    process.env.NEXT_PUBLIC_CORE_APP_URL || "https://sentroy.com"
  ).replace(/\/+$/, "")
  redirect(`${coreUrl}/${lang}/d`)
}
