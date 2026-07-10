import type { NextConfig } from "next"
import path from "node:path"
import { createRequire } from "node:module"
import createNextIntlPlugin from "next-intl/plugin"

const pkg = createRequire(import.meta.url)("./package.json") as { version: string }

/**
 * Sentroy Status — public status page + admin (system + per-company).
 *
 * Hosted at `status.sentroy.com` (port 3004 dev). Cross-subdomain cookie
 * `.sentroy.com` ile core/mail/storage/auth2 oturumunu paylaşır — admin
 * sayfaları core'da login olduktan sonra burada doğrudan açılır.
 *
 * Phase 1.0: Sentroy internal status (5 hardcoded service) buradan
 * served. Phase 3+'ta `/p/[slug]` altında multi-tenant company status
 * page'leri eklenecek.
 *
 * Rewrites:
 *   - `/api/auth/*`   → core (better-auth single source of truth)
 *   - `/api/companies/*` → core fallback (multi-tenant company list +
 *     status-page management API ileride apps/status'ta yerini alır
 *     ama şimdilik proxy ediyor; lokal route eklenirse fallback bypass)
 */
const coreUrl = (
  process.env.CORE_APP_URL ||
  process.env.NEXT_PUBLIC_CORE_APP_URL ||
  "http://localhost:3000"
).replace(/\/+$/, "")

if (process.env.NODE_ENV === "production") {
  if (!process.env.CORE_APP_URL && !process.env.NEXT_PUBLIC_CORE_APP_URL) {
    console.warn(
      "[status/next.config] CORE_APP_URL not set in production. Falling back to localhost — auth proxy will fail.",
    )
  }
}

// Dashboard'da paylaşılan client component'ler `useTranslations()` çağırıyor;
// auth2 ile aynı pattern.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  // VersionTag build-time inline (sidebar footer'da gösterilir).
  env: {
    APP_VERSION: pkg.version,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return {
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
