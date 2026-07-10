import { notFound } from "next/navigation"
import { NextIntlClientProvider } from "next-intl"
import { getMessages, setRequestLocale } from "next-intl/server"
import { ConfirmDialog } from "@workspace/console/components/shared/confirm-dialog"
import { InputDialog } from "@/components/common/input-dialog"

const SUPPORTED = ["en", "tr"] as const
type Lang = (typeof SUPPORTED)[number]

export function generateStaticParams() {
  return SUPPORTED.map((lang) => ({ lang }))
}

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
          __html: `try{var e=new URLSearchParams(window.location.search).has('embed');if(e)sessionStorage.setItem('os-embed','1');var f=window.self!==window.top;if(e||(f&&sessionStorage.getItem('os-embed')))document.documentElement.dataset.embedded='1'}catch(e){}`,
        }}
      />
      {children}
      <ConfirmDialog />
      <InputDialog />
    </NextIntlClientProvider>
  )
}

export type { Lang }
