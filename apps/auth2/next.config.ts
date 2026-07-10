import type { NextConfig } from "next"
import path from "node:path"
import createNextIntlPlugin from "next-intl/plugin"

// Dashboard shell + AppLauncher gibi paylaşılan client component'ler
// `useTranslations()` çağırıyor — provider'ı `[lang]/layout.tsx`'te,
// request config'i `i18n/request.ts`'te. Landing/consent ekranları
// hâlâ `lib/i18n.ts`'in lightweight `t()`'ini kullanıyor (next-intl
// her sayfaya zorunlu değil).
const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

/**
 * Sentroy Auth2 — OAuth2 / OIDC provider app.
 *
 * Hosted at `auth.sentroy.com` (port 3003 in dev). Cross-subdomain cookie
 * `.sentroy.com` ile core/mail/storage'la oturum paylaşır — kullanıcı
 * sentroy.com'da login olduktan sonra burada `/oauth/authorize`'a
 * geldiğinde tekrar login olmaz, doğrudan consent görür.
 *
 * `/api/auth/*` ve company endpoint'leri core'a rewrite edilir; auth2'nin
 * kendi domain'inden de same-origin görünmesi için.
 */

const coreUrl = (
  process.env.CORE_APP_URL ||
  process.env.NEXT_PUBLIC_CORE_APP_URL ||
  "http://localhost:3000"
).replace(/\/+$/, "")

if (process.env.NODE_ENV === "production") {
  if (!process.env.CORE_APP_URL && !process.env.NEXT_PUBLIC_CORE_APP_URL) {
    console.warn(
      "[auth2/next.config] CORE_APP_URL not set in production. Falling back to localhost — auth requests will fail.",
    )
  }
}

const config: NextConfig = {
  output: "standalone",
  // Monorepo root — standalone output'un workspace packages'ı bu path'ten
  // tracelaması için (core/storage ile aynı pattern).
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    // **Fallback** scope kritik: array return edersek `afterFiles` modu
    // devreye giriyor — dynamic route'lardan ÖNCE çalışıyor ve auth2'nin
    // kendi `/api/companies/[slug]/{auth-projects,oauth-clients}/...` lokal
    // route'larını shadow'luyor (core'a ship olduğu için 404). `fallback`
    // ise yalnızca local file system'da match olmayan istekleri yakalar:
    // top-level `/api/companies` (list) ve auth2'de olmayan diğer
    // `/api/companies/[slug]/...` çağrıları core'a düşer; auth-projects /
    // oauth-clients local handler'ları hâlâ kazanır.
    return {
      fallback: [
        // Better-auth API + session checks → core (single source of truth)
        { source: "/api/auth/:path*", destination: `${coreUrl}/api/auth/:path*` },
        // Companies endpoint — consent screen + team-switcher company
        // list/detail'i için. Auth2-spesifik sub-route'lar (auth-projects,
        // oauth-clients) lokal kaldığı için bunlara değmez.
        {
          source: "/api/companies/:path*",
          destination: `${coreUrl}/api/companies/:path*`,
        },
      ],
      // Not: `.well-known/*` rewrite'ları `middleware.ts`'te (next.config.ts
      // rewrites Path-to-RegExp'te `.` özel karakter ambiguity'si yaşıyor).
    }
  },
}

export default withNextIntl(config)
