import type { NextConfig } from "next"
import path from "node:path"
import { createRequire } from "node:module"
import createNextIntlPlugin from "next-intl/plugin"

const pkg = createRequire(import.meta.url)("./package.json") as { version: string }

/**
 * Sentroy Downloader — public, login'siz medya indirici (yt-dlp tabanlı).
 * Çoklu subdomain: youtube.sentroy.com (+ ileride soundcloud., instagram.).
 * Tek app, host header'a göre platform/tema. SEO-ağırlıklı, 10 dilli.
 *
 * KENDİ i18n routing'i (10 dil) — paylaşılan @workspace/auth routing'i
 * KULLANMAZ (o en/tr; genişletmek diğer app'leri kırardı).
 */
const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

// better-auth gateway — opsiyonel login için /api/auth/* core'a rewrite edilir
// (storage/mail deseni). Downloader kendi auth handler'ını barındırmaz; cookie
// cross-subdomain (.sentroy.com) olduğu için core'daki oturum burada görünür.
// Docker'da internal hostname (http://core:3000), ayrı resource'larda HTTPS.
const coreUrl = (
  process.env.CORE_APP_URL ||
  process.env.NEXT_PUBLIC_CORE_APP_URL ||
  "http://localhost:3000"
).replace(/\/+$/, "")

if (!process.env.CORE_APP_URL && !process.env.NEXT_PUBLIC_CORE_APP_URL) {
  console.warn(
    "⚠ [downloader/next.config] Ne CORE_APP_URL ne NEXT_PUBLIC_CORE_APP_URL set — /api/auth/* rewrite localhost:3000'e gider (opsiyonel login çalışmaz). Coolify env'de birini set et.",
  )
}

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  env: { APP_VERSION: pkg.version },
  typescript: { ignoreBuildErrors: true },
  async rewrites() {
    return [
      // Opsiyonel login: better-auth endpoint'leri core'da host edilir.
      { source: "/api/auth/:path*", destination: `${coreUrl}/api/auth/:path*` },
      // Ücretli araç checkout'u (tek-seferlik Polar paketleri) core'da.
      { source: "/api/billing/tool-checkout", destination: `${coreUrl}/api/billing/tool-checkout` },
      // Ücretli araç servis API'leri (entitlement + provider) core'da —
      // downloader Mongo/Polar'a bağlanmaz, same-origin cookie forward edilir.
      { source: "/api/tools/:path*", destination: `${coreUrl}/api/tools/:path*` },
    ]
  },
  images: {
    // Platform thumbnail'leri (YouTube i.ytimg.com vb.) — next/image değil
    // <img> kullanıyoruz ama remotePatterns güvenli tarafta dursun.
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "*.ytimg.com" },
    ],
  },
}

export default withNextIntl(config)
