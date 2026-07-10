import { NextRequest, NextResponse } from "next/server"
import { getAuthSession } from "@workspace/console/lib/api-helpers"
import {
  oauthClientModel,
  oauthAuthorizationCodeModel,
  oauthConsentModel,
} from "@workspace/db/models"
import {
  ALLOWED_SCOPES,
  type OAuthScope,
} from "@workspace/db/models/oauth-client"

/**
 * POST /api/oauth/consent — consent screen form action.
 *
 * Body (form): client_id, redirect_uri, scope, decision={allow|deny},
 *              state?, nonce?
 *
 * `decision=allow` → authorization code üret + 302 to redirect_uri?code=...
 * `decision=deny`  → 302 to redirect_uri?error=access_denied
 *
 * Validations re-run here (consent page rendered earlier — but DB state /
 * client.enabled / redirect_uri allow-list değişmiş olabilir; ayrıca request
 * tampering'a karşı server-side recheck).
 */

export const dynamic = "force-dynamic"

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

function buildSuccessRedirect(
  redirectUri: string,
  code: string,
  state: string | null,
): NextResponse {
  const url = new URL(redirectUri)
  url.searchParams.set("code", code)
  if (state) url.searchParams.set("state", state)
  return NextResponse.redirect(url, 302)
}

function plainHtmlError(status: number, title: string, detail: string): NextResponse {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>OAuth error</title><h1 style="font-family:system-ui">${title}</h1><p style="font-family:system-ui;color:#71717a">${detail}</p>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  )
}

export async function POST(request: NextRequest) {
  const fd = await request.formData()
  const clientId = fd.get("client_id")
  const redirectUri = fd.get("redirect_uri")
  const scopeRaw = fd.get("scope")
  const decision = fd.get("decision")
  const state = fd.get("state")
  const nonce = fd.get("nonce")
  const codeChallenge = fd.get("code_challenge")
  const codeChallengeMethod = fd.get("code_challenge_method")

  if (
    typeof clientId !== "string" ||
    typeof redirectUri !== "string" ||
    typeof scopeRaw !== "string" ||
    typeof decision !== "string"
  ) {
    return plainHtmlError(400, "Invalid request", "Required fields missing.")
  }

  // Re-validate client + redirect_uri (no redirect on these — open redirector hazard)
  const client = await oauthClientModel.findByClientId(clientId)
  if (!client || !client.enabled) {
    return plainHtmlError(400, "Unknown client", "OAuth client not found or disabled.")
  }
  if (!client.redirectUris.includes(redirectUri)) {
    return plainHtmlError(
      400,
      "Invalid redirect URI",
      "redirect_uri is not on the client's allow-list.",
    )
  }

  const stateStr = typeof state === "string" ? state : null
  const nonceStr = typeof nonce === "string" ? nonce : null

  if (decision === "deny") {
    return buildErrorRedirect(
      redirectUri,
      stateStr,
      "access_denied",
      "User denied the authorization request.",
    )
  }
  if (decision !== "allow") {
    return plainHtmlError(400, "Invalid decision", "decision must be allow or deny.")
  }

  // Session zorunlu (consent page render'ında check edildi ama yine de)
  const session = await getAuthSession(request)
  if (!session) {
    return buildErrorRedirect(
      redirectUri,
      stateStr,
      "login_required",
      "User session expired before consent could be granted.",
    )
  }

  // Scope re-validate (allow-list)
  const scopes = scopeRaw.split(/\s+/).filter(Boolean)
  for (const s of scopes) {
    if (!ALLOWED_SCOPES.has(s as OAuthScope)) {
      return buildErrorRedirect(
        redirectUri,
        stateStr,
        "invalid_scope",
        `Unknown scope: ${s}`,
      )
    }
    if (!client.allowedScopes.includes(s as OAuthScope)) {
      return buildErrorRedirect(
        redirectUri,
        stateStr,
        "invalid_scope",
        `Scope ${s} is not allowed for this client.`,
      )
    }
  }
  if (!scopes.includes("openid")) {
    return buildErrorRedirect(
      redirectUri,
      stateStr,
      "invalid_scope",
      "openid scope is required.",
    )
  }

  // Issue authorization code
  const userId = (session.user as { id?: string }).id
  if (!userId) {
    return buildErrorRedirect(
      redirectUri,
      stateStr,
      "server_error",
      "Could not resolve user id.",
    )
  }

  // Consent kaydı upsert — sonraki authorize'da consent ekranı atlanabilir
  await oauthConsentModel
    .grant({ userId, clientId: client.clientId, scopes })
    .catch(() => {}) // best-effort; consent persistence fail bypass

  const challenge = typeof codeChallenge === "string" ? codeChallenge : null
  const method =
    typeof codeChallengeMethod === "string" && codeChallengeMethod === "S256"
      ? "S256"
      : null

  const { code } = await oauthAuthorizationCodeModel.create({
    clientId: client.clientId,
    userId,
    redirectUri,
    scopes,
    nonce: nonceStr,
    codeChallenge: challenge,
    codeChallengeMethod: challenge ? method : null,
  })

  return buildSuccessRedirect(redirectUri, code, stateStr)
}
