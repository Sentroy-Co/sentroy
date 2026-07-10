import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  timingSafeEqual,
  type KeyObject,
} from "node:crypto"

/**
 * OIDC `id_token` signing — dual-mode HS256 / RS256, multi-key for RS256
 * to support graceful key rotation.
 *
 * Selection (lazy, cached at module load):
 *   1. `OAUTH_RSA_PRIVATE_KEY` set → **RS256** primary signing key.
 *      Optionally `OAUTH_RSA_PRIVATE_KEY_PREVIOUS` set → kept in JWKS
 *      for the verification grace period (sign with primary, verify
 *      with either; remove the previous slot after the access_token
 *      TTL elapses).
 *   2. else `OAUTH_ID_TOKEN_SECRET` (≥ 32 chars) → **HS256** fallback.
 *      Single-key only; no JWKS published (symmetric secret).
 *   3. else throw on first sign attempt.
 *
 * Rotation procedure (zero-downtime):
 *   step 1: copy current `OAUTH_RSA_PRIVATE_KEY` value to
 *           `OAUTH_RSA_PRIVATE_KEY_PREVIOUS` on the same deploy.
 *   step 2: generate a fresh key, set as `OAUTH_RSA_PRIVATE_KEY`.
 *   step 3: deploy → new id_tokens signed with new key, old id_tokens
 *           still verifiable via the previous key in JWKS.
 *   step 4: after the access_token TTL (60 min default) + a margin,
 *           remove `OAUTH_RSA_PRIVATE_KEY_PREVIOUS` and redeploy.
 */

interface RsaKeyEntry {
  kid: string
  privateKey: KeyObject
  publicJwk: Record<string, unknown>
}

interface SigningKeys {
  alg: "RS256" | "HS256"
  /** RS256: signing key (primary). HS256: ignored. */
  primary?: RsaKeyEntry
  /** RS256: extra keys retained for verification (e.g. PREVIOUS). HS256: ignored. */
  others?: RsaKeyEntry[]
  /** HS256: secret. RS256: ignored. */
  hsKid?: string
  hsSecret?: Buffer
}

let cached: SigningKeys | null = null

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

  // Bazı deployment panel'leri (Coolify v4 multiline env input dahil)
  // newline'ları kaybedip body'yi tek satıra space-separated yapıştırıyor.
  // Bu durumda PEM header/footer label'ı detect edip body'yi base64
  // char'larından reconstruct ediyoruz (RFC 7468 64-char chunk).
  const header = pem.match(/-----BEGIN ([A-Z][A-Z0-9 ]*)-----/)
  const footer = pem.match(/-----END ([A-Z][A-Z0-9 ]*)-----/)
  if (header && footer && !pem.includes("\n")) {
    const label = header[1].trim()
    const headerEnd = (header.index ?? 0) + header[0].length
    const footerStart = footer.index ?? pem.length
    const body = pem.slice(headerEnd, footerStart).replace(/[^A-Za-z0-9+/=]/g, "")
    const chunked = body.match(/.{1,64}/g)?.join("\n") ?? body
    pem = `-----BEGIN ${label}-----\n${chunked}\n-----END ${label}-----`
  }
  return pem
}

function rfc7638Thumbprint(jwk: Record<string, unknown>): string {
  const canonical = JSON.stringify({
    e: jwk.e,
    kty: jwk.kty,
    n: jwk.n,
  })
  return createHash("sha256").update(canonical).digest("base64url")
}

