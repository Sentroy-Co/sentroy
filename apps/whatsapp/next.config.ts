import type { NextConfig } from "next"
import path from "node:path"
import createNextIntlPlugin from "next-intl/plugin"
import pkg from "./package.json"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

// Gateway rewrites — whatsapp subdomain'inde tanımlı olmayan ortak endpoint'leri
// (auth, company list/detail, avatar) core'a forward et. WhatsApp gateway'ine
// (Baileys servisi) çağrılar server-side yapılır; rewrite'lanmaz.
const coreUrl = (
  process.env.CORE_APP_URL ||
  process.env.NEXT_PUBLIC_CORE_APP_URL ||
  "http://localhost:3000"
).replace(/\/+$/, "")

if (process.env.NODE_ENV === "production") {
  if (!process.env.CORE_APP_URL && !process.env.NEXT_PUBLIC_CORE_APP_URL) {
    console.warn(
      "⚠ [whatsapp/next.config] Neither CORE_APP_URL nor NEXT_PUBLIC_CORE_APP_URL is set — auth + cross-app rewrites will hit localhost:3000 and fail with ECONNREFUSED. Set one in Coolify env.",
    )
  }
  if (!process.env.WHATSAPP_GATEWAY_URL) {
    console.warn(
      "⚠ [whatsapp/next.config] WHATSAPP_GATEWAY_URL is not set — session/send/events calls will hit localhost:4200. Set it to the gateway's internal URL in Coolify env.",
    )
  }
}

const nextConfig: NextConfig = {
  env: {
    APP_VERSION: pkg.version,
  },
  devIndicators: false,
  transpilePackages: [
    "@workspace/ui",
    "@workspace/db",
    "@workspace/auth",
    "@workspace/console",
  ],
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      // better-auth endpoint'leri sadece core'da kurulu.
      {
        source: "/api/auth/:path*",
        destination: `${coreUrl}/api/auth/:path*`,
      },
      // Company list + detail core'da; whatsapp alt route'ları lokalde kalır.
      {
        source: "/api/companies",
        destination: `${coreUrl}/api/companies`,
      },
      {
        source: "/api/companies/:slug",
        destination: `${coreUrl}/api/companies/:slug`,
      },
      // Avatar core'da (CompanyAvatar + team switcher).
      {
        source: "/api/companies/:slug/avatar",
        destination: `${coreUrl}/api/companies/:slug/avatar`,
      },
      {
        source: "/api/companies/:slug/avatar/img/:mediaId",
        destination: `${coreUrl}/api/companies/:slug/avatar/img/:mediaId`,
      },
      // Passkey endpoint'leri core'da (better-auth session bridge).
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
