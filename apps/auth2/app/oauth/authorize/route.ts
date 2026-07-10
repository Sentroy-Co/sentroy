import { NextRequest, NextResponse } from "next/server"
import { getAuthSession } from "@workspace/console/lib/api-helpers"
import {
  oauthClientModel,
  oauthAuthorizationCodeModel,
  oauthConsentModel,
} from "@workspace/db/models"
import {
  ALLOWED_SCOPES,
  type OAuthClient,
  type OAuthScope,
} from "@workspace/db/models/oauth-client"
import { detectLocale } from "@/lib/i18n"
import { getPublicUrl } from "@/lib/public-url"

/**
 * GET /oauth/authorize — RFC 6749 §4.1.1 + OIDC §3.1.2.1
 *
 * Required query params:
 *   - response_type=code   (only supported value for v1; PKCE/implicit defer)
 *   - client_id            (registered OAuth client)
 *   - redirect_uri         (must be in client's allow-list, exact match)
 *   - scope                (space-separated; subset of client.allowedScopes)
 *
 * Optional:
 *   - state                (CSRF token RP echoes back unchanged)
 *   - nonce                (OIDC; embedded in id_token)
 *
 * Flow:
 *   1. Validate client_id + redirect_uri + response_type + scope.
 *   2. If validation fails on client_id or redirect_uri → render an
 *      error page (NEVER redirect — open redirector hazard).
 *      Other errors → redirect to redirect_uri with `error=<code>`.
 *   3. Check Sentroy session via cookie (.sentroy.com cross-subdomain).
 *      Not logged in → 302 to https://sentroy.com/login?next=<this URL>.
 *   4. Logged in → 302 to /oauth/consent?<full request> for user to
 *      approve or deny.
 *
 * Consent page itself (POST handler) issues the authorization code and
 * does the final 302 to redirect_uri.
 */

export const dynamic = "force-dynamic"

const SUPPORTED_RESPONSE_TYPE = "code"

function buildErrorRedirect(
  redirectUri: string,
  state: string | null,
  error: string,
  description: string,
): NextResponse {
  const url = new URL(redirectUri)
  url.searchParams.set("error", error)
  url.searchParams.set("error_description", description)
  if (state) url.searchParams.set("state", state)
  return NextResponse.redirect(url, 302)
}

function renderClientError(
  status: number,
  title: string,
  detail: string,
): NextResponse {
  // Plain HTML — sahte redirect_uri'ye 302 atmaktan emniyetli.
  const html = `<!doctype html>
<meta charset="utf-8">
<title>OAuth error</title>
<style>
  body { font: 14px/1.5 system-ui; max-width: 500px; margin: 80px auto; padding: 0 20px; color: #18181b; }
  h1 { font-size: 18px; }
  p { color: #71717a; }
  code { background: #f4f4f5; padding: 2px 6px; border-radius: 4px; font: 12px/1 ui-monospace, monospace; }
</style>
<h1>${title}</h1>
<p>${detail}</p>
<p><code>${status} — Sentroy Auth</code></p>`
  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}

