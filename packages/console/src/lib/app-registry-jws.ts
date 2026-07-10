import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as edSign,
  verify as edVerify,
  type KeyObject,
} from "node:crypto"

/**
 * App Store registry KATALOG imzalama — Ed25519 ATTACHED compact JWS.
 *
 * Neden attached (detached değil): yanıt gövdesinin TAMAMI JWS'tir
 * (Content-Type application/jose) — header/gövde ayrımı yok, custom header yok
 * → Cloudflare/CDN dönüşümlerine karşı yapısal olarak güvenli, canonicalization
 * belirsizliği yok (payload segment'i byte-exact geri çözülür).
 *
 * KRİTİK farklar (oauth-jwt.ts'ten AYRILIR):
 *  - EdDSA one-shot API: `crypto.sign(null, data, key)` / `crypto.verify(null,
 *    data, key, sig)`. `createSign/createVerify("sha256")` EdDSA için YANLIŞtır.
 *  - kid RFC 7638 thumbprint OKP kanonik üyeleri {crv,kty,x} üzerinden (RSA'nın
 *    {e,kty,n}'i DEĞİL).
 *  - verify KID-STRICT: header.kid zorunlu, pinned key'ler arasında birebir
 *    eşleşme yoksa FAIL. oauth-jwt.ts'teki `candidates[0]` kid-less fallback'i
 *    (satır ~248) bir imza-bypass yüzeyidir ve BURAYA KOPYALANMAZ.
 *
 * Bu modül supply-chain güven kökünün imza/doğrulama primitifidir. İmzalama
 * anahtarı (APP_REGISTRY_PRIVATE_KEY) yalnız sentroy.com env store'unda;
 * doğrulama PINNED public key'lere karşı (çağıran verir). Key yükleme LAZY —
 * `next build` sırasında bu modülü import etmek asla throw etmez.
 */

const ALG = "EdDSA"
const TYP = "registry-catalog+jws"

// ── PEM normalize (oauth-jwt.ts idiom'u; console-içi ayrık kopya) ────────────
function normalizePem(raw: string): string {
  let pem = raw.trim()
  if (
    (pem.startsWith('"') && pem.endsWith('"')) ||
    (pem.startsWith("'") && pem.endsWith("'"))
  ) {
    pem = pem.slice(1, -1).trim()
  }
  if (pem.includes("\\n")) {
    pem = pem.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n")
  }
  pem = pem.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const header = pem.match(/-----BEGIN ([A-Z][A-Z0-9 ]*)-----/)
  const footer = pem.match(/-----END ([A-Z][A-Z0-9 ]*)-----/)
  if (header && footer && !pem.includes("\n")) {
    const label = header[1]!.trim()
    const headerEnd = (header.index ?? 0) + header[0].length
    const footerStart = footer.index ?? pem.length
    const body = pem.slice(headerEnd, footerStart).replace(/[^A-Za-z0-9+/=]/g, "")
    const chunked = body.match(/.{1,64}/g)?.join("\n") ?? body
    pem = `-----BEGIN ${label}-----\n${chunked}\n-----END ${label}-----`
  }
  return pem
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url")
}
function base64urlDecodeToString(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8")
}

/** RFC 7638 thumbprint — OKP kanonik üyeleri {crv,kty,x} (leksikografik sıra). */
function okpThumbprint(jwk: Record<string, unknown>): string {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x })
  return createHash("sha256").update(canonical).digest("base64url")
}

interface Ed25519PublicEntry {
  kid: string
  publicKey: KeyObject
  publicJwk: Record<string, unknown>
}

/** Bir Ed25519 PUBLIC PEM'i {kid,publicKey,jwk}'ye çevir; hata olursa null. */
function publicEntryFromPem(rawPem: string): Ed25519PublicEntry | null {
  try {
    const publicKey = createPublicKey(normalizePem(rawPem))
    if (publicKey.asymmetricKeyType !== "ed25519") return null
    const jwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>
    const kid = okpThumbprint(jwk)
    return { kid, publicKey, publicJwk: { ...jwk, kid, use: "sig", alg: ALG } }
  } catch {
    return null
  }
}

// ── İmzalama tarafı (yalnız sentroy.com; APP_REGISTRY_PRIVATE_KEY) ────────────

interface SigningKey {
  kid: string
  privateKey: KeyObject
  publicJwk: Record<string, unknown>
}

let cachedSigningKey: SigningKey | null = null

/**
 * İmzalama anahtarını LAZY yükle. Set edilmemişse null döner (export route'u
 * zaten 503 ile önden korur → burası çağrılmaz). Set edilmiş ama Ed25519 değil/
 * parse edilemiyorsa THROW (yanlış konfig sessizce yutulmasın).
 */
