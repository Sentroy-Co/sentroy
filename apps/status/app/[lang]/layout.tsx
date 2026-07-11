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
 * apps/status `[lang]/layout.tsx` — lang validation + NextIntlClientProvider.
 *
 * Provider zorunlu: dashboard shell (status-dashboard-shell.tsx) ve
 * StatusDashboardContent `useTranslations()` çağırıyor, AppLauncher da.
 * Provider olmadan client tree'de render anında throw'lar (digest'li
 * empty error — auth2'de yaşadığımız aynı pattern).
 *
 * Sentroy internal public status (`/`) ve `/p/[slug]` routes'larda
 * useTranslations çağrısı yok, provider extra cost değil.
 */
export default async function StatusLangLayout({
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
