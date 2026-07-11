export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { jsonError } from "@workspace/console/lib/api-helpers"
import { verifyAuthenticationResponse } from "@simplewebauthn/server"
import type { AuthenticationResponseJSON } from "@simplewebauthn/server"
import { userPasskeyModel, auditLogModel } from "@workspace/db/models"
import {
  authBaseURL,
  issueSessionForUser,
  passkeyAllowedOrigins,
} from "@workspace/auth/server/passkey-session"

/**
 * POST /api/passkey/authenticate/complete
 * Body: { flowId: string, response: AuthenticationResponseJSON }
 *
 * Browser `startAuthentication` cevabını verify eder. Başarılıysa:
 *  - counter güncellenir + lastUsedAt yazılır
 *  - better-auth session manuel olarak kurulur (passkey-session bridge)
 *  - Set-Cookie header'ı ile session cookie döner
 *
 * Çıkış: { ok: true } + cookie. Client `window.location.href = "/{locale}/d"`.
 */
export async function POST(request: NextRequest) {
  let body: { flowId?: string; response?: AuthenticationResponseJSON }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  if (!body.flowId || !body.response) {
    return jsonError("flowId and response are required")
  }

  const challenge = await userPasskeyModel.consumeChallenge(
    `auth:${body.flowId}`,
  )
  if (!challenge) {
    return jsonError("Authentication challenge expired — start again", 410)
  }

  // credentialID response.id (base64url) — bizim DB key'imiz aynı format.
  const credentialID = body.response.id
  const passkey = await userPasskeyModel.findByCredentialID(credentialID)
  if (!passkey) return jsonError("Unknown passkey", 404)

  const baseURL = authBaseURL()
  const rpID = new URL(baseURL).hostname
  const publicKey = Buffer.from(passkey.publicKey, "base64url")

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: challenge,
      // Login form core'da, ama mail/storage'a redirect sonrası kullanıcı
      // o subdomain'lerden de tetikleyebilir. Allow list — rpID parent
      // domain olduğu için tüm subdomain'leri kapsar.
      expectedOrigin: passkeyAllowedOrigins(),
      expectedRPID: rpID,
      credential: {
        id: passkey.credentialID,
        publicKey,
        counter: passkey.counter,
        transports: (passkey.transports ?? []) as AuthenticatorTransport[],
      },
      requireUserVerification: false,
    })
  } catch (err) {
    console.warn("[passkey/auth] verify failed:", err)
    return jsonError("Authentication failed", 401)
  }

  if (!verification.verified) {
    return jsonError("Authentication not verified", 401)
  }

  // Counter inkrement etmediyse cloud-synced authenticator olabilir;
  // log et ama akışı blokeleme.
  const newCounter = verification.authenticationInfo.newCounter
  if (newCounter <= passkey.counter && newCounter !== 0) {
    console.warn(
      `[passkey/auth] counter not incremented (was ${passkey.counter}, got ${newCounter}) — possibly cloud-synced credential`,
    )
  }
  await userPasskeyModel.updateCounterAndUsed(credentialID, newCounter)

  await auditLogModel
    .insert({
      userId: passkey.userId,
      action: "passkey.signin",
      resource: "passkey",
      resourceId: passkey.id,
      details: {},
    })
    .catch(() => {})

  // Better-auth session manuel oluştur + Set-Cookie ile dön.
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    undefined
  const ua = request.headers.get("user-agent") ?? undefined
  const issued = await issueSessionForUser(passkey.userId, {
    ipAddress: ip,
    userAgent: ua,
  })

  const res = NextResponse.json({ data: { ok: true } }, { status: 200 })
  res.cookies.set(issued.cookieName, issued.cookieValue, {
    httpOnly: issued.cookieAttributes.httpOnly,
    sameSite: issued.cookieAttributes.sameSite,
    secure: issued.cookieAttributes.secure,
    path: issued.cookieAttributes.path,
    maxAge: issued.cookieAttributes.maxAge,
    domain: issued.cookieAttributes.domain,
  })
  return res
}

type AuthenticatorTransport =
  | "ble"
  | "internal"
  | "nfc"
  | "usb"
  | "cable"
  | "hybrid"
  | "smart-card"
