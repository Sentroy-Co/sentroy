import { notFound } from "next/navigation"
import { NextIntlClientProvider } from "next-intl"
import { getMessages, setRequestLocale } from "next-intl/server"
import { ConfirmDialog } from "@workspace/console/components/shared/confirm-dialog"

const SUPPORTED = ["en", "tr"] as const
type Lang = (typeof SUPPORTED)[number]

export function generateStaticParams() {
  return SUPPORTED.map((lang) => ({ lang }))
}

/**
 * Lang-validating layout + next-intl provider. URL'deki segment
 * desteklenmiyorsa 404.
 *
 * NextIntlClientProvider burada zorunlu — dashboard shell ve paylaşılan
 * AppLauncher gibi client component'ler `useTranslations()` çağırıyor.
 * Olmadan client tree'de render anında throw'lar (digest'li empty error).
 *
 * Landing/consent gibi statik sayfalar lib/i18n.ts'in lightweight
 * `t()`'ini kullanmaya devam eder; provider sadece next-intl
 * tüketicilerine context sağlar, harici maliyet yok.
 */
export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!(SUPPORTED as readonly string[]).includes(lang)) {
    notFound()
  }
  setRequestLocale(lang)
  const messages = await getMessages()
  return (
    <NextIntlClientProvider messages={messages} locale={lang}>
      {/* Sentroy OS embed mode — iframe'de (?embed=1) shell sidebar/header gizler. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `try{var p=new URLSearchParams(window.location.search).has('embed');var f=window.self!==window.top;var s=sessionStorage.getItem('os-embed')==='1';if(p||f||s){sessionStorage.setItem('os-embed','1');document.documentElement.dataset.embedded='1'}}catch(e){}`,
        }}
      />
      {children}
      <ConfirmDialog />
    </NextIntlClientProvider>
  )
}

export type { Lang }