function loadRsa(envName: string): RsaKeyEntry | null {
  const raw = process.env[envName]
  if (!raw || raw.length <= 32) return null
  const pem = normalizePem(raw)
  let privateKey: KeyObject
  try {
    privateKey = createPrivateKey(pem)
  } catch (err) {
    throw new Error(
      `${envName} is set but failed to parse as PEM: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  if (privateKey.asymmetricKeyType !== "rsa") {
    throw new Error(
      `${envName} must be an RSA key (got ${privateKey.asymmetricKeyType}).`,
    )
  }
  const publicKey = createPublicKey(privateKey)
  const jwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>
  const kid = rfc7638Thumbprint(jwk)
  return {
    kid,
    privateKey,
    publicJwk: { ...jwk, kid, use: "sig", alg: "RS256" },
  }
}

function loadKeys(): SigningKeys {
  if (cached) return cached

  const primary = loadRsa("OAUTH_RSA_PRIVATE_KEY")
  if (primary) {
    const others: RsaKeyEntry[] = []
    const previous = loadRsa("OAUTH_RSA_PRIVATE_KEY_PREVIOUS")
    if (previous && previous.kid !== primary.kid) {
      others.push(previous)
    }
    cached = { alg: "RS256", primary, others }
    return cached
  }

  const hs = process.env.OAUTH_ID_TOKEN_SECRET
  if (hs && hs.length >= 32) {
    cached = {
      alg: "HS256",
      hsKid: "hs256-default",
      hsSecret: Buffer.from(hs, "utf8"),
    }
    return cached
  }

  throw new Error(
    "OAuth id_token signing key missing. Set OAUTH_RSA_PRIVATE_KEY (PEM, recommended) " +
      "or OAUTH_ID_TOKEN_SECRET (>= 32 chars). Generate RSA: " +
      "`node -e \"console.log(require('crypto').generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}))\"`",
  )
}

export function getSigningAlg(): "RS256" | "HS256" {
  return loadKeys().alg
}

/**
 * /.well-known/jwks.json içeriği.
 *   - RS256: primary + (varsa) previous key publish edilir → grace
 *     period boyunca eski id_token'lar verify edilebilir.
 *   - HS256: boş array (symmetric secret asla publish edilmez).
 */
export function getJwks(): { keys: Record<string, unknown>[] } {
  const k = loadKeys()
  if (k.alg !== "RS256" || !k.primary) return { keys: [] }
  const keys = [k.primary.publicJwk]
  if (k.others) keys.push(...k.others.map((o) => o.publicJwk))
  return { keys }
}

export interface IdTokenClaims {
  /** OIDC required: subject — Sentroy user id. */
  sub: string
  /** Audience — the RP's client_id. */
  aud: string
  /** Issuer — the auth server URL (e.g. https://auth.sentroy.com). */
  iss: string
  /** Issued at (unix sec). */
  iat: number
  /** Expires at (unix sec). */
  exp: number
  /** OIDC `nonce` — echoed from authorize request, RP verifies. */
  nonce?: string
  /** Profile claims (only when `profile` scope granted). */
  name?: string
  preferred_username?: string
  picture?: string
  /** Email claims (only when `email` scope granted). */
  email?: string
  email_verified?: boolean
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url")
}

function base64urlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8")
}

export function signIdToken(claims: IdTokenClaims): string {
  const k = loadKeys()
  const header: Record<string, string> = { alg: k.alg, typ: "JWT" }
  if (k.alg === "RS256" && k.primary) {
    header.kid = k.primary.kid
    const headerB64 = base64url(JSON.stringify(header))
    const payloadB64 = base64url(JSON.stringify(claims))
    const data = `${headerB64}.${payloadB64}`
    const sig = createSign("sha256").update(data).sign(k.primary.privateKey)
    return `${data}.${base64url(sig)}`
  }
  if (k.alg === "HS256" && k.hsSecret) {
    const headerB64 = base64url(JSON.stringify(header))
    const payloadB64 = base64url(JSON.stringify(claims))
    const data = `${headerB64}.${payloadB64}`
    const sig = createHmac("sha256", k.hsSecret).update(data).digest()
    return `${data}.${base64url(sig)}`
  }
  throw new Error("oauth-jwt: signing key in inconsistent state")
}

/**
 * Verify + decode. Returns null on any failure (signature, alg mismatch,
 * expiry, malformed payload). RS256: kid lookup üzerinden primary ya da
 * previous key ile verify. HS256: tek key.
 */
export function verifyIdToken(token: string): IdTokenClaims | null {
  const k = loadKeys()
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, sigB64] = parts
  let header: { alg?: string; typ?: string; kid?: string }
  try {
    header = JSON.parse(base64urlDecode(headerB64)) as typeof header
  } catch {
    return null
  }
  if (header.alg !== k.alg || header.typ !== "JWT") return null

  const data = `${headerB64}.${payloadB64}`
  const provided = Buffer.from(sigB64, "base64url")

  if (k.alg === "RS256") {
    if (!k.primary) return null
    // kid lookup: primary + others
    const candidates: RsaKeyEntry[] = [k.primary, ...(k.others ?? [])]
    const match = header.kid
      ? candidates.find((c) => c.kid === header.kid)
      : candidates[0] // kid'siz token (eski/uyumlu) → primary dene
    if (!match) return null
    const ok = createVerify("sha256")
      .update(data)
      .verify(match.privateKey, provided)
    if (!ok) return null
  } else if (k.alg === "HS256" && k.hsSecret) {
    const expected = createHmac("sha256", k.hsSecret).update(data).digest()
    if (provided.length !== expected.length) return null
    if (!timingSafeEqual(provided, expected)) return null
  } else {
    return null
  }

  let claims: IdTokenClaims
  try {
    claims = JSON.parse(base64urlDecode(payloadB64)) as IdTokenClaims
  } catch {
    return null
  }
  if (typeof claims.exp !== "number" || claims.exp < Math.floor(Date.now() / 1000)) {
    return null
  }
  return claims
}
