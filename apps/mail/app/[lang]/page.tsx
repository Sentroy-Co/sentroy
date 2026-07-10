import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server/auth"

/**
 * mail.sentroy.com/{lang} — kullanıcı login değilse core landing'e gönder
 * (oradan signup/login yapsın), login ise mail subdomain'inde company
 * seçim ekranına git. CompanySelection tek company varsa kendisi
 * /d/{slug}'a redirect ediyor.
 */
export default async function MailRootPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    const coreUrl = process.env.NEXT_PUBLIC_CORE_APP_URL || "https://sentroy.com"
    redirect(`${coreUrl}/${lang}`)
  }

  redirect(`/${lang}/d`)
}
