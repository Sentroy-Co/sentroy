/**
 * Platform kök domain'i — TEK KAYNAK. Default `sentroy.com` → mevcut prod
 * davranışını AYNEN korur (env set edilmezse hiçbir şey değişmez). Self-host
 * için operatör kökünü env ile verir:
 *   - SENTROY_ROOT_DOMAIN     (server: proxy/API)
 *   - NEXT_PUBLIC_ROOT_DOMAIN (client: browser component'leri; build-time inline)
 *
 * Tüm cross-subdomain host/CORS/CSP türetmeleri buradan yapılır → self-host'ta
 * tek env değişikliğiyle taşınır. (Faz 3 / open-source epic.)
 */

const DEFAULT_ROOT = "sentroy.com"

/** `https://foo.com:3000/x` → `foo.com`. Boşsa undefined. */
function normalize(v: string | undefined): string | undefined {
  if (!v) return undefined
  const t = v
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
  return t || undefined
}

/** Server tarafı (proxy, API route, middleware) kök domain. */
export function serverRootDomain(): string {
  return (
    normalize(process.env.SENTROY_ROOT_DOMAIN) ??
    normalize(process.env.NEXT_PUBLIC_ROOT_DOMAIN) ??
    DEFAULT_ROOT
  )
}

/** Client tarafı (browser) kök domain — yalnız NEXT_PUBLIC_* build-time inline'lanır. */
export function clientRootDomain(): string {
  return normalize(process.env.NEXT_PUBLIC_ROOT_DOMAIN) ?? DEFAULT_ROOT
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Kimlikli (cookie) CORS + OS postMessage için güvenilir-origin regex'i:
 * `*.<root>` (tüm subdomain'ler) + kökün kendisi, opsiyonel port.
 * root="sentroy.com" → `/^https?:\/\/([a-z0-9-]+\.)*sentroy\.com(:\d+)?$/i`
 * (mevcut hardcoded regex ile BİREBİR aynı).
 */
export function trustedOriginRegex(root: string): RegExp {
  return new RegExp(
    `^https?:\\/\\/([a-z0-9-]+\\.)*${escapeRegExp(root)}(:\\d+)?$`,
    "i",
  )
}

export function docsHost(root: string): string {
  return `docs.${root}`
}
export function vaultHost(root: string): string {
  return `vault.${root}`
}
export function primaryHosts(root: string): Set<string> {
  return new Set([root, `www.${root}`])
}

/** CSP `frame-src` wildcard origin — `https://*.<root>`. */
export function wildcardHttpsOrigin(root: string): string {
  return `https://*.${root}`
}

/** Kök (apex/core) origin — `https://<root>`. robots host, sitemap kökü, landing. */
export function rootOrigin(root: string): string {
  return `https://${root}`
}

/**
 * Bir alt-app origin'i — `https://<sub>.<root>` (mail/storage/vault/docs/…).
 * root="sentroy.com", sub="mail" → "https://mail.sentroy.com" (mevcut hardcoded
 * fallback'lerle BİREBİR aynı). App launcher / landing / downloader host-key'leri
 * tek `NEXT_PUBLIC_ROOT_DOMAIN` ile taşınır.
 */
export function subAppOrigin(root: string, sub: string): string {
  return `https://${sub}.${root}`
}
