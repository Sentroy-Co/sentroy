import { NextRequest, NextResponse } from "next/server"
import { createHash, timingSafeEqual } from "node:crypto"
import {
  oauthClientModel,
  oauthAuthorizationCodeModel,
  oauthAccessTokenModel,
  oauthRefreshTokenModel,
  type oauthClientModel as _ClientModel,
} from "@workspace/db/models"
import { signIdToken, type IdTokenClaims } from "@workspace/console/lib/oauth-jwt"
import { getDb } from "@workspace/db/client"
import { ObjectId } from "mongodb"
import { getPublicUrl } from "@/lib/public-url"

/**
 * POST /oauth/token — RFC 6749 §4.1.3 + OIDC §3.1.3
 *
 * Authorization Code grant — only grant_type supported in v1.
 *
 * Required form fields (application/x-www-form-urlencoded OR JSON):
 *   - grant_type=authorization_code
 *   - code             (issued by /oauth/authorize → consent flow)
 *   - redirect_uri     (must match the one bound to the code)
 *   - client_id        (Basic auth or form field)
 *   - client_secret    (Basic auth or form field)
 *
 * Response (RFC 6749 §5.1):
 *   {
 *     "access_token": "oat_...",
 *     "token_type": "Bearer",
 *     "expires_in": 3600,
 *     "scope": "openid profile email",
 *     "id_token": "<jwt>"     // when openid scope granted
 *   }
 *
 * Errors per RFC 6749 §5.2 — JSON with `error` field:
 *   invalid_request, invalid_client, invalid_grant, unsupported_grant_type,
 *   invalid_scope.
 *
 * Client authentication: Basic header (`Authorization: Basic base64(id:secret)`)
 * preferred per spec; form fields accepted for ergonomic clients.
 */

export const dynamic = "force-dynamic"

interface TokenError {
  error: string
  error_description: string
}

function jsonError(err: TokenError, status = 400): NextResponse {
  return NextResponse.json(err, {
    status,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
  })
}

function jsonSuccess(body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, {
    status: 200,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
  })
}

async function readForm(
  request: NextRequest,
): Promise<Record<string, string>> {
  const ct = request.headers.get("content-type") || ""
  const out: Record<string, string> = {}
  if (ct.includes("application/json")) {
    try {
      const j = (await request.json()) as Record<string, unknown>
      for (const [k, v] of Object.entries(j)) {
        if (typeof v === "string") out[k] = v
      }
    } catch {
      // ignore
    }
  } else {
    try {
      const fd = await request.formData()
      for (const [k, v] of fd.entries()) {
        if (typeof v === "string") out[k] = v
      }
    } catch {
      // ignore
    }
  }
  return out
}

function parseBasicAuth(header: string | null): { id: string; secret: string } | null {
  if (!header || !header.startsWith("Basic ")) return null
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8")
    const idx = decoded.indexOf(":")
    if (idx < 0) return null
    return { id: decoded.slice(0, idx), secret: decoded.slice(idx + 1) }
  } catch {
    return null
  }
}

/** Sentroy user record'undan OIDC claim'leri çıkar (scope-aware). */
async function buildClaims(
  userId: string,
  clientId: string,
  scopes: string[],
  nonce: string | null,
  iss: string,
): Promise<IdTokenClaims> {
  const now = Math.floor(Date.now() / 1000)
  const claims: IdTokenClaims = {
    sub: userId,
    aud: clientId,
    iss,
    iat: now,
    exp: now + 60 * 60, // 1 hour
  }
  if (nonce) claims.nonce = nonce

  // Sentroy user'ı better-auth `user` koleksiyonundan oku
  interface SentroyUserDoc {
    name?: string
    email?: string
    emailVerified?: boolean
    image?: string
  }
  let user: SentroyUserDoc | null = null
  try {
    const db = await getDb()
    const doc = await db
      .collection("user")
      .findOne({ _id: new ObjectId(userId) })
    user = doc as SentroyUserDoc | null
  } catch {
    user = null
  }
  if (!user) return claims

  if (scopes.includes("profile")) {
    if (user.name) {
      claims.name = user.name
      claims.preferred_username = user.name
    }
    if (user.image) claims.picture = user.image
  }
  if (scopes.includes("email") && user.email) {
    claims.email = user.email
    claims.email_verified = user.emailVerified ?? false
  }
  return claims
}

