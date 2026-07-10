import type { NextConfig } from "next"
import path from "node:path"
import createNextIntlPlugin from "next-intl/plugin"
import pkg from "./package.json"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

// Gateway rewrites — mail subdomain'inde tanımlı olmayan ortak endpoint'leri
// (auth, company list/detail) core'a forward et. Client kodu mevcut origin'e
// fetch ediyor; bu rewrite olmazsa 404 alır. `:slug` tek segment matched, alt
// route'lar (`/api/companies/:slug/mailboxes` vb.) mail'in kendi handler'ına
// kalır — çakışma yok.
//
// `CORE_APP_URL` öncelikli: prod'da `http://core:3000` Docker network içi
// hostname → TLS turu yok. Yoksa public URL fallback (lokal dev veya core'un
// ayrı stack'te durduğu durumlar için).
// Resolution: internal Docker hostname → public URL → localhost dev fallback.
// Subdomain'ler ayrı Coolify service'lerinde olunca internal `http://core:3000`
// resolve etmez; public URL fallback'i deploy'ı çalışır tutar.
const coreUrl = (
  process.env.CORE_APP_URL ||
  process.env.NEXT_PUBLIC_CORE_APP_URL ||
  "http://localhost:3000"
).replace(/\/+$/, "")

if (
  process.env.NODE_ENV === "production" &&
  !process.env.CORE_APP_URL &&
  !process.env.NEXT_PUBLIC_CORE_APP_URL
) {
  console.warn(
    "⚠ [mail/next.config] Neither CORE_APP_URL nor NEXT_PUBLIC_CORE_APP_URL is set — auth + cross-app rewrites will hit localhost:3000 and fail with ECONNREFUSED. Set one in Coolify env.",
  )
}

const nextConfig: NextConfig = {
  // Version footer için build-time inline — deploy güncelliği debug kolaylığı.
  env: {
    APP_VERSION: pkg.version,
  },
  devIndicators: false,
  transpilePackages: [
    "@workspace/ui",
    "@workspace/db",
    "@workspace/auth",
    "@workspace/console",
    "@workspace/ai-assistant",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
    ],
  },
  output: "standalone",
  // Monorepo root — standalone output'un workspace packages'ı tracelaması için.
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return []
  },
  async rewrites() {
    return [
      // better-auth endpoint'leri sadece core'da kurulu.
      {
        source: "/api/auth/:path*",
        destination: `${coreUrl}/api/auth/:path*`,
      },
      // BIMI public proxy core'da (DNS lookup, auth'suz). Inbox sender
      // logoları mail UI'dan çağrılır.
      {
        source: "/api/bimi",
        destination: `${coreUrl}/api/bimi`,
      },
      // Company list ve company detail core'da. Alt route'lar
      // (`/api/companies/:slug/mailboxes` vb.) mail'in kendi handler'ında
      // kalır — Next.js segment match `:slug` tek segment'e bakar.
      {
        source: "/api/companies",
        destination: `${coreUrl}/api/companies`,
      },
      {
        source: "/api/companies/:slug",
        destination: `${coreUrl}/api/companies/:slug`,
      },
      // Avatar endpoint core'da yaşıyor (Company.avatarUrl + cdn upload).
      // Proxy etmeden mail/storage subdomain'inde 404 olur.
      {
        source: "/api/companies/:slug/avatar",
        destination: `${coreUrl}/api/companies/:slug/avatar`,
      },
      {
        source: "/api/companies/:slug/avatar/img/:mediaId",
        destination: `${coreUrl}/api/companies/:slug/avatar/img/:mediaId`,
      },
      // Invitations core'da yaşıyor (mail sender ve user lookup orada).
      {
        source: "/api/companies/:slug/invitations",
        destination: `${coreUrl}/api/companies/:slug/invitations`,
      },
      {
        source: "/api/companies/:slug/invitations/:id",
        destination: `${coreUrl}/api/companies/:slug/invitations/:id`,
      },
      {
        source: "/api/companies/:slug/invitations/:id/resend",
        destination: `${coreUrl}/api/companies/:slug/invitations/:id/resend`,
      },
      {
        source: "/api/invitations/:token",
        destination: `${coreUrl}/api/invitations/:token`,
      },
      {
        source: "/api/invitations/:token/accept",
        destination: `${coreUrl}/api/invitations/:token/accept`,
      },
      // Passkey endpoint'leri core'da (better-auth session bridge orada).
      {
        source: "/api/passkey",
        destination: `${coreUrl}/api/passkey`,
      },
      {
        source: "/api/passkey/:path*",
        destination: `${coreUrl}/api/passkey/:path*`,
      },
    ]
  },
  // Root path → default locale. Server component `redirect("/en")` standalone'da
  // bind address (`0.0.0.0:3001`) base alıyor → `localhost:3001/en`. Deklaratif
  // `redirects()` reverse proxy header'larından bağımsız relative çalışır.
  //
  // Auth sayfaları (login/signup/forgot-password vb.) yalnızca core'da yaşar.
  // Kullanıcı `mail.sentroy.com/{lang}/login` veya benzerine direkt giderse
  // 404 yerine `${coreUrl}/{lang}/login`'e yönlendirilsin. PUBLIC core URL
  // gerekli (Docker network internal `http://core:3000` browser'a açılmaz);
  // `NEXT_PUBLIC_CORE_APP_URL` build-time inline.
  async redirects() {
    const publicCoreUrl = (
      process.env.NEXT_PUBLIC_CORE_APP_URL || "https://sentroy.com"
    ).replace(/\/+$/, "")
    const authPaths = [
      "login",
      "signup",
      "forgot-password",
      "reset-password",
      "passwordless",
      "two-factor",
      "verify-email",
      "verify-email-pending",
    ]
    return [
      { source: "/", destination: "/en", permanent: false },
      ...authPaths.map((p) => ({
        source: `/:lang/${p}`,
        destination: `${publicCoreUrl}/:lang/${p}`,
        permanent: false,
      })),
    ]
  },
}

export default withNextIntl(nextConfig)
