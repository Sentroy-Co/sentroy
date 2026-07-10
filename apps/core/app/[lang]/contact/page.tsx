import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { localizedAlternates } from "@/lib/seo-alternates"
import { ContactPageContent } from "@/components/contact/contact-page-content"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  setRequestLocale(lang)
  const t = await getTranslations({ locale: lang, namespace: "contact" })
  return { title: t("metaTitle"), description: t("metaDescription"), alternates: localizedAlternates(lang, "/contact") }
}

/**
 * /[lang]/contact — profesyonel iletişim sayfası: Turnstile-korumalı form
 * (sorun/soru → admin gelen-kutusu, POST /api/contact/messages) + yatırımcılar/
 * basın için Turnstile-gated e-posta seçeneği (RevealEmail). Landing dark-aurora.
 */
export default async function ContactPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  setRequestLocale(lang)
  return <ContactPageContent lang={lang} />
}
