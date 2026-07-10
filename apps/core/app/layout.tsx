import type { Metadata, Viewport } from "next"

/**
 * Global PWA metadata — apple-touch-icon + standalone web-app capability +
 * favicon. Manifest link'i `app/manifest.ts` üzerinden Next otomatik enjekte
 * eder. themeColor `viewport`'ta (Next 14+).
 */
export const metadata: Metadata = {
  applicationName: "Sentroy",
  appleWebApp: { capable: true, title: "Sentroy", statusBarStyle: "default" },
  icons: {
    icon: "/android-chrome-512x512.png",
    apple: "/sentroy_pwa.png",
  },
}

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return children
}
