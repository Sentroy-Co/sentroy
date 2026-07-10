import type { Metadata, Viewport } from "next"
import { Geist_Mono, Outfit } from "next/font/google"
import { ThemeProvider } from "@workspace/console/components/providers/theme-provider"
import { cn } from "@workspace/ui/lib/utils"
import "@workspace/ui/globals.css"
import "./styles.css"
import { DocsSidebar } from "./components/sidebar"
import { ThemeToggle } from "./components/theme-toggle"
import { CredentialsPopover } from "./components/credentials-popover"
import { SearchPalette } from "./components/search-palette"
import { OnThisPage } from "./components/on-this-page"

export const metadata: Metadata = {
  title: { default: "Sentroy Docs", template: "%s · Sentroy Docs" },
  description: "Official documentation and SDK reference for the Sentroy platform.",
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

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased font-sans", outfit.variable, fontMono.variable)}
    >
      <body className="bg-background text-foreground">
        <ThemeProvider>
          <div className="min-h-screen">
            <DocsSidebar />
            <div className="lg:pl-[260px]">
              <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/80 px-6 backdrop-blur lg:px-12">
                <div className="hidden max-w-md flex-1 sm:block">
                  <SearchPalette />
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <CredentialsPopover />
                  <ThemeToggle />
                </div>
              </header>
              <main className="mx-auto grid w-full max-w-[1100px] grid-cols-1 gap-12 px-6 py-12 lg:grid-cols-[minmax(0,1fr)_220px] lg:px-12 lg:py-16">
                <div className="min-w-0">{children}</div>
                <OnThisPage />
              </main>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
