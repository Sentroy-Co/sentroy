import type { Metadata, Viewport } from "next"
import { Geist_Mono, Outfit } from "next/font/google"
import { ThemeProvider } from "@workspace/console/components/providers/theme-provider"
import { Toaster } from "sonner"
import { cn } from "@workspace/ui/lib/utils"
import "@workspace/ui/globals.css"

export const metadata: Metadata = {
  title: { default: "Sentroy Status", template: "%s · Sentroy Status" },
  description: "Real-time status of every Sentroy service.",
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

export default function StatusRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased font-sans", outfit.variable, fontMono.variable)}
    >
      <body className="bg-background text-foreground">
        <ThemeProvider>{children}</ThemeProvider>
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  )
}
