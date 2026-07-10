import { redirect } from "next/navigation"

/**
 * SMTP sayfası kaldırıldı; SMTP ve IMAP credentials artık domain detay
 * sayfasındaki "Credentials" sheet'inden yönetiliyor.
 */
export default async function SmtpPage({
  params,
}: {
  params: Promise<{ lang: string; "company-slug": string }>
}) {
  const { lang, "company-slug": slug } = await params
  redirect(`/${lang}/d/${slug}/domains`)
}
