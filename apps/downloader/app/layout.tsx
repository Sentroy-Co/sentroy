import type { Metadata, Viewport } from "next"
import { headers } from "next/headers"
import Script from "next/script"
import { Geist_Mono, Outfit } from "next/font/google"
import { ThemeProvider } from "@workspace/console/components/providers/theme-provider"
import { Toaster } from "sonner"
import { cn } from "@workspace/ui/lib/utils"
import { platformFromHost, siteSection } from "@/lib/platform"
import "./globals.css"

const GA_ID = process.env.NEXT_PUBLIC_GA_ID || ""

export const metadata: Metadata = {
  title: "Sentroy Downloader",
  description: "Free, fast media downloader — no signup.",
  icons: {
    icon: [
      { url: "/favicon-set/favicon.ico", sizes: "any" },
      { url: "/favicon-set/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-set/favicon-16x16.png", type: "image/png", sizes: "16x16" },
    ],
    apple: "/favicon-set/apple-touch-icon.png",
  },
  manifest: "/favicon-set/site.webmanifest",
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const host = (await headers()).get("host")
  const platform = platformFromHost(host)
  const section = siteSection(host)
  return (
    <html
      lang="en"
      data-platform={platform}
      data-section={section}
      suppressHydrationWarning
      className={cn(
        "dark antialiased font-sans",
        outfit.variable,
        fontMono.variable,
      )}
    >
      <body className="bg-background text-foreground">
        {/* Site sabit dark mode — toggle yok. */}
        <ThemeProvider forcedTheme="dark" enableSystem={false}>
          {children}
        </ThemeProvider>
        <Toaster position="bottom-right" theme="dark" richColors />
        {GA_ID ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`}
            </Script>
          </>
        ) : null}
      </body>
    </html>
  )
}
