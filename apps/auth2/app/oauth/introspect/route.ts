import { NextRequest, NextResponse } from "next/server"
import {
  oauthClientModel,
  oauthAccessTokenModel,
  oauthRefreshTokenModel,
} from "@workspace/db/models"

/**
 * POST /oauth/introspect — RFC 7662 §2
 *
 * Body (form): `token`, optional `token_type_hint`
 * Client auth: Basic header preferred; form fields accepted.
 *
 * Response: `{ active: boolean, scope?, client_id?, sub?, exp?, iat?, token_type? }`
 *
 * Active criteria:
 *   - Token exists in our store
 *   - revokedAt is null
 *   - expiresAt is in the future
 *   - Token belongs to the requesting client (strict — `false` if another
 *     client introspects someone else's token, even with valid auth)
 *
 * Inactive: `{ active: false }` only — never leak claim data.
 *
 * Cache-Control: no-store always (§4).
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

const inactive = () =>
  NextResponse.json(
    { active: false },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  )

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
  if (!token) return inactive()
  const hint = body.token_type_hint
  const now = new Date()

  // access_token first (or hint)
  if (hint !== "refresh_token") {
    const a = await oauthAccessTokenModel.findByToken(token)
    if (a && a.clientId === client.clientId && !a.revokedAt && a.expiresAt > now) {
      return NextResponse.json(
        {
          active: true,
          scope: a.scopes.join(" "),
          client_id: a.clientId,
          sub: a.userId,
          token_type: "Bearer",
          exp: Math.floor(a.expiresAt.getTime() / 1000),
          iat: Math.floor(a.createdAt.getTime() / 1000),
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      )
    }
    if (hint === "access_token") return inactive()
  }

  // refresh_token
  const r = await oauthRefreshTokenModel.findByToken(token)
  if (
    r &&
    r.clientId === client.clientId &&
    !r.revokedAt &&
    !r.consumedAt &&
    r.expiresAt > now
  ) {
    return NextResponse.json(
      {
        active: true,
        scope: r.scopes.join(" "),
        client_id: r.clientId,
        sub: r.userId,
        token_type: "refresh_token",
        exp: Math.floor(r.expiresAt.getTime() / 1000),
        iat: Math.floor(r.createdAt.getTime() / 1000),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    )
  }

  return inactive()
}
