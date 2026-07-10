import {
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  type KeyObject,
} from "node:crypto"
import type { AuthProject } from "@workspace/db/models/auth-project"

/**
 * Per-project JWT signing/verify — `oauth-jwt.ts` pattern'inin Auth Project
 * variant'ı. Tek fark: signing key project doc'undan parametre olarak gelir
 * (global env değil), her project kendi izole RS256 keypair'ine sahip.
 *
 * RS256 only — v1'de HS256 fallback yok; her project kayıtta RSA 2048-bit
 * keypair üretir, `oauth-jwt.ts` JWKS publish pattern'iyle paylaşılır
 * (Phase 2'de JWKS endpoint Phase 2.2'de eklenir).
 */

export interface AuthProjectIdTokenClaims {
  /** Subject — `auth_users.id`. */
  sub: string
  /** Issuer — `https://auth.sentroy.com/p/{projectSlug}`. */
  iss: string
  /** Audience — project's API key prefix (`aps_xxxxxxxx`). */
  aud: string
  iat: number
  exp: number
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
  /** RP-defined metadata copy (subset, JWT size'ı koruyacak şekilde). */
  metadata?: Record<string, unknown>
  /** Custom claims — project.customClaims.{fromMetadata,staticClaims}
   *  ile RP eklediği serbest alanlar. Reserved claim'ler (sub/iss/...)
   *  override edilmez. */
  [extraClaim: string]: unknown
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url")
}

function base64urlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8")
}

function loadPrivateKey(project: AuthProject): KeyObject {
  return createPrivateKey(project.rsaPrivateKey)
}

function loadPublicKeyFromJwk(jwk: Record<string, unknown>): KeyObject {
  // KeyObject.import expects a JWK structure.
  return createPublicKey({ key: jwk as never, format: "jwk" })
}

/**
 * RFC 7519 + RFC 7515 — JWT compact serialization, RS256.
 * Header `alg=RS256, typ=JWT, kid=<public-jwk.kid>`.
 */
export function signProjectIdToken(
  project: AuthProject,
  claims: AuthProjectIdTokenClaims,
): string {
  const kid = (project.rsaPublicJwk.kid as string) ?? "default"
  const header = { alg: "RS256", typ: "JWT", kid }
  const headerB64 = base64url(JSON.stringify(header))
  const payloadB64 = base64url(JSON.stringify(claims))
  const data = `${headerB64}.${payloadB64}`
  const sig = createSign("sha256").update(data).sign(loadPrivateKey(project))
  return `${data}.${base64url(sig)}`
}

/**
 * Local JWT verify — RS256 signature + expiry check. Issuer / audience
 * eşleşmesini caller doğrular (test ihtiyacına göre).
 *
 * **Key rotation grace:** project.previousRsaPublicJwk varsa header.kid
 * ona match ediyorsa eski key ile verify dener. Bu sayede rotate sonrası
 * RP cache'lenmiş JWKS'siyle yumuşak geçiş yapar; clearPreviousJwtKey
 * çağrılınca grace biter.
 *
 * Failure → null (timing-safe, error message yok ki abuse profile'ı
 * sızdırmasın).
 */
export function verifyProjectIdToken(
  token: string,
  project: AuthProject,
): AuthProjectIdTokenClaims | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, sigB64] = parts
  let header: { alg?: string; typ?: string; kid?: string }
  try {
    header = JSON.parse(base64urlDecode(headerB64)) as typeof header
  } catch {
    return null
  }
  if (header.alg !== "RS256" || header.typ !== "JWT") return null

  // Hangi key ile imzalanmış: header.kid ile match et. Yoksa primary'yi
  // varsay (geriye uyumlu, kid'siz eski token'lar için).
  const primaryKid = project.rsaPublicJwk.kid as string | undefined
  const previousKid = project.previousRsaPublicJwk?.kid as string | undefined
  let chosenJwk: Record<string, unknown> | null = null
  if (header.kid) {
    if (header.kid === primaryKid) chosenJwk = project.rsaPublicJwk
    else if (header.kid === previousKid && project.previousRsaPublicJwk)
      chosenJwk = project.previousRsaPublicJwk
    else return null
  } else {
    chosenJwk = project.rsaPublicJwk
  }

  const data = `${headerB64}.${payloadB64}`
  const provided = Buffer.from(sigB64, "base64url")
  const publicKey = loadPublicKeyFromJwk(chosenJwk)
  const ok = createVerify("sha256").update(data).verify(publicKey, provided)
  if (!ok) return null

  let claims: AuthProjectIdTokenClaims
  try {
    claims = JSON.parse(base64urlDecode(payloadB64)) as AuthProjectIdTokenClaims
  } catch {
    return null
  }
  if (
    typeof claims.exp !== "number" ||
    claims.exp < Math.floor(Date.now() / 1000)
  ) {
    return null
  }
  return claims
}

/**
 * JWKS document publish format — RFC 7517 §5.
 * Rotation grace: previousRsaPublicJwk varsa o da publish edilir,
 * RP'lerin eski JWKS cache'i grace süresi boyunca verify edebilsin.
 */
export function getProjectJwks(project: AuthProject): {
  keys: Record<string, unknown>[]
} {
  const keys: Record<string, unknown>[] = [project.rsaPublicJwk]
  if (project.previousRsaPublicJwk) {
    keys.push(project.previousRsaPublicJwk)
  }
  return { keys }
}

/**
 * Token TTL constants — caller `claims.exp` hesabında kullanır.
 * Access token kısa (1 saat); refresh token persist edilen tarafta
 * (`auth-project-session` modeli) 30 gün varsayılan.
 */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60
