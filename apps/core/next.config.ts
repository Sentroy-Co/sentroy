import type { NextConfig } from "next"
import path from "node:path"
import createNextIntlPlugin from "next-intl/plugin"
import bundleAnalyzer from "@next/bundle-analyzer"
import pkg from "./package.json"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")
// ANALYZE=1 iken client/server bundle raporu üretir; aksi halde no-op
// (prod build'e ve per-request CPU'ya etkisi yok). Yerelde çalıştır:
//   ANALYZE=1 bun run build --filter=core
const withAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "1" })

/**
 * SDK gateway rewrites — tüketici yalnızca `https://sentroy.com` bilir,
 * core istekleri arka plandaki mail/storage subdomain'lerine stream
 * olarak forward eder.
 *
 *   /api/mail/companies/:path*    → MAIL_APP_URL/api/companies/:path*
 *   /api/storage/companies/:path* → STORAGE_APP_URL/api/companies/:path*
 *
 * Next.js rewrites destination external URL olduğunda request/response
 * body'sini stream olarak geçirir — multipart upload ve binary download
 * Vercel dışı deploy'da boyut sınırı olmadan çalışır. Vercel'de 4.5MB
 * body limit var; büyük upload'lar için doğrudan subdomain önerilir.
 */
// Resolution order:
//   1. MAIL_APP_URL / STORAGE_APP_URL — internal Docker network URL
//      (`http://mail:3001`), aynı compose stack için. Same-host network
//      olmadığında set edilmez.
//   2. NEXT_PUBLIC_*_APP_URL — public subdomain (`https://mail.sentroy.com`).
//      Subdomain'ler ayrı Coolify service'lerinde çalışıyorsa internal
//      yok ama public set'tir; rewrite buna düşer ve TLS üzerinden
//      forward eder. Self-traffic ekstra latency var ama çalışır.
//   3. localhost — yalnızca yerel dev fallback.
//
// User'ın "ECONNREFUSED localhost:3002" loguyla geldiği case bu — internal
// MAIL/STORAGE_APP_URL set değildi, NEXT_PUBLIC_* set'ti ama eskisi
// localhost'a düşüyordu. Artık public URL'e düşer ve istekler çalışır.
function resolveSubdomainUrl(
  internal: string | undefined,
  publicUrl: string | undefined,
  fallback: string,
  label: string,
): string {
  const url = internal || publicUrl || fallback
  if (process.env.NODE_ENV === "production") {
    if (!internal && !publicUrl) {
      console.warn(
        `⚠ [core/next.config] Neither ${label}_APP_URL nor NEXT_PUBLIC_${label}_APP_URL is set — rewrites will hit ${fallback} and fail with ECONNREFUSED. Set one of them in Coolify env.`,
      )
    } else if (!internal && publicUrl) {
      console.warn(
        `ℹ [core/next.config] ${label}_APP_URL not set — falling back to NEXT_PUBLIC_${label}_APP_URL (${publicUrl}). For lower latency in same-stack deploys, set internal ${label}_APP_URL=http://${label.toLowerCase()}:300x.`,
      )
    }
  }
  return url.replace(/\/+$/, "")
}

const mailUrl = resolveSubdomainUrl(
  process.env.MAIL_APP_URL,
  process.env.NEXT_PUBLIC_MAIL_APP_URL,
  "http://localhost:3001",
  "MAIL",
)
const storageUrl = resolveSubdomainUrl(
  process.env.STORAGE_APP_URL,
  process.env.NEXT_PUBLIC_STORAGE_APP_URL,
  "http://localhost:3002",
  "STORAGE",
)
const whatsappUrl = resolveSubdomainUrl(
  process.env.WHATSAPP_APP_URL,
  process.env.NEXT_PUBLIC_WHATSAPP_APP_URL,
  "http://localhost:3007",
  "WHATSAPP",
)
const linearUrl = resolveSubdomainUrl(
  process.env.LINEAR_APP_URL,
  process.env.NEXT_PUBLIC_LINEAR_APP_URL,
  "http://localhost:3009",
  "LINEAR",
)
const backupUrl = resolveSubdomainUrl(
  process.env.BACKUP_APP_URL,
  process.env.NEXT_PUBLIC_BACKUP_APP_URL,
  "http://localhost:3010",
  "BACKUP",
)

