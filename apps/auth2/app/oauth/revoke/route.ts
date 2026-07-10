import { NextRequest, NextResponse } from "next/server"
import {
  oauthClientModel,
  oauthAccessTokenModel,
  oauthRefreshTokenModel,
} from "@workspace/db/models"

/**
 * POST /oauth/revoke — RFC 7009 §2
 *
 * Body (form): `token`, optional `token_type_hint` (access_token | refresh_token)
 * Client auth: Basic header preferred; form fields accepted.
 *
 * Response: **always 200** (RFC §2.2 — don't reveal token existence). Even
 * unknown tokens, expired tokens, malformed requests beyond client auth
 * → 200. Only invalid client auth → 401.
 *
 * Behaviour:
 *   1. token_type_hint=access_token  → look up in access_tokens, mark revoked
 *   2. token_type_hint=refresh_token → look up in refresh_tokens, revoke
 *      (single token, NOT family — user-initiated, not theft signal)
 *   3. no hint                       → try access first, then refresh
 *   4. token belongs to different client → 200 (silent no-op per spec)
 */

export const dynamic = "force-dynamic"

async function readForm(request: NextRequest): Promise<Record<string, string>> {
  const ct = request.headers.get("content-type") || ""
  const out: Record<string, string> = {}
  if (ct.includes("application/json")) {
    try {
      const j = (await request.json()) as Record<string, unknown>
      for (const [k, v] of Object.entries(j)) {
        if (typeof v === "string") out[k] = v
      }
    } catch {
      /* ignore */
    }
  } else {
    try {
      const fd = await request.formData()
      for (const [k, v] of fd.entries()) {
        if (typeof v === "string") out[k] = v
      }
    } catch {
      /* ignore */
    }
  }
  return out
}

function parseBasicAuth(
  header: string | null,
): { id: string; secret: string } | null {
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

const OK = NextResponse.json({}, { status: 200 })

export async function POST(request: NextRequest) {
  const body = await readForm(request)
  const basic = parseBasicAuth(request.headers.get("authorization"))
  const clientId = basic?.id ?? body.client_id
  const clientSecret = basic?.secret ?? body.client_secret

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "invalid_client" },
      {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="oauth2"' },
      },
    )
  }
  const client = await oauthClientModel.verifyClientCredentials(
    clientId,
    clientSecret,
  )
  if (!client) {
    return NextResponse.json(
      { error: "invalid_client" },
      {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="oauth2"' },
      },
    )
  }

  const token = body.token
  if (!token) return OK // RFC: silent no-op
  const hint = body.token_type_hint

  // Try as access_token first (or hint)
  if (hint !== "refresh_token") {
    const access = await oauthAccessTokenModel.findByToken(token)
    if (access && access.clientId === client.clientId) {
      await oauthAccessTokenModel.revoke(access.id).catch(() => {})
      return OK
    }
    // If hint was access_token explicitly, don't fall through (RFC §2.1)
    if (hint === "access_token") return OK
  }

  // Try as refresh_token
  const refresh = await oauthRefreshTokenModel.findByToken(token)
  if (refresh && refresh.clientId === client.clientId) {
    await oauthRefreshTokenModel.revoke(refresh.id).catch(() => {})
  }
  return OK
}