function parseScopes(raw: string | null, client: OAuthClient): OAuthScope[] | null {
  if (!raw) return null
  const requested = raw.split(/\s+/).filter(Boolean)
  const out: OAuthScope[] = []
  for (const s of requested) {
    if (!ALLOWED_SCOPES.has(s as OAuthScope)) return null
    if (!client.allowedScopes.includes(s as OAuthScope)) return null
    out.push(s as OAuthScope)
  }
  if (!out.includes("openid")) return null // OIDC requires openid
  return out
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const responseType = sp.get("response_type")
  const clientId = sp.get("client_id")
  const redirectUri = sp.get("redirect_uri")
  const scopeRaw = sp.get("scope")
  const state = sp.get("state")
  const nonce = sp.get("nonce")
  const codeChallenge = sp.get("code_challenge")
  const codeChallengeMethod = sp.get("code_challenge_method")

  // 1. Client + redirect_uri validation FIRST (no redirect on these errors)
  if (!clientId) {
    return renderClientError(400, "Missing client_id", "The authorization request must include a client_id parameter.")
  }
  if (!redirectUri) {
    return renderClientError(400, "Missing redirect_uri", "The authorization request must include a redirect_uri parameter.")
  }
  const client = await oauthClientModel.findByClientId(clientId)
  if (!client || !client.enabled) {
    return renderClientError(400, "Unknown client", "No OAuth client matches this client_id.")
  }
  if (!client.redirectUris.includes(redirectUri)) {
    return renderClientError(
      400,
      "Invalid redirect_uri",
      "The provided redirect_uri is not registered for this client. Add it on the dashboard before retrying.",
    )
  }

  // 2. Now safe to redirect errors back to the RP
  if (responseType !== SUPPORTED_RESPONSE_TYPE) {
    return buildErrorRedirect(
      redirectUri,
      state,
      "unsupported_response_type",
      `Only response_type=${SUPPORTED_RESPONSE_TYPE} is supported.`,
    )
  }
  const scopes = parseScopes(scopeRaw, client)
  if (!scopes) {
    return buildErrorRedirect(
      redirectUri,
      state,
      "invalid_scope",
      "Requested scopes are invalid or not allowed for this client. `openid` is always required.",
    )
  }

  // PKCE validation (RFC 7636) — opsiyonel ama gönderilen değerler valid olmalı
  if (codeChallenge !== null) {
    if (codeChallenge.length < 43 || codeChallenge.length > 128) {
      return buildErrorRedirect(
        redirectUri,
        state,
        "invalid_request",
        "code_challenge length must be between 43 and 128 characters (base64url-encoded SHA-256 hash).",
      )
    }
    // Default method "plain" desteklemiyoruz — açıkça S256 zorunlu
    if (codeChallengeMethod && codeChallengeMethod !== "S256") {
      return buildErrorRedirect(
        redirectUri,
        state,
        "invalid_request",
        "Only code_challenge_method=S256 is supported. `plain` is rejected.",
      )
    }
  } else if (codeChallengeMethod !== null) {
    return buildErrorRedirect(
      redirectUri,
      state,
      "invalid_request",
      "code_challenge_method provided without code_challenge.",
    )
  }

  // 3. Session check — cross-subdomain cookie
  const locale = detectLocale(request.headers.get("accept-language"))
  const publicUrl = getPublicUrl(request)
  const session = await getAuthSession(request)
  if (!session) {
    // Sentroy login'e gönder, login sonrası bu URL'e geri dön (public URL
    // ile — container internal'inde nextUrl.toString() `0.0.0.0:3003` döner).
    const coreUrl =
      process.env.NEXT_PUBLIC_CORE_APP_URL || "https://sentroy.com"
    const next = encodeURIComponent(
      `${publicUrl}${request.nextUrl.pathname}${request.nextUrl.search}`,
    )
    return NextResponse.redirect(`${coreUrl}/${locale}/login?next=${next}`, 302)
  }

  // 4. Existing consent var mı? Subset ise consent ekranını skip et —
  //    "Sign in with Sentroy" tek tıkla biter (Google/GitHub flow benzeri).
  //    `prompt=consent` query param ile kullanıcı re-prompt'u zorlayabilir
  //    (gelecek; v1.5'te skip-or-prompt sadece otomatik).
  const userId = (session.user as { id?: string }).id
  if (userId) {
    const existingConsent = await oauthConsentModel.find(userId, client.clientId)
    const promptParam = sp.get("prompt")
    const forceConsent = promptParam === "consent"
    if (
      !forceConsent &&
      oauthConsentModel.covers(existingConsent, scopes)
    ) {
      // Otomatik issue — consent ekranı yok
      const { code } = await oauthAuthorizationCodeModel.create({
        clientId: client.clientId,
        userId,
        redirectUri,
        scopes,
        nonce: nonce ?? null,
        codeChallenge,
        codeChallengeMethod: codeChallenge ? "S256" : null,
      })
      const url = new URL(redirectUri)
      url.searchParams.set("code", code)
      if (state) url.searchParams.set("state", state)
      return NextResponse.redirect(url, 302)
    }
  }

  // 5. Yeni / genişletilmiş scope → consent ekranına (locale-aware path).
  //    Origin public URL'i (X-Forwarded-* veya env) — proxy arkasındayken
  //    `request.nextUrl.origin` `0.0.0.0:3003` döndüğü için.
  const consentUrl = new URL(`/${locale}/oauth/consent`, publicUrl)
  consentUrl.searchParams.set("client_id", clientId)
  consentUrl.searchParams.set("redirect_uri", redirectUri)
  consentUrl.searchParams.set("scope", scopes.join(" "))
  if (state) consentUrl.searchParams.set("state", state)
  if (nonce) consentUrl.searchParams.set("nonce", nonce)
  if (codeChallenge) {
    consentUrl.searchParams.set("code_challenge", codeChallenge)
    consentUrl.searchParams.set("code_challenge_method", "S256")
  }
  return NextResponse.redirect(consentUrl, 302)
}