export function loadSigningKey(): SigningKey | null {
  if (cachedSigningKey) return cachedSigningKey
  const raw = process.env.APP_REGISTRY_PRIVATE_KEY
  if (!raw || raw.trim().length === 0) return null
  let privateKey: KeyObject
  try {
    privateKey = createPrivateKey(normalizePem(raw))
  } catch (err) {
    throw new Error(
      `APP_REGISTRY_PRIVATE_KEY is set but failed to parse as PEM: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error(
      `APP_REGISTRY_PRIVATE_KEY must be an Ed25519 key (got ${privateKey.asymmetricKeyType}).`,
    )
  }
  const publicKey = createPublicKey(privateKey)
  const jwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>
  const kid = okpThumbprint(jwk)
  cachedSigningKey = { kid, privateKey, publicJwk: { ...jwk, kid, use: "sig", alg: ALG } }
  return cachedSigningKey
}

/** İmzalama anahtarı yapılandırılmış mı (export route 503 kararı için). */
export function isRegistrySigningConfigured(): boolean {
  return !!(process.env.APP_REGISTRY_PRIVATE_KEY && process.env.APP_REGISTRY_PRIVATE_KEY.trim())
}

/**
 * Envelope'u Ed25519 attached compact JWS olarak imzala. Dönen string yanıt
 * gövdesidir (application/jose). Yalnız imzalama anahtarı varken çağrılmalı.
 */
export function signAttached(payload: unknown): string {
  const key = loadSigningKey()
  if (!key) throw new Error("APP_REGISTRY_PRIVATE_KEY not configured")
  const header = { alg: ALG, kid: key.kid, typ: TYP }
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
  const sig = edSign(null, Buffer.from(signingInput), key.privateKey)
  return `${signingInput}.${base64url(sig)}`
}

/**
 * /keys DISCOVERY endpoint'i için public JWKS ({keys:[primary,previous?]}).
 * NON-authoritative (instance'lar PINNED key'e güvenir, buna değil). İmzalama
 * anahtarının public yarısı + (varsa) APP_REGISTRY_PUBLIC_KEY_PREVIOUS.
 */
export function getRegistryPublicJwks(): { keys: Record<string, unknown>[] } {
  const keys: Record<string, unknown>[] = []
  const seen = new Set<string>()
  const signing = loadSigningKey()
  if (signing && !seen.has(signing.kid)) {
    keys.push(signing.publicJwk)
    seen.add(signing.kid)
  }
  const prev = process.env.APP_REGISTRY_PUBLIC_KEY_PREVIOUS
  if (prev && prev.trim()) {
    const e = publicEntryFromPem(prev)
    if (e && !seen.has(e.kid)) {
      keys.push(e.publicJwk)
      seen.add(e.kid)
    }
  }
  return { keys }
}

// ── Doğrulama tarafı (her instance; PINNED public key'ler çağıran tarafından) ─

export interface VerifyResult {
  ok: boolean
  kid?: string
  payload?: unknown
  error?: string
}

/**
 * Attached compact JWS'i PINNED public PEM'lere karşı doğrula (HARDENED):
 *  - tam 3 segment; header decode edilir
 *  - alg==="EdDSA" ve typ==="registry-catalog+jws" değilse REJECT
 *  - `crit` header'ı varsa (boş değilse) REJECT (anlaşılmayan zorunlu extension)
 *  - header.kid ZORUNLU; pinned key'ler arasında birebir eşleşme yoksa REJECT
 *    (kid-less/candidates[0] fallback YOK — imza bypass'ı olurdu)
 *  - crypto.verify(null, input, pubKey, sig) — EdDSA one-shot
 * Başarısızlıkta ASLA throw etmez; {ok:false,error} döner.
 */
export function verifyAttached(
  compactJws: string,
  pinnedPublicPems: string[],
): VerifyResult {
  if (typeof compactJws !== "string") return { ok: false, error: "not-a-string" }
  const parts = compactJws.split(".")
  if (parts.length !== 3) return { ok: false, error: "malformed-jws" }
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string]

  let header: { alg?: string; typ?: string; kid?: string; crit?: unknown }
  try {
    header = JSON.parse(base64urlDecodeToString(headerB64)) as typeof header
  } catch {
    return { ok: false, error: "bad-header" }
  }
  if (header.alg !== ALG) return { ok: false, error: "alg-mismatch" }
  if (header.typ !== TYP) return { ok: false, error: "typ-mismatch" }
  if (header.crit !== undefined) {
    // Hiçbir crit extension desteklenmiyor → crit VARSA (boş dizi dahil, ki
    // RFC 7515 §4.1.11'e göre boş dizi zaten geçersiz) tümüyle reddet.
    return { ok: false, error: "unsupported-crit" }
  }
  if (typeof header.kid !== "string" || header.kid.length === 0) {
    return { ok: false, error: "kid-required" }
  }

  // Pinned PEM'leri {kid,publicKey}'ye çöz (bozuk olanları atla).
  const entries: Ed25519PublicEntry[] = []
  const seen = new Set<string>()
  for (const pem of pinnedPublicPems) {
    if (!pem || !pem.trim()) continue
    const e = publicEntryFromPem(pem)
    if (e && !seen.has(e.kid)) {
      entries.push(e)
      seen.add(e.kid)
    }
  }
  if (entries.length === 0) return { ok: false, error: "no-pinned-keys" }

  const match = entries.find((e) => e.kid === header.kid)
  if (!match) return { ok: false, error: "unknown-kid" }

  const signingInput = `${headerB64}.${payloadB64}`
  let sig: Buffer
  try {
    sig = Buffer.from(sigB64, "base64url")
  } catch {
    return { ok: false, error: "bad-signature-encoding" }
  }

  let valid = false
  try {
    valid = edVerify(null, Buffer.from(signingInput), match.publicKey, sig)
  } catch {
    return { ok: false, error: "verify-threw" }
  }
  if (!valid) return { ok: false, error: "signature-invalid" }

  let payload: unknown
  try {
    payload = JSON.parse(base64urlDecodeToString(payloadB64))
  } catch {
    return { ok: false, error: "bad-payload" }
  }
  return { ok: true, kid: match.kid, payload }
}
