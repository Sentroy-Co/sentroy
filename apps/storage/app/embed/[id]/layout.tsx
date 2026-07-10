import "@workspace/ui/globals.css"
import { Geist_Mono, Outfit } from "next/font/google"
import type { ReactNode } from "react"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Embed pages live outside the locale-prefixed dashboard tree, so
 * they get their own top-level layout. Body fills the viewport so a
 * 100% iframe shows the player edge-to-edge with zero margin.
 *
 * `<head>` deliberately stays minimal — no Provider wrappers, no
 * intl, no analytics. The embedded player needs to boot fast on
 * third-party pages and not pull in dashboard-only state.
 *
 * Fonts are loaded via `next/font/google` mirroring the dashboard's
 * Outfit + Geist Mono pairing. Without this the iframe falls back
 * to system sans-serif on the host page, which clashes with the
 * lightbox typography (custom kerning + tabular numbers).
 */
const outfit = Outfit({ subsets: ["latin"], variable: "--font-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

export default function EmbedLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body
        className={cn(
          "bg-black m-0 p-0 antialiased font-sans text-foreground",
          outfit.variable,
          fontMono.variable,
        )}
      >
        <div className="fixed inset-0 flex">{children}</div>
      </body>
    </html>
  )
}
