import "@workspace/ui/globals.css"
import { Geist_Mono, Outfit } from "next/font/google"
import type { ReactNode } from "react"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Public shared-file viewer at `/v/<mediaId>` — standalone page (outside the
 * locale-prefixed dashboard), chrome-less full-viewport shell that hosts the
 * FilePreviewLightbox for a single public file. Link paylaşımı buraya gider:
 * ham byte yerine player/pdf/txt/görsel deneyimi (Drive tarzı).
 */
const outfit = Outfit({ subsets: ["latin"], variable: "--font-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

export default function ViewerLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body
        className={cn(
          "bg-black m-0 p-0 antialiased font-sans text-foreground",
          outfit.variable,
          fontMono.variable,
        )}
      >
        <div className="fixed inset-0">{children}</div>
      </body>
    </html>
  )
}
