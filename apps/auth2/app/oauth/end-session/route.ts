import { NextRequest, NextResponse } from "next/server"
import { verifyIdToken } from "@workspace/console/lib/oauth-jwt"
import {
  oauthClientModel,
  oauthAccessTokenModel,
  oauthRefreshTokenModel,
} from "@workspace/db/models"

/**
 * GET/POST /oauth/end-session — OIDC RP-Initiated Logout
 * https://openid.net/specs/openid-connect-rpinitiated-1_0.html
 *
 * Query params (GET) or body (POST form):
 *   - id_token_hint           (recommended; used to identify user + client)
 *   - post_logout_redirect_uri (optional; must be on client's redirect_uri allow-list — same security boundary)
 *   - state                   (optional; echoed back unchanged)
 *
 * Behaviour (v1 light variant):
 *   1. id_token_hint verify edilirse → o (user, client) için aktif tüm
 *      access + refresh token'ları revoke et.
 *   2. post_logout_redirect_uri client'ın redirect_uri allow-list'inde
 *      ise → 302 oraya, state echo. Aksi → düz "Logged out" sayfası.
 *   3. **Sentroy ana session'a dokunmaz.** Kullanıcı `sentroy.com`'da
 *      hâlâ login. Bu Google'ın account.google.com session'ına dokunmadan
 *      tek bir uygulama oturumunu kapatmasıyla aynı tasarım.
 *      Tam OP logout ileride eklenebilir — şu an scope kasıtlı dar.
 */

export const dynamic = "force-dynamic"

function loggedOutPage(): NextResponse {
  return new NextResponse(
    `<!doctype html>
<meta charset="utf-8">
<title>Signed out</title>
<style>
  body { font: 14px/1.5 system-ui; max-width: 420px; margin: 80px auto; padding: 0 20px; color: #18181b; text-align: center; }
  h1 { font-size: 18px; }
  p { color: #71717a; }
  a { color: #18181b; }
</style>
<h1>You've been signed out of the application.</h1>
<p>You're still signed into your Sentroy account. <a href="https://sentroy.com">Return to sentroy.com</a></p>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  )
}

async function readParams(request: NextRequest): Promise<Record<string, string>> {
  if (request.method === "GET") {
    const out: Record<string, string> = {}
    request.nextUrl.searchParams.forEach((v, k) => {
      out[k] = v
    })
    return out
  }
  const out: Record<string, string> = {}
  try {
    const fd = await request.formData()
    for (const [k, v] of fd.entries()) {
      if (typeof v === "string") out[k] = v
    }
  } catch {
    /* ignore */
  }
  return out
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const params = await readParams(request)
  const idTokenHint = params.id_token_hint
  const postLogoutRedirectUri = params.post_logout_redirect_uri
  const state = params.state ?? null

  // id_token_hint var ve verify edilirse → token'ları revoke et
  let resolvedClient: { clientId: string } | null = null
  if (idTokenHint) {
    const claims = verifyIdToken(idTokenHint)
    if (claims) {
      // Hint geçerli → access + refresh tokens revoke
      await oauthAccessTokenModel
        .revokeForUserClient(claims.sub, claims.aud)
        .catch(() => {})
      await oauthRefreshTokenModel
        .revokeForUserClient(claims.sub, claims.aud)
        .catch(() => {})
      resolvedClient = { clientId: claims.aud }
    }
  }

  // Redirect istek varsa client'ın allow-list'inde mi kontrol et
  if (postLogoutRedirectUri) {
    let clientId = resolvedClient?.clientId
    // id_token_hint yoksa client_id query param'ı kabul et (OIDC spec optional)
    if (!clientId && params.client_id) clientId = params.client_id
    if (clientId) {
      const client = await oauthClientModel.findByClientId(clientId)
      if (client && client.redirectUris.includes(postLogoutRedirectUri)) {
        const url = new URL(postLogoutRedirectUri)
        if (state) url.searchParams.set("state", state)
        return NextResponse.redirect(url, 302)
      }
    }
    // Kötü redirect — open redirector hazard, plain page döndür
  }

  return loggedOutPage()
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
