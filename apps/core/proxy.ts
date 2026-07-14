import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { buildFrameSrc } from "@/lib/app-store/embed-csp"
import {
  serverRootDomain,
  docsHost,
  vaultHost,
  primaryHosts,
  trustedOriginRegex,
} from "@workspace/auth/lib/domains"

/**
 * Core app proxy — Next.js 16 replaces `middleware.ts` with `proxy.ts`.
 *
 * Three responsibilities:
 *
 *   1. Subdomain virtual hosts — `docs.sentroy.com` core'un `/docs`
 *      route'una internal rewrite. Aynı Next process tek deploy'la
 *      iki host sunar (sentroy.com + docs.sentroy.com). status.sentroy.com
 *      Phase 1.0 itibariyle ayrı `apps/status` container'ında — proxy
 *      burada bilmez. vault.sentroy.com `rewriteVaultSubdomain` ile
 *      farklı pattern.
 *
 *      Çift yönlü çalışır:
 *        • `docs.sentroy.com/foo`         → rewrite `/docs/foo`
 *        • `docs.sentroy.com/docs/foo`    → 308 redirect `docs.sentroy.com/foo`
 *          (Mevcut <Link href="/docs/...">'ler tıklanınca canonical URL'e
 *           düşer; refresh edildiğinde de kullanıcı temiz URL görür.)
 *        • `sentroy.com/docs/...`         → 308 redirect `docs.sentroy.com/...`
 *          (Eski bookmark ve external link'ler subdomain'e taşınsın.)
 *
 *      `localhost` / IP / önizleme host'ları no-op kalır — geliştirme
 *      ortamında subdomain mapping olmadan çalışmaya devam eder.
 *
 *   2. Gateway CORS — `/api/storage/*`, `/api/mail/*` ve direkt core API
 *      yüzeyleri (`/api/companies/*`, `/api/profile/*`, vs.) cross-origin
 *      tüketildiği için OPTIONS preflight'a cevap verir ve gerçek
 *      response'lara CORS header'ları damgalar.
 *
 *      Cookie auth (`credentials: include`) `*` wildcard'ı reddettiği
 *      için Origin echo + Allow-Credentials true ile cevaplanır.
 *      Wildcard yalnızca Origin yokken (server-to-server) kullanılır.
 *
 *   3. `/api/auth/*` matcher'ın dışındadır — better-auth kendi
 *      session-aware origin allowlist'ini yönetir, çift damga
 *      header'ları bozar.
 */
const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
const ALLOWED_HEADERS =
  "Authorization, Content-Type, X-Requested-With, Accept, X-Sentroy-Company-Slug, X-Sentroy-Bucket-Slug, X-Sentroy-Source"

// Host'lar tek kök domain'den türetilir (default sentroy.com → mevcut davranış
// birebir korunur). Self-host: SENTROY_ROOT_DOMAIN env. (Faz 3 / open-source.)
const ROOT_DOMAIN = serverRootDomain()
const DOCS_HOST = docsHost(ROOT_DOMAIN)
const VAULT_HOST = vaultHost(ROOT_DOMAIN)
const PRIMARY_HOSTS = primaryHosts(ROOT_DOMAIN)

/**
 * Kimlikli (cookie) CORS yalnızca güvenilir origin'lere açılır:
 * `*.<root>` (cross-subdomain session) + localhost (dev). Diğer her
 * origin (external browser-SDK) yalnız Bearer stk_ token kullanır — onlara
 * Allow-Credentials VERİLMEZ, böylece kötü niyetli bir site kurbanın session
 * cookie'siyle credentialed istek atıp cevabı OKUYAMAZ (credential theft).
 */
const TRUSTED_ORIGIN_RE = trustedOriginRegex(ROOT_DOMAIN)
const LOCAL_ORIGIN_RE =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i

function isTrustedOrigin(origin: string | null): boolean {
  return (
    !!origin && (TRUSTED_ORIGIN_RE.test(origin) || LOCAL_ORIGIN_RE.test(origin))
  )
}

