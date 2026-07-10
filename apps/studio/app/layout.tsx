import type { Metadata, Viewport } from "next"
import { Geist_Mono, Orbitron, Outfit } from "next/font/google"
import { ThemeProvider } from "next-themes"
import { Toaster } from "sonner"
import { cn } from "@workspace/ui/lib/utils"
import "@workspace/ui/globals.css"

export const metadata: Metadata = {
  title: { default: "Sentroy Studio", template: "%s | Sentroy Studio" },
  description: "DJ + musician — professional in-browser audio studio.",
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
// Orbitron — digital LCD karakter; transport time / BPM gibi
// readout'larda kullanılır. CSS var `--font-display` üzerinden
// `font-display` Tailwind utility'siyle erişilir (globals.css mapping).
const fontDisplay = Orbitron({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
})

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
          fontDisplay.variable,
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster position="bottom-right" richColors theme="dark" />
        </ThemeProvider>
      </body>
    </html>
  )
}
