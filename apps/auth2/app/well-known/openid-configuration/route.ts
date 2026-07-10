import { NextRequest, NextResponse } from "next/server"
import { getSigningAlg } from "@workspace/console/lib/oauth-jwt"
import { getPublicUrl } from "@/lib/public-url"

/**
 * GET /.well-known/openid-configuration — OIDC §4
 *
 * Discovery document. Sentroy Auth'un current configuration'ı — RP libraryleri
 * (NextAuth, Authlib, Spring Security, Keycloak adapter, vs.) tek setting'le
 * konfigüre etmek için bunu fetch eder.
 *
 * `jwks_uri` ve `id_token_signing_alg_values_supported` runtime'da signing
 * key'in moduna göre dinamik:
 *   - RS256 → jwks_uri publish edilir, RP signature verify edebilir
 *   - HS256 → jwks_uri yok, RP userinfo'ya başvurmak zorunda
 */

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const base = getPublicUrl(request)

  let alg: "RS256" | "HS256" = "HS256"
  try {
    alg = getSigningAlg()
  } catch {
    // Signing key set değilse — id_token issue edilemez ama discovery hâlâ
    // dönsün. RP error mesajı authorize/token endpoint'inden gelir.
  }

  const config: Record<string, unknown> = {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    userinfo_endpoint: `${base}/oauth/userinfo`,
    revocation_endpoint: `${base}/oauth/revoke`,
    introspection_endpoint: `${base}/oauth/introspect`,
    end_session_endpoint: `${base}/oauth/end-session`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: [alg],
    scopes_supported: ["openid", "profile", "email", "offline_access"],
    token_endpoint_auth_methods_supported: [
      "client_secret_basic",
      "client_secret_post",
    ],
    revocation_endpoint_auth_methods_supported: [
      "client_secret_basic",
      "client_secret_post",
    ],
    introspection_endpoint_auth_methods_supported: [
      "client_secret_basic",
      "client_secret_post",
    ],
    claims_supported: [
      "sub",
      "name",
      "preferred_username",
      "picture",
      "email",
      "email_verified",
      "aud",
      "iss",
      "iat",
      "exp",
      "nonce",
    ],
    code_challenge_methods_supported: ["S256"],
  }

  // RS256 modunda jwks_uri advertise edilir; HS256'da publish edecek public
  // key yok (symmetric secret).
  if (alg === "RS256") {
    config.jwks_uri = `${base}/.well-known/jwks.json`
  }

  return NextResponse.json(config, {
    headers: { "Cache-Control": "public, max-age=300" },
  })
}