const nextConfig: NextConfig = {
  // Version footer için build-time inline. Deploy güncelliği görmek için
  // login sayfasında basılır — Coolify pull cycle'ı doğru mu debug kolaylığı.
  env: {
    APP_VERSION: pkg.version,
  },
  devIndicators: false,
  transpilePackages: [
    "@workspace/ui",
    "@workspace/db",
    "@workspace/auth",
    "@workspace/console",
    "@workspace/cdn-client",
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
  // Barrel import'ları (özellikle hugeicons) build-time'da per-icon deep
  // import'a çevrilir → yalnız gerçekten kullanılan ikonlar bundle'a girer.
  // Kaynak değişikliği yok; webpack + Turbopack ile çalışır.
  experimental: {
    optimizePackageImports: ["@hugeicons/core-free-icons", "@hugeicons/react"],
  },
  output: "standalone",
  // Monorepo root — standalone output workspace packages'ı bu path'ten
  // tracelamesi için gerekli. Aksi halde `@workspace/*` içeriği imaja
  // kopyalanmaz ve runtime'da `MODULE_NOT_FOUND` verir.
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      {
        source: "/api/mail/companies/:path*",
        destination: `${mailUrl}/api/companies/:path*`,
      },
      {
        source: "/api/storage/companies/:path*",
        destination: `${storageUrl}/api/companies/:path*`,
      },
      {
        source: "/api/whatsapp/companies/:path*",
        destination: `${whatsappUrl}/api/companies/:path*`,
      },
      {
        source: "/api/linear/companies/:path*",
        destination: `${linearUrl}/api/companies/:path*`,
      },
      {
        source: "/api/backup/companies/:path*",
        destination: `${backupUrl}/api/companies/:path*`,
      },
    ]
  },
  // Root path → default locale. Server component'taki `redirect("/en")` Next.js
  // standalone'da Location header'ını absolute URL olarak set ediyor ve reverse
  // proxy arkasında bind address'i (`http://0.0.0.0:3000`) base alıyor →
  // tarayıcı `http://localhost:3000/en`'e gidiyor. Deklaratif `redirects()`
  // aynı problemi yaşamaz, relative path olarak handle edilir.
  //
  // `missing` clause ile docs subdomain'inde devre dışı — Next.js'in
  // redirects() config'i proxy.ts'den ÖNCE çalışıyor; eğer burada
  // çalışırsa docs.sentroy.com/ → /en'e redirect olur, sonra proxy
  // /docs/en'e rewrite eder ve 404 döner. Docs subdomain'inde root `/`
  // proxy tarafından `/docs`'a rewrite edilmesi gerekiyor — önce bu
  // redirect'in atlanması şart.
  // (status.sentroy.com Phase 1.0 itibariyle ayrı app, core proxy bilmez.)
  async redirects() {
    return [
      {
        source: "/",
        missing: [{ type: "host", value: "docs.sentroy.com" }],
        destination: "/en",
        permanent: false,
      },
    ]
  },
  // Statik public asset'ler için uzun immutable cache + baseline güvenlik
  // header'ları. routes-manifest'e gömülür = per-request CPU maliyeti YOK,
  // output:standalone ile çalışır. Cloudflare origin header'larını (respect
  // existing) taşır → hem tarayıcı hem edge uzun süre cache'ler.
  async headers() {
    // İçerik yalnız deploy'la değişen versiyonlanmış asset'ler. Değişiklik
    // gerekirse dosya adını değiştir veya CF purge — README'deki cache notu.
    const LONG = "public, max-age=31536000, immutable"
    // ── Full CSP: REPORT-ONLY (enforce ETMEZ, yalnız ihlal raporlar) ──────────
    // Denetlenmiş allowlist. Enforce'a çevirmeden önce birkaç gün rapor izlenir.
    // Ayrı header adı → enforce edilen frame-ancestors + proxy.ts frame-src ile
    // çakışmaz. script-src 'unsafe-inline' ZORUNLU (Next App Router inline
    // hydration + inline analytics; nonce altyapısı yok). 'wasm-unsafe-eval'
    // shiki oniguruma WASM için. img-src 'https:' (avatar + admin OG rastgele host).
    const CSP_REPORT_ONLY = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self' https://*.sentroy.com",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://plausible.io https://static.hotjar.com https://script.hotjar.com https://connect.facebook.net https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://cdn.sentroy.com https://*.sentroy.com https://www.google-analytics.com https://region1.google-analytics.com https://*.analytics.google.com https://*.google-analytics.com https://www.googletagmanager.com https://plausible.io https://*.hotjar.com https://*.hotjar.io wss://*.hotjar.com https://www.facebook.com https://connect.facebook.net https://challenges.cloudflare.com",
      "frame-src 'self' https://*.sentroy.com https://challenges.cloudflare.com",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "media-src 'self' blob: https://cdn.sentroy.com https://*.sentroy.com",
      "upgrade-insecure-requests",
    ].join("; ")
    return [
      { source: "/os-wallpapers/:path*", headers: [{ key: "Cache-Control", value: LONG }] },
      { source: "/os-app-icons/:path*", headers: [{ key: "Cache-Control", value: LONG }] },
      { source: "/svg/:path*", headers: [{ key: "Cache-Control", value: LONG }] },
      { source: "/css/:path*", headers: [{ key: "Cache-Control", value: LONG }] },
      { source: "/lottie/:path*", headers: [{ key: "Cache-Control", value: LONG }] },
      { source: "/business/:path*", headers: [{ key: "Cache-Control", value: LONG }] },
      { source: "/trusted/:path*", headers: [{ key: "Cache-Control", value: LONG }] },
      {
        // Baseline güvenlik header'ları (PageSpeed "Best Practices" + prod
        // hardening). NOT X-Frame-Options: blanket DENY/SAMEORIGIN Sentroy OS'un
        // *.sentroy.com iframe'lerini kırar — clickjacking koruması bunun yerine
        // CSP frame-ancestors ile (aşağıda) yapılır. OS route'larında proxy.ts
        // ayrıca frame-src'li kendi CSP'sini basar; iki CSP header'ı geçerlidir,
        // her biri kendi non-overlapping direktifini enforce eder.
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // allow-popups: "Sign in with Sentroy" OAuth popup'ları window.opener'ı korusun.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://*.sentroy.com" },
          // Full policy şimdilik yalnız RAPOR modunda — hiçbir şeyi kırmaz.
          { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
        ],
      },
    ]
  },
}

export default withAnalyzer(withNextIntl(nextConfig))
