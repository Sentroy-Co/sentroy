import type { NextConfig } from "next"
import path from "node:path"
import createNextIntlPlugin from "next-intl/plugin"
import pkg from "./package.json"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

// Gateway rewrites — storage subdomain'inde tanımlı olmayan ortak endpoint'leri
// (auth, company list/detail, inbox SSE) core veya mail'e forward et.
// `*_APP_URL` env'leri öncelikli: prod'da `http://{name}:port` Docker network
// içi hostname → TLS turu yok. Yoksa public URL fallback.
const coreUrl = (
  process.env.CORE_APP_URL ||
  process.env.NEXT_PUBLIC_CORE_APP_URL ||
  "http://localhost:3000"
).replace(/\/+$/, "")
const mailUrl = (
  process.env.MAIL_APP_URL ||
  process.env.NEXT_PUBLIC_MAIL_APP_URL ||
  "http://localhost:3001"
).replace(/\/+$/, "")

if (process.env.NODE_ENV === "production") {
  if (!process.env.CORE_APP_URL && !process.env.NEXT_PUBLIC_CORE_APP_URL) {
    console.warn(
      "⚠ [storage/next.config] Neither CORE_APP_URL nor NEXT_PUBLIC_CORE_APP_URL is set — auth + cross-app rewrites will hit localhost:3000 and fail with ECONNREFUSED. Set one in Coolify env.",
    )
  }
  if (!process.env.MAIL_APP_URL && !process.env.NEXT_PUBLIC_MAIL_APP_URL) {
    console.warn(
      "⚠ [storage/next.config] Neither MAIL_APP_URL nor NEXT_PUBLIC_MAIL_APP_URL is set — inbox-related rewrites will hit localhost:3001 and fail with ECONNREFUSED. Set one in Coolify env.",
    )
  }
}

const nextConfig: NextConfig = {
  // Version footer için build-time inline — deploy güncelliği debug kolaylığı.
  env: {
    APP_VERSION: pkg.version,
  },
  devIndicators: false,
  // Next.js 16 default 10MB body limit'i — 500MB'a kadar audio/video upload
  // kabul etsin (CDN multer limit'i + storage route limit'i de 500MB). Bu hem
  // doğrudan POST'lar hem de proxy üzerinden gelenler için geçerli. 512mb =
  // 500MB dosya + multipart overhead için pay.
  experimental: {
    proxyClientMaxBodySize: "512mb",
  },
  transpilePackages: [
    "@workspace/ui",
    "@workspace/db",
    "@workspace/auth",
    "@workspace/console",
    "@workspace/cdn-client",
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
      // Company list ve company detail core'da. Alt route'lar (bucket vb.)
      // storage'ın kendi handler'ında kalır.
      {
        source: "/api/companies",
        destination: `${coreUrl}/api/companies`,
      },
      {
        source: "/api/companies/:slug",
        destination: `${coreUrl}/api/companies/:slug`,
      },
      // Avatar core'da yaşıyor (Company.avatarUrl + cdn upload).
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
      // Mail-spesifik inbox endpoint'leri (SSE events + thread/uid detayları)
      // — NotificationsProvider storage'da da çalışıyor, mail bildirimleri
      // burada da görünsün. Stream Next.js rewrite üzerinden proxy edilir.
      {
        source: "/api/companies/:slug/inbox/:path*",
        destination: `${mailUrl}/api/companies/:slug/inbox/:path*`,
      },
      // Mail gateway — team üyesi yetki formu domains/mailboxes'ı buradan
      // listeler (bu route'lar storage'da yok, mail'e proxy). Core'daki aynı
      // rewrite'la paralel.
      {
        source: "/api/mail/companies/:path*",
        destination: `${mailUrl}/api/companies/:path*`,
      },
    ]
  },
  // Root path → default locale. Server component `redirect("/en")` standalone'da
  // bind address (`0.0.0.0:3002`) base alıyor → `localhost:3002/en`. Deklaratif
  // `redirects()` reverse proxy header'larından bağımsız relative çalışır.
  //
  // Auth sayfaları (login/signup/forgot-password vb.) yalnızca core'da yaşar;
  // mail/storage'ta bunlar yoktu, kullanıcı doğrudan
  // `storage.sentroy.com/{lang}/login`'e gelirse 404 düşüyordu. Artık core'a
  // yönlendiriyoruz. PUBLIC core URL gerekli — internal `http://core:3000`
  // tarayıcıya gönderilemez.
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
