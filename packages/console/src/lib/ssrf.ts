import "server-only"
import { lookup } from "node:dns/promises"

/**
 * SSRF koruması — kullanıcı tarafından verilen URL'lere (webhook hedefi,
 * domain-connect discovery host'u vb.) server-side fetch ATMADAN ÖNCE çağrılır.
 *
 * Engellenenler: http(s) dışı şemalar, literal private/loopback/link-local/
 * metadata IP'leri, internal hostname'ler, VE hostname'in private bir IP'ye
 * resolve olması (temel DNS rebinding hafifletmesi). Atıcı bir API — geçersizse
 * `Error` fırlatır; caller yakalayıp delivery'yi failed kaydetmeli.
 *
 * Not: resolve-then-fetch TOCTOU (DNS rebinding) tam kapatmaz — tam koruma
 * resolve edilen IP'ye Host header'ıyla bağlanmayı gerektirir. Bu guard saldırı
 * eşiğini ciddi yükseltir (literal IP + ilk-resolve private bloklanır).
 */

function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase()
  // IPv4-mapped IPv6 (::ffff:127.0.0.1) → düz IPv4'e indir
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice("::ffff:".length))
  // IPv6
  if (v === "::1" || v === "::") return true
  if (/^fe80:/.test(v)) return true // link-local
  if (/^f[cd][0-9a-f]{2}:/.test(v)) return true // unique-local fc00::/7
  // IPv4
  if (/^0\./.test(v)) return true // 0.0.0.0/8
  if (/^127\./.test(v)) return true // loopback
  if (/^10\./.test(v)) return true
  if (/^192\.168\./.test(v)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(v)) return true
  if (/^169\.254\./.test(v)) return true // link-local + cloud metadata (169.254.169.254)
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(v)) return true // CGNAT 100.64/10
  return false
}

const BLOCKED_HOST_SUFFIXES = [".localhost", ".internal", ".local", ".cluster"]

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SsrfBlockedError"
  }
}

/**
 * URL'i doğrula; güvenliyse parse edilmiş `URL`'i döner, değilse
 * `SsrfBlockedError` fırlatır.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new SsrfBlockedError("Invalid URL")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfBlockedError("Only http(s) URLs are allowed")
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "") // [::1] → ::1

  if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new SsrfBlockedError("Internal hostnames are not allowed")
  }
  // Literal IP host
  if (isPrivateIp(host)) {
    throw new SsrfBlockedError("URL targets a private/internal address")
  }
  // DNS resolve → hiçbir cevap private olmamalı
  let records: { address: string }[]
  try {
    records = await lookup(host, { all: true })
  } catch {
    throw new SsrfBlockedError("Host does not resolve")
  }
  if (records.length === 0) {
    throw new SsrfBlockedError("Host does not resolve")
  }
  for (const r of records) {
    if (isPrivateIp(r.address)) {
      throw new SsrfBlockedError("URL resolves to a private/internal address")
    }
  }
  return url
}
