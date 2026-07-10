import type { Metadata, Viewport } from "next"
import { Geist_Mono, Outfit } from "next/font/google"
import { ThemeProvider } from "next-themes"
import { Toaster } from "sonner"
import { cn } from "@workspace/ui/lib/utils"
import "@workspace/ui/globals.css"

export const metadata: Metadata = {
  title: { default: "Sentroy Auth", template: "%s | Sentroy Auth" },
  description: "Sign in with Sentroy — OAuth 2.0 / OpenID Connect provider",
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-svh bg-background font-sans antialiased",
          outfit.variable,
          fontMono.variable,
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="bottom-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  )
}