function corsHeaders(origin: string | null): Record<string, string> {
  const base: Record<string, string> = {
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  }
  if (isTrustedOrigin(origin)) {
    // Güvenilir sentroy origin'i → cookie auth'a izin (cross-subdomain).
    base["Access-Control-Allow-Origin"] = origin as string
    base["Access-Control-Allow-Credentials"] = "true"
  } else {
    // Üçüncü-parti / origin'siz → Bearer-only; credentials YOK.
    base["Access-Control-Allow-Origin"] = origin || "*"
  }
  return base
}

function isApiPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/storage/") ||
    pathname.startsWith("/api/mail/") ||
    pathname.startsWith("/api/companies/") ||
    pathname.startsWith("/api/profile/") ||
    pathname.startsWith("/api/invitations/") ||
    pathname.startsWith("/api/passkey/")
  )
}

/**
 * Cross-subdomain redirect URL'i — `URL.clone()` kullanmıyoruz çünkü
 * `nextUrl` Next.js'in inbound bind port'unu (3000) koruyor; reverse
 * proxy arkasında kullanıcının gördüğü port 443 ya da yok. Manuel
 * inşa ile port her zaman temizleniyor; query string varsa korunuyor.
 */
function buildSubdomainUrl(
  host: string,
  pathname: string,
  search: string,
): string {
  const cleanPath = pathname.startsWith("/") ? pathname : `/${pathname}`
  return `https://${host}${cleanPath}${search || ""}`
}

/**
 * Subdomain → internal-path mapping. docs.sentroy.com için canonical
 * URL yardımcısı; vault farklı pattern, status ayrı app'e taşındı.
 */
/**
 * Public discovery files served at apps/core/public root — must NOT
 * be rewritten through /docs prefix on docs.sentroy.com (otherwise
 * /llms.txt → /docs/llms.txt → 404). LLM agents conventionally fetch
 * these at the site root regardless of subdomain.
 */
const PUBLIC_PASSTHROUGH = new Set([
  "/llms.txt",
  "/llms-full.txt",
  "/llms-mail.txt",
  "/llms-storage.txt",
  "/llms-auth.txt",
  "/llms-vault.txt",
  "/skill.md",
  "/agents.md",
  "/robots.txt",
  "/sitemap.xml",
  "/favicon.ico",
  // PWA — manifest/SW/ikonlar subdomain'lerde de kökten çözülsün (docs'ta
  // /docs prefix rewrite'ına girip 404 olmasın).
  "/manifest.webmanifest",
  "/sw.js",
  "/icon-192.png",
  "/icon-512.png",
  "/sentroy_pwa.png",
])

function rewriteSubdomain(
  request: NextRequest,
  prefix: "/docs",
): NextResponse {
  const url = request.nextUrl
  const path = url.pathname
  const host = (request.headers.get("host") || "")
    .split(":")[0]
    .toLowerCase()

  // Static discovery files (llms.txt, skill.md, agents.md, robots, etc.)
  // bypass the /docs prefix rewrite so they resolve from apps/core/public
  // at the subdomain root.
  if (PUBLIC_PASSTHROUGH.has(path)) {
    return NextResponse.next()
  }

  // Mevcut <Link href="/docs/..."> ya da hard-coded internal path
  // subdomain üzerinde tıklanınca canonical (prefix-stripped) URL'e
  // permanent redirect — kullanıcı her zaman temiz URL görür.
  // Manuel URL build → standalone mode'da bind port (3000) sızmasın.
  if (path === prefix || path.startsWith(`${prefix}/`)) {
    const clean = path.slice(prefix.length) || "/"
    return NextResponse.redirect(
      buildSubdomainUrl(host, clean, url.search),
      308,
    )
  }

  // Bare path → internal rewrite. URL bar değişmez; Next prefix'li
  // route segmentini render eder.
  const target = url.clone()
  target.pathname = `${prefix}${path === "/" ? "" : path}`
  return NextResponse.rewrite(target)
}