/**
 * RFC 7636 §4.6 — code_verifier doğrulaması.
 *   stored_challenge == base64url(sha256(code_verifier))
 * Constant-time karşılaştırma; mismatch → invalid_grant.
 */
function verifyPkce(verifier: string, storedChallenge: string): boolean {
  const computed = createHash("sha256").update(verifier).digest()
  const computedB64 = computed.toString("base64url")
  const a = Buffer.from(computedB64, "utf8")
  const b = Buffer.from(storedChallenge, "utf8")
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

async function issueIdToken(
  request: NextRequest,
  userId: string,
  clientId: string,
  scopes: string[],
  nonce: string | null,
): Promise<{ idToken?: string; error?: NextResponse }> {
  if (!scopes.includes("openid")) return {}
  const iss = getPublicUrl(request)
  const claims = await buildClaims(
    userId,
    clientId,
    scopes,
    nonce,
    iss,
  )
  try {
    return { idToken: signIdToken(claims) }
  } catch (err) {
    console.error("[oauth/token] id_token sign failed:", err)
    return {
      error: jsonError(
        {
          error: "server_error",
          error_description:
            "id_token signing key is not configured (OAUTH_ID_TOKEN_SECRET).",
        },
        500,
      ),
    }
  }
}

async function handleAuthorizationCode(
  request: NextRequest,
  body: Record<string, string>,
  clientId: string,
  clientSecret: string,
): Promise<NextResponse> {
  const code = body.code
  const redirectUri = body.redirect_uri
  const codeVerifier = body.code_verifier

  if (!code || !redirectUri) {
    return jsonError(
      {
        error: "invalid_request",
        error_description: "Missing required parameter: code or redirect_uri.",
      },
      400,
    )
  }

  const client = await oauthClientModel.verifyClientCredentials(clientId, clientSecret)
  if (!client) {
    return jsonError(
      { error: "invalid_client", error_description: "client_id / client_secret rejected." },
      401,
    )
  }

  const codeRecord = await oauthAuthorizationCodeModel.consume(
    code,
    client.clientId,
    redirectUri,
  )
  if (!codeRecord) {
    return jsonError(
      {
        error: "invalid_grant",
        error_description:
          "Authorization code is unknown, expired, already used, or bound to a different client/redirect_uri.",
      },
      400,
    )
  }

  // PKCE verification — code PKCE ile issue edildiyse code_verifier zorunlu
  if (codeRecord.codeChallenge) {
    if (!codeVerifier) {
      return jsonError(
        {
          error: "invalid_request",
          error_description:
            "code_verifier is required (this code was issued with PKCE).",
        },
        400,
      )
    }
    if (codeVerifier.length < 43 || codeVerifier.length > 128) {
      return jsonError(
        {
          error: "invalid_grant",
          error_description: "code_verifier length must be 43-128 chars.",
        },
        400,
      )
    }
    if (!verifyPkce(codeVerifier, codeRecord.codeChallenge)) {
      return jsonError(
        {
          error: "invalid_grant",
          error_description: "code_verifier does not match the issued code_challenge.",
        },
        400,
      )
    }
  }

  // Issue access token
  const { token: accessToken } = await oauthAccessTokenModel.create({
    clientId: codeRecord.clientId,
    userId: codeRecord.userId,
    scopes: codeRecord.scopes,
  })

  // Issue refresh token if offline_access scope granted
  let refreshToken: string | undefined
  if (codeRecord.scopes.includes("offline_access")) {
    const refresh = await oauthRefreshTokenModel.create({
      clientId: codeRecord.clientId,
      userId: codeRecord.userId,
      scopes: codeRecord.scopes,
      // İlk issue → yeni family
    })
    refreshToken = refresh.token
  }

  // id_token (OIDC)
  const idResult = await issueIdToken(
    request,
    codeRecord.userId,
    client.clientId,
    codeRecord.scopes,
    codeRecord.nonce,
  )
  if (idResult.error) return idResult.error

  return jsonSuccess({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 60 * 60,
    scope: codeRecord.scopes.join(" "),
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
    ...(idResult.idToken ? { id_token: idResult.idToken } : {}),
  })
}

async function handleRefreshToken(
  request: NextRequest,
  body: Record<string, string>,
  clientId: string,
  clientSecret: string,
): Promise<NextResponse> {
  const refreshTokenIn = body.refresh_token
  if (!refreshTokenIn) {
    return jsonError(
      {
        error: "invalid_request",
        error_description: "Missing required parameter: refresh_token.",
      },
      400,
    )
  }

  const client = await oauthClientModel.verifyClientCredentials(clientId, clientSecret)
  if (!client) {
    return jsonError(
      { error: "invalid_client", error_description: "client_id / client_secret rejected." },
      401,
    )
  }

  const stored = await oauthRefreshTokenModel.findByToken(refreshTokenIn)
  if (!stored) {
    return jsonError(
      { error: "invalid_grant", error_description: "Refresh token unknown." },
      400,
    )
  }

  // Token başka client'a aitse fail (kötü niyetli kullanım)
  if (stored.clientId !== client.clientId) {
    return jsonError(
      {
        error: "invalid_grant",
        error_description: "Refresh token does not belong to this client.",
      },
      400,
    )
  }

  // Reuse detection — RFC 9700 §4.13: tüketilmiş token tekrar kullanılırsa
  // entire family revoke (potential theft).
  if (stored.consumedAt) {
    await oauthRefreshTokenModel.revokeFamily(stored.familyId).catch(() => {})
    return jsonError(
      {
        error: "invalid_grant",
        error_description:
          "Refresh token has already been used; the entire token family has been revoked. Re-authenticate.",
      },
      400,
    )
  }

  if (stored.revokedAt) {
    return jsonError(
      { error: "invalid_grant", error_description: "Refresh token revoked." },
      400,
    )
  }

  if (stored.expiresAt < new Date()) {
    return jsonError(
      { error: "invalid_grant", error_description: "Refresh token expired." },
      400,
    )
  }

  // Optional scope narrowing — RP request'te subset isteyebilir
  let scopes = stored.scopes
  if (typeof body.scope === "string" && body.scope.trim() !== "") {
    const requested = body.scope.split(/\s+/).filter(Boolean)
    for (const s of requested) {
      if (!stored.scopes.includes(s)) {
        return jsonError(
          {
            error: "invalid_scope",
            error_description: `Scope ${s} was not in the original grant; cannot widen on refresh.`,
          },
          400,
        )
      }
    }
    scopes = requested
  }

  // Rotate — eskiyi consumed işaretle, aynı family'de yeni issue et
  await oauthRefreshTokenModel.markConsumed(stored.id)
  const { token: newRefreshToken } = await oauthRefreshTokenModel.create({
    clientId: stored.clientId,
    userId: stored.userId,
    scopes,
    familyId: stored.familyId,
  })
  const { token: newAccessToken } = await oauthAccessTokenModel.create({
    clientId: stored.clientId,
    userId: stored.userId,
    scopes,
  })

  // Refresh akışında nonce yok; id_token re-issue edilebilir ama
  // nonce'suz. RP isterse openid scope ile yeni id_token alır.
  const idResult = await issueIdToken(
    request,
    stored.userId,
    client.clientId,
    scopes,
    null,
  )
  if (idResult.error) return idResult.error

  return jsonSuccess({
    access_token: newAccessToken,
    token_type: "Bearer",
    expires_in: 60 * 60,
    refresh_token: newRefreshToken,
    scope: scopes.join(" "),
    ...(idResult.idToken ? { id_token: idResult.idToken } : {}),
  })
}

export async function POST(request: NextRequest) {
  const body = await readForm(request)
  const basic = parseBasicAuth(request.headers.get("authorization"))
  const clientId = basic?.id ?? body.client_id
  const clientSecret = basic?.secret ?? body.client_secret

  if (!clientId || !clientSecret) {
    return jsonError(
      {
        error: "invalid_client",
        error_description: "client_id and client_secret are required.",
      },
      401,
    )
  }

  const grantType = body.grant_type
  if (grantType === "authorization_code") {
    return handleAuthorizationCode(request, body, clientId, clientSecret)
  }
  if (grantType === "refresh_token") {
    return handleRefreshToken(request, body, clientId, clientSecret)
  }
  return jsonError(
    {
      error: "unsupported_grant_type",
      error_description:
        "Supported grants: authorization_code, refresh_token.",
    },
    400,
  )
}

// Suppress unused-import warning — _ClientModel re-export keeps types in scope
void (null as unknown as typeof _ClientModel)
