import type { Metadata, Viewport } from "next"
import { Geist_Mono, Outfit } from "next/font/google"
import { NextIntlClientProvider } from "next-intl"
import { getMessages } from "next-intl/server"
import { notFound } from "next/navigation"
import { routing } from "@workspace/auth/i18n/routing"
import { UIProviders } from "@workspace/console/components/providers/ui-providers"
import { cn } from "@workspace/ui/lib/utils"
import "@workspace/ui/globals.css"

export const metadata: Metadata = {
  title: { default: "Sentroy Santral", template: "%s | Sentroy Santral" },
  description: "WhatsApp call-center for businesses",
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  width: "device-width",
  initialScale: 1,
}

const outfit = Outfit({ subsets: ["latin"], variable: "--font-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ lang: locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params

  if (!routing.locales.includes(lang as "en" | "tr")) {
    notFound()
  }

  const messages = await getMessages()

  return (
    <html
      lang={lang}
      suppressHydrationWarning
      className={cn("antialiased font-sans", outfit.variable, fontMono.variable)}
    >
      <body>
        <NextIntlClientProvider messages={messages}>
          <UIProviders>{children}</UIProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