/**
 * vault.sentroy.com — docs/status'tan farklı, "scoped" subdomain.
 * Per-company env vault UI core app'in `/[lang]/d/[slug]/vault` route'unda
 * yaşıyor; subdomain üstünde URL daha temiz görünsün:
 *
 *   • vault.sentroy.com/                        → 308 to /[lang]/d (team picker)
 *   • vault.sentroy.com/[lang]                  → renders [lang] root (login redirect)
 *   • vault.sentroy.com/[lang]/d                → team picker (kullanıcı şirket seçer)
 *   • vault.sentroy.com/[lang]/d/[slug]         → rewrite to /[lang]/d/[slug]/vault
 *   • vault.sentroy.com/[lang]/d/[slug]/vault   → 308 to /[lang]/d/[slug] (canonical strip)
 *   • Diğer her şey (auth pages, _next, /api)   → pass through
 *
 * Sonuç: kullanıcı subdomain'de hep "ben vault'tayım" görünümünde,
 * sidebar'da company switch / login flow'u core'unkiyle aynı çalışır.
 */
function rewriteVaultSubdomain(request: NextRequest): NextResponse {
  const url = request.nextUrl
  const path = url.pathname
  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase()

  // Pass-through path'ler — auth flow'u (login/signup/verify-email vs)
  // ve API'ler hiç dokunulmaz.
  if (
    path.startsWith("/api/") ||
    path.startsWith("/_next/") ||
    /\/(login|signup|forgot-password|reset-password|verify-email|verify-email-pending|two-factor|passwordless|invites)(\/|$)/.test(path) ||
    path === "/favicon.ico"
  ) {
    return NextResponse.next()
  }

  // Root → team picker
  if (path === "/" || path === "") {
    // Default locale fallback — kullanıcı /[lang]/d'ye düşer.
    return NextResponse.redirect(buildSubdomainUrl(host, "/en/d", url.search), 308)
  }

  // Çıplak /[lang] (ör. /en, /tr — /d yok) → vault'un pazarlama yüzeyi YOK;
  // aksi halde core'un LandingV2'si vault.sentroy.com altında render oluyordu.
  // Core landing'e yolla (tüm ürünleri anlatıyor).
  const langRoot = path.match(/^\/([^/]+)\/?$/)
  if (langRoot) {
    const coreUrl = process.env.NEXT_PUBLIC_CORE_APP_URL || "https://sentroy.com"
    return NextResponse.redirect(`${coreUrl}/${langRoot[1]}`, 308)
  }

  // /[lang]/d/[slug]/vault (legacy / Link click) → strip vault, canonical
  // URL = /[lang]/d/[slug]
  const vaultMatch = path.match(/^\/([^/]+)\/d\/([^/]+)\/vault\/?$/)
  if (vaultMatch) {
    const [, lang, slug] = vaultMatch
    return NextResponse.redirect(
      buildSubdomainUrl(host, `/${lang}/d/${slug}`, url.search),
      308,
    )
  }

  // /[lang]/d/[slug] (no further segments) → internal rewrite to .../vault
  const slugMatch = path.match(/^\/([^/]+)\/d\/([^/]+)\/?$/)
  if (slugMatch) {
    const [, lang, slug] = slugMatch
    const target = url.clone()
    target.pathname = `/${lang}/d/${slug}/vault`
    return NextResponse.rewrite(target)
  }

  // Diğer her şey (örn. /[lang]/d, /[lang]/profile, /[lang]/d/[slug]/settings)
  // pass-through.
  return NextResponse.next()
}

/**
 * Sentroy OS rotaları (`/[lang]/d/...`, `/[lang]/admin/...`) — bu dökümanlara
 * App Store store app'lerini frame'leyebilmek için dinamik CSP `frame-src`
 * basılır. Yalnız production; dev'de app'ler cross-port olduğundan strict
 * frame-src local OS iframe'lerini bozar.
 */
function isOsRoute(path: string): boolean {
  return /^\/[a-z]{2}\/(d|admin)(\/|$)/.test(path)
}

// Onaylı store origin'leri DB'den gelir; edge proxy Mongo'ya erişemez →
// cache'li `/api/app-store/embed-origins` route'u fetch edilir (modül-içi 60s
// best-effort cache + HTTP cache).
let embedOriginsCache: { origins: string[]; at: number } | null = null

async function getEmbedOrigins(request: NextRequest): Promise<string[]> {
  const now = Date.now()
  if (embedOriginsCache && now - embedOriginsCache.at < 60_000) return embedOriginsCache.origins
  try {
    const res = await fetch(new URL("/api/app-store/embed-origins", request.url), {
      headers: { accept: "application/json" },
    })
    if (!res.ok) return embedOriginsCache?.origins ?? []
    const json = (await res.json()) as { origins?: string[] }
    const origins = json.origins ?? []
    embedOriginsCache = { origins, at: now }
    return origins
  } catch {
    return embedOriginsCache?.origins ?? []
  }
}

