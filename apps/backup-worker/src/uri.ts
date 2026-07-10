/**
 * MongoDB URI yardımcıları (worker tarafı). apps/backup/lib/mongo-uri.ts ile
 * aynı mantık — kredensiyal maskeleme + db-adı türetme + doğrulama.
 */

export function isMongoUri(uri: string): boolean {
  return /^mongodb(\+srv)?:\/\//i.test(uri.trim())
}

import { lookup, resolveSrv } from "node:dns/promises"

/**
 * SSRF guard — kayıtlı URI'nin PUBLIC bir host'a işaret ettiğini doğrular.
 * ⚠ KRİTİK: worker internal Docker network'te platform'un auth'suz mongo'suyla
 * (mongo:27017) yan yana; guard olmadan bir kiracı `mongodb://mongo:27017` kaydedip
 * tüm platform DB'sini exfiltrate/drop edebilir. Loopback/private/link-local/
 * metadata IP'leri + tek-etiketli internal alias'ları (mongo/localhost/…) reddeder.
 * Registration'da (app) VE spawn öncesi (worker) çağrılır — DNS değişebileceğinden
 * defense-in-depth. Fail-closed: doğrulanamayan host reddedilir.
 */
const PRIVATE_V4 = [
  /^0\./, /^10\./, /^127\./, /^169\.254\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
]
function isPrivateIp(ip: string): boolean {
  const l = ip.toLowerCase().replace(/^::ffff:/, "")
  if (PRIVATE_V4.some((re) => re.test(l))) return true
  if (l === "::1" || l === "::" || l === "0.0.0.0") return true
  if (l.startsWith("fe80:") || l.startsWith("fc") || l.startsWith("fd")) return true
  return false
}

// Docker/internal servis alias'ları — asla yedek hedefi olamaz.
const DENY_HOSTS = new Set([
  "localhost", "mongo", "mongodb", "db", "database", "redis", "core",
  "metadata", "metadata.google.internal",
])

function extractHosts(uri: string): { hosts: string[]; srv: boolean } {
  const srv = /^mongodb\+srv:\/\//i.test(uri)
  const m = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/i.exec(uri)
  if (!m || !m[1]) throw new Error("Invalid MongoDB URI")
  const hosts = m[1]
    .split(",")
    .map((h) => h.replace(/:\d+$/, "").replace(/[[\]]/g, "").trim().toLowerCase())
    .filter(Boolean)
  return { hosts, srv }
}

async function assertHostPublic(host: string): Promise<void> {
  if (DENY_HOSTS.has(host)) {
    throw new Error("Connections to internal hosts are not allowed")
  }
  // Çıplak IP?
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
    if (isPrivateIp(host)) throw new Error("Private/reserved IPs are not allowed")
    return
  }
  // Tek-etiketli hostname (nokta yok) → Docker internal alias → reddet.
  if (!host.includes(".")) {
    throw new Error("Connections to internal hosts are not allowed")
  }
  // Public hostname → IP'lere çöz + range kontrolü (fail-closed).
  let addrs: { address: string }[]
  try {
    addrs = await lookup(host, { all: true })
  } catch {
    throw new Error("Could not resolve host to a public address")
  }
  if (addrs.length === 0) throw new Error("Host did not resolve")
  for (const a of addrs) {
    if (isPrivateIp(a.address)) {
      throw new Error("Host resolves to a private/reserved address")
    }
  }
}

export async function assertPublicMongoHost(uri: string): Promise<void> {
  const { hosts, srv } = extractHosts(uri)
  if (srv) {
    // mongodb+srv: SRV kaydını çöz, gerçek hedef host'ları doğrula (Atlas public).
    for (const h of hosts) {
      if (DENY_HOSTS.has(h) || !h.includes(".")) {
        throw new Error("Connections to internal hosts are not allowed")
      }
      let targets: { name: string }[]
      try {
        targets = await resolveSrv(`_mongodb._tcp.${h}`)
      } catch {
        // SRV çözülemedi → host'un kendisini A-kaydından doğrula (fail-closed).
        await assertHostPublic(h)
        continue
      }
      if (targets.length === 0) throw new Error("SRV record has no targets")
      for (const t of targets) await assertHostPublic(t.name.toLowerCase())
    }
    return
  }
  for (const h of hosts) await assertHostPublic(h)
}

/** Kredensiyalleri maskeler — LOG/UI için güvenli. */
export function sanitizeUri(uri: string): string {
  try {
    const isSrv = uri.startsWith("mongodb+srv://")
    const u = new URL(uri.replace(/^mongodb\+srv:\/\//, "mongodb://"))
    if (u.username || u.password) {
      u.username = "***"
      u.password = ""
    }
    return u
      .toString()
      .replace(/^mongodb:\/\//, isSrv ? "mongodb+srv://" : "mongodb://")
  } catch {
    return uri.replace(/\/\/[^@]+@/, "//***@")
  }
}

/**
 * Serbest metindeki (örn. mongodump stderr) tüm mongo URI kredensiyallerini
 * maskeler — hata mesajları job.error'a yazılmadan ÖNCE bundan geçmeli.
 */
export function redactUris(text: string): string {
  return text
    // mongodb(+srv)://user:pass@host → mongodb://***@host
    .replace(/mongodb(\+srv)?:\/\/[^\s@/]+@/gi, "mongodb$1://***@")
    // --uri=... argümanı tümüyle
    .replace(/--uri=\S+/gi, "--uri=***")
}

/** URI'deki path'ten db adını çıkarır; yoksa fallback. */
export function getDbNameFromUri(uri: string, fallback = "test"): string {
  try {
    const u = new URL(uri.replace(/^mongodb\+srv:\/\//, "mongodb://"))
    const name = u.pathname.replace(/^\//, "").split("/")[0]
    return name && name.length > 0 ? decodeURIComponent(name) : fallback
  } catch {
    return fallback
  }
}
