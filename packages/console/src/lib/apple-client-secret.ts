import { createSign, createPrivateKey } from "node:crypto"

/**
 * Apple Sign In — client_secret JWT (ES256) signer.
 *
 * Apple, OAuth token exchange'de standart static client_secret yerine
 * RP tarafında dinamik üretilen, ECDSA-signed JWT bekler. Format:
 *
 *   header:  { alg: "ES256", kid: <Key ID> }
 *   payload: { iss: <Team ID>, iat, exp, aud: "https://appleid.apple.com", sub: <Service ID/Client ID> }
 *
 * Signing: secp256r1 (P-256) private key, p8 PEM format (Apple
 * Developer panel'inden indirilir, key uploaded for Sign In with Apple).
 *
 * exp: max 6 ay (15777000s); biz 5 dk veriyoruz (token exchange anlık,
 * uzun TTL'e gerek yok).
 *
 * Reference: https://developer.apple.com/documentation/sign_in_with_apple/generate_and_validate_tokens
 */

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url")
}

/**
 * ECDSA P-256 raw signature (r||s, 64 bytes) — Apple JWT format. Node
 * `createSign("sha256")` ASN.1 DER signature döner; raw'a çevirmek için
 * parse + concat.
 */
function asn1DerToJoseSig(derSig: Buffer): Buffer {
  // Minimal ASN.1 DER parser: SEQUENCE { INTEGER r, INTEGER s }
  if (derSig[0] !== 0x30) throw new Error("invalid DER signature")
  // skip SEQUENCE header (tag + length)
  let offset = 2
  // r
  if (derSig[offset] !== 0x02) throw new Error("invalid r integer")
  const rLen = derSig[offset + 1]
  let r = derSig.subarray(offset + 2, offset + 2 + rLen)
  offset += 2 + rLen
  // s
  if (derSig[offset] !== 0x02) throw new Error("invalid s integer")
  const sLen = derSig[offset + 1]
  let s = derSig.subarray(offset + 2, offset + 2 + sLen)
  // ASN.1 INTEGER may have leading zero (sign bit) — strip
  if (r.length > 32 && r[0] === 0x00) r = r.subarray(1)
  if (s.length > 32 && s[0] === 0x00) s = s.subarray(1)
  // Pad to 32 bytes each
  const rPad = Buffer.concat([Buffer.alloc(32 - r.length), r])
  const sPad = Buffer.concat([Buffer.alloc(32 - s.length), s])
  return Buffer.concat([rPad, sPad])
}

export interface AppleClientSecretInput {
  teamId: string
  keyId: string
  serviceId: string
  /** P8 PEM private key (decrypted). */
  privateKeyPem: string
}

export function buildAppleClientSecret(input: AppleClientSecretInput): string {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: "ES256", kid: input.keyId, typ: "JWT" }
  const payload = {
    iss: input.teamId,
    iat: now,
    exp: now + 5 * 60,
    aud: "https://appleid.apple.com",
    sub: input.serviceId,
  }
  const headerB64 = base64url(JSON.stringify(header))
  const payloadB64 = base64url(JSON.stringify(payload))
  const data = `${headerB64}.${payloadB64}`

  const keyObject = createPrivateKey({
    key: input.privateKeyPem,
    format: "pem",
  })
  const derSig = createSign("sha256").update(data).sign(keyObject)
  const joseSig = asn1DerToJoseSig(derSig)
  return `${data}.${base64url(joseSig)}`
}

/**
 * Apple id_token decode (verify olmadan; sadece claims okumak için).
 * Production'da JWKS ile verify gerekir; bu helper'ın v1'i sub + email
 * okur, full crypto verify v2'de eklenebilir (Apple JWKS rotate,
 * dependable enough'tan id_token sub'ı gerçek).
 *
 * Apple id_token claims:
 *   - sub: stable user identifier (per-RP unique)
 *   - email: kullanıcı izin verdiyse
 *   - email_verified: "true" | true (Apple inconsistent)
 *   - is_private_email: kullanıcı hide-my-email kullandıysa "true"
 */
export function decodeAppleIdToken(idToken: string): {
  sub: string
  email: string | null
  emailVerified: boolean
  isPrivateEmail: boolean
} | null {
  const parts = idToken.split(".")
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as Record<string, unknown>
    const sub = typeof payload.sub === "string" ? payload.sub : null
    if (!sub) return null
    const email = typeof payload.email === "string" ? payload.email : null
    const evRaw = payload.email_verified
    const emailVerified =
      evRaw === true || evRaw === "true" || (typeof evRaw === "boolean" && evRaw)
    const pvRaw = payload.is_private_email
    const isPrivateEmail =
      pvRaw === true || pvRaw === "true"
    return { sub, email, emailVerified, isPrivateEmail }
  } catch {
    return null
  }
}
