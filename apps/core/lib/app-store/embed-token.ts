import { randomBytes } from "crypto"
import { signIdToken } from "@workspace/console/lib/oauth-jwt"

/**
 * App Store embed kimlik token'ı — OIDC id_token'dan AYRI, dış iframe'e
 * geçen TEK kimlik bilgisi. better-auth cookie ASLA geçmez.
 *
 * - TTL ≤60s; her pencere açılışında taze mint.
 * - `aud` = app'in embed origin'i (manifest jwksAudience). App `aud===own
 *   origin` doğrular → başka app için kesilmiş token replay edilemez.
 * - RS256 (mevcut OAUTH_RSA_PRIVATE_KEY anahtarıyla, `signIdToken`); app
 *   `iss`'in JWKS'inden (`/.well-known/jwks.json`) doğrular. ⚠ Core'da
 *   RS256 yoksa signIdToken HS256'ya düşer → dış app JWKS ile doğrulayamaz;
 *   prod'da OAUTH_RSA_PRIVATE_KEY zorunlu.
 * - `typ: "embed+jwt"` ayraç; OIDC id_token ile karışmasın.
 * - `nonce` tek-kullanım (opsiyonel redeem ile yakılır).
 * - profil claim'leri (email/name/picture) YALNIZ scope izin verir + consent
 *   verildiyse eklenir.
 */

export const EMBED_TOKEN_TTL = 60 // saniye

function issuer(): string {
  return (
    process.env.OAUTH_ISSUER ||
    process.env.NEXT_PUBLIC_AUTH_APP_URL ||
    "https://auth.sentroy.com"
  )
}

export interface MintEmbedTokenInput {
  userId: string
  /** Manifest identity.id. */
  appId: string
  /** App embed origin (= manifest jwksAudience). */
  audience: string
  companyId: string
  companySlug: string
  email?: string | null
  name?: string | null
  picture?: string | null
}

export interface MintedEmbedToken {
  token: string
  expiresIn: number
  nonce: string
}

export function mintEmbedToken(input: MintEmbedTokenInput): MintedEmbedToken {
  const now = Math.floor(Date.now() / 1000)
  const nonce = randomBytes(12).toString("hex")
  const claims = {
    sub: input.userId,
    aud: input.audience,
    iss: issuer(),
    iat: now,
    exp: now + EMBED_TOKEN_TTL,
    nonce,
    typ: "embed+jwt",
    appId: input.appId,
    companyId: input.companyId,
    companySlug: input.companySlug,
    ...(input.email ? { email: input.email, email_verified: true } : {}),
    ...(input.name ? { name: input.name } : {}),
    ...(input.picture ? { picture: input.picture } : {}),
  }
  // signIdToken payload'ı doğrudan serialize eder; ekstra claim'ler korunur.
  const token = signIdToken(claims as unknown as Parameters<typeof signIdToken>[0])
  return { token, expiresIn: EMBED_TOKEN_TTL, nonce }
}