/**
 * Session-cookie presence (heuristic, no DB lookup). Matches better-auth's
 * `[__Secure-]better-auth.session_token` + chunked variants. Used only to skip
 * the marketing landing for signed-in users; a stale cookie just lands on /d
 * which re-validates the real session.
 */
function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((c) => c.name.includes("better-auth.session_token"))
}

export default async function proxy(request: NextRequest) {
  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase()
  const url = request.nextUrl
  const path = url.pathname

  // ── 1. Subdomain virtual hosts ──────────────────────────────────────
  if (host === DOCS_HOST) {
    return rewriteSubdomain(request, "/docs")
  }
  if (host === VAULT_HOST) {
    return rewriteVaultSubdomain(request)
  }

  // sentroy.com/docs(/...) → docs subdomain'e canonical redirect.
  // Eski URL'leri kaybetmemek + tek doğru URL pattern'i korumak için.
  // /status(/...) Phase 1.0 itibariyle ayrı app (status.sentroy.com).
  if (PRIMARY_HOSTS.has(host)) {
    if (path === "/docs" || path.startsWith("/docs/")) {
      const clean = path.slice("/docs".length) || "/"
      return NextResponse.redirect(
        buildSubdomainUrl(DOCS_HOST, clean, url.search),
        308,
      )
    }
    // Signed-in users skip the marketing landing → straight to the app.
    // Only the locale roots (/en, /tr, …) are redirected; deeper marketing
    // pages (/pricing, /investors, …) stay reachable. 307 (session-dependent,
    // not cacheable). `/` first resolves to `/<locale>`, which re-enters here.
    const localeRoot = path.match(/^\/(en|tr|ru|zh|es)$/)?.[1]
    if (localeRoot && hasSessionCookie(request)) {
      return NextResponse.redirect(new URL(`/${localeRoot}/d`, url), 307)
    }
  }

  // ── 2. CORS — yalnızca gateway/API path'lerine ─────────────────────
  if (isApiPath(path)) {
    const origin = request.headers.get("origin")
    if (request.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
    }
    const res = NextResponse.next()
    for (const [key, value] of Object.entries(corsHeaders(origin))) {
      res.headers.set(key, value)
    }
    return res
  }

  // ── 3. Sayfa render ────────────────────────────────────────────────
  // Gerçek public pathname'i request header'a ilet → `[lang]/layout.tsx`
  // generateMetadata bunu okuyup HER sayfa için self-referential canonical +
  // hreflang üretir (aksi halde layout sabit canonical'ı tüm alt sayfalara
  // miras kalıp hepsini locale-home'un duplicate'ı olarak işaretler → SEO).
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-pathname", path)
  const res = NextResponse.next({ request: { headers: requestHeaders } })
  // Sentroy OS — dinamik CSP frame-src (App Store store app'leri).
  // Prod'da her zaman basılır; self-host'ta NODE_ENV "production" değilse guard
  // sessizce düşmesin diye SENTROY_EMBED_CSP=1 ile açıkça zorlanabilir. Dev'de
  // (NODE_ENV=development, flag yok) basılmaz — cross-port iframe'ler bozulmaz.
  const embedCspEnabled =
    process.env.NODE_ENV === "production" ||
    process.env.SENTROY_EMBED_CSP === "1"
  if (embedCspEnabled && isOsRoute(path)) {
    const origins = await getEmbedOrigins(request)
    res.headers.set("Content-Security-Policy", buildFrameSrc(origins))
  }
  return res
}

export const config = {
  // Geniş matcher — docs/status subdomain rewrite'ı sayfa rotalarına
  // uygulanmalı. `_next/*` (Next internal) ve favicon dışında her şey
  // proxy'den geçer. Nokta içeren path'ler de dahil çünkü `feed.json`
  // gibi route handler'lar app router içinde dosya-uzantılı segment
  // olarak yaşıyor — bunlar da subdomain rewrite'ından geçmeli.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
