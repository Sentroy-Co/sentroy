import type { NextConfig } from "next"
import path from "node:path"
import { createRequire } from "node:module"
import createNextIntlPlugin from "next-intl/plugin"

const pkg = createRequire(import.meta.url)("./package.json") as { version: string }

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

/**
 * Sentroy Studio — DJ + Musician (Phase 7+) DAW.
 *
 * Hosted at `studio.sentroy.com` (port 3006 in dev). Cross-subdomain cookie
 * `.sentroy.com` ile core/mail/storage/auth/status'la oturum paylaşır.
 *
 * `/api/auth/*` ve company endpoint'leri core'a rewrite — single source of truth.
 * Studio'nun kendi `/api/companies/[slug]/studio/...` route'ları lokal,
 * fallback rewrites başkalarını core'a yönlendirir.
 */

const coreUrl = (
  process.env.CORE_APP_URL ||
  process.env.NEXT_PUBLIC_CORE_APP_URL ||
  "http://localhost:3000"
).replace(/\/+$/, "")

// SDK gateway rewrite hedefleri — Sentroy client-sdk MediaManager
// `studio.sentroy.com/api/storage/companies/{slug}/...` çağırır; studio'nun
// rewrite'ı bunu storage app'in `/api/companies/{slug}/...` endpoint'ine
// server-side proxy eder. Tarayıcıdan single-origin görünür, CORS yok.
const storageUrl = (
  process.env.STORAGE_APP_URL ||
  process.env.NEXT_PUBLIC_STORAGE_APP_URL ||
  "http://localhost:3002"
).replace(/\/+$/, "")
const mailUrl = (
  process.env.MAIL_APP_URL ||
  process.env.NEXT_PUBLIC_MAIL_APP_URL ||
  "http://localhost:3001"
).replace(/\/+$/, "")

if (process.env.NODE_ENV === "production") {
  if (!process.env.CORE_APP_URL && !process.env.NEXT_PUBLIC_CORE_APP_URL) {
    console.warn(
      "[studio/next.config] CORE_APP_URL not set in production. Falling back to localhost — auth requests will fail.",
    )
  }
}

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  // VersionTag (sidebar footer) + editor footer'da gösterilir.
  env: {
    APP_VERSION: pkg.version,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Studio audio sample upload'ları 100MB'a kadar (MAX_FILE_BYTES with
  // studio-assets handler aynı limit). Next 16 default 10MB proxy
  // body limitini aşıyor, rewrite proxy'sinde truncate olur.
  experimental: {
    proxyClientMaxBodySize: "100mb",
  },
  async rewrites() {
    return {
      // afterFiles: SDK gateway rewrite'larını local route'lar çakışmasa bile
      // önce eşle (storage/mail prefix'i local'de yok zaten).
      afterFiles: [
        {
          source: "/api/storage/companies/:path*",
          destination: `${storageUrl}/api/companies/:path*`,
        },
        {
          source: "/api/mail/companies/:path*",
          destination: `${mailUrl}/api/companies/:path*`,
        },
      ],
      fallback: [
        { source: "/api/auth/:path*", destination: `${coreUrl}/api/auth/:path*` },
        {
          source: "/api/companies/:path*",
          destination: `${coreUrl}/api/companies/:path*`,
        },
      ],
    }
  },
}

export default withNextIntl(config)
