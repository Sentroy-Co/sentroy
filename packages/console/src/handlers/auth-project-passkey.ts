import { NextRequest } from "next/server"
import {
  authProjectModel,
  authProjectUserModel,
  authProjectSessionModel,
  authProjectTokenModel,
  authProjectUserPasskeyModel,
} from "@workspace/db/models"
import {
  jsonError,
  jsonOk,
  resolveProjectBySlug,
} from "@workspace/console/lib/auth-project-api"
import { verifyProjectIdToken } from "@workspace/console/lib/auth-project-jwt"
import { audit } from "@workspace/console/lib/audit"
import { dispatchAuthWebhook } from "@workspace/console/lib/auth-webhook-dispatcher"
import type { AuthProject } from "@workspace/db/models/auth-project"
import type { AuthProjectUser } from "@workspace/db/models/auth-project-user"

/**
 * WebAuthn / Passkey handlers — passwordless register + auth flow.
 *
 * Auth model:
 *   - `/me/passkey/*`: end-user access JWT (kayıtlı kullanıcı yeni passkey ekler)
 *   - `/passkey/authenticate/*`: anonim (passkey ile login)
 *
 * Library: @simplewebauthn/server v13 — generate/verify helper'ları.
 * Challenge state: `auth_project_tokens` koleksiyonu (`passkey-challenge`
 * purpose, 5dk TTL).
 */

function extractIp(request: NextRequest): string | null {
  return (
    request.headers.get("cf-connecting-ip")?.trim() ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  )
}

function safeUser(user: AuthProjectUser): Record<string, unknown> {
  const { passwordHash: _h, passwordAlgo: _a, failedLoginCount: _f, ...rest } = user
  return rest
}

/**
 * RP origin / rpId helper. RP'nin allowedOrigins listesinden host bilgisini
 * çıkarırız; yoksa default auth.sentroy.com.
 */
function resolveRpInfo(project: AuthProject, request: NextRequest): {
  rpId: string
  rpName: string
  origin: string
} {
  const origin = request.headers.get("origin")
  const allowedOrigin =
    origin && project.allowedOrigins.includes(origin)
      ? origin
      : project.allowedOrigins[0] ??
        process.env.NEXT_PUBLIC_AUTH_APP_URL ??
        "https://auth.sentroy.com"
  const rpId = new URL(allowedOrigin).hostname
  return {
    rpId,
    rpName: project.branding.displayName || project.name,
    origin: allowedOrigin,
  }
}

async function resolveMeForPasskey(
  request: NextRequest,
  projectSlug: string,
): Promise<
  | { project: AuthProject; user: AuthProjectUser; corsHeaders: Record<string, string> }
  | { error: ReturnType<typeof jsonError> }
> {
  const project = await authProjectModel.findBySlug(projectSlug)
  if (!project || !project.enabled) {
    return { error: jsonError("invalid_request", "Unknown project.", 404, []) }
  }
  const origin = request.headers.get("origin")
  const corsHeaders: Record<string, string> =
    origin && project.allowedOrigins.includes(origin)
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true",
          Vary: "Origin",
        }
      : {}
  const authHeader = request.headers.get("authorization") || ""
  const m = authHeader.match(/^Bearer\s+(\S+)$/)
  if (!m) {
    return {
      error: jsonError(
        "invalid_request",
        "Missing Authorization Bearer.",
        401,
        corsHeaders,
      ),
    }
  }
  const claims = verifyProjectIdToken(m[1], project)
  if (!claims) {
    return { error: jsonError("invalid_token", "Access token invalid.", 401, corsHeaders) }
  }
  const user = await authProjectUserModel.findById(claims.sub)
  if (!user || user.authProjectId !== project.id) {
    return { error: jsonError("invalid_token", "User missing.", 401, corsHeaders) }
  }
  return { project, user, corsHeaders }
}

// ─── /me/passkey (list + delete) ──────────────────────────────────────────

export async function mePasskeyList(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  const ctx = await resolveMeForPasskey(request, projectSlug)
  if ("error" in ctx) return ctx.error
  const items = await authProjectUserPasskeyModel.listByUser(ctx.user.id)
  return jsonOk(
    {
      data: items.map((p) => ({
        id: p.id,
        credentialIdPrefix: p.credentialId.slice(0, 16),
        deviceName: p.deviceName,
        transports: p.transports,
        lastUsedAt: p.lastUsedAt,
        createdAt: p.createdAt,
      })),
    },
    ctx.corsHeaders,
  )
}

export async function mePasskeyDelete(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ projectSlug: string; passkeyId: string }> },
) {
  const { projectSlug, passkeyId } = await params
  const ctx = await resolveMeForPasskey(request, projectSlug)
  if ("error" in ctx) return ctx.error
  const ok = await authProjectUserPasskeyModel.remove(passkeyId, ctx.user.id)
  if (!ok) {
    return jsonError("not_found", "Passkey not found.", 404, ctx.corsHeaders)
  }
  await audit({
    userId: ctx.user.id,
    companyId: ctx.project.companyId,
    action: "auth-project.user.passkey-removed",
    resource: "auth-project-user-passkey",
    resourceId: passkeyId,
    details: { projectSlug: ctx.project.slug },
  })
  return jsonOk({ data: { ok: true } }, ctx.corsHeaders)
}

// ─── /me/passkey/register/begin ───────────────────────────────────────────

export async function mePasskeyRegisterBegin(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  const ctx = await resolveMeForPasskey(request, projectSlug)
  if ("error" in ctx) return ctx.error
  const { project, user, corsHeaders } = ctx
  const rp = resolveRpInfo(project, request)

  const { generateRegistrationOptions } = await import(
    "@simplewebauthn/server"
  )
  const existing = await authProjectUserPasskeyModel.listByUser(user.id)
  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpId,
    userName: user.email,
    userID: new TextEncoder().encode(user.id),
    userDisplayName: user.displayName ?? user.email,
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({
      id: p.credentialId,
      transports: p.transports,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  })

  // Challenge'ı sakla (`passkey-challenge` purpose, 5dk TTL)
  const { token: challengeToken } = await authProjectTokenModel.create({
    authProjectId: project.id,
    userId: user.id,
    purpose: "passkey-challenge",
    payload: { type: "registration", expectedChallenge: options.challenge, rpId: rp.rpId, origin: rp.origin },
  })

  return jsonOk(
    { data: { options, challengeToken } },
    corsHeaders,
  )
}

// ─── /me/passkey/register/complete ────────────────────────────────────────

export async function mePasskeyRegisterComplete(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  const ctx = await resolveMeForPasskey(request, projectSlug)
  if ("error" in ctx) return ctx.error
  const { project, user, corsHeaders } = ctx

  let body: { challengeToken?: unknown; response?: unknown; deviceName?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError("invalid_request", "Body must be JSON.", 400, corsHeaders)
  }
  if (typeof body.challengeToken !== "string" || !body.response) {
    return jsonError(
      "invalid_request",
      "challengeToken + response required.",
      400,
      corsHeaders,
    )
  }
  const consume = await authProjectTokenModel.consume(
    body.challengeToken,
    "passkey-challenge",
  )
  if (!consume.ok) {
    return jsonError(
      "invalid_token",
      `Challenge ${consume.reason}.`,
      400,
      corsHeaders,
    )
  }
  const payload = consume.token.payload as {
    type?: string
    expectedChallenge?: string
    rpId?: string
    origin?: string
  } | null
  if (
    !payload ||
    payload.type !== "registration" ||
    consume.token.userId !== user.id ||
    !payload.expectedChallenge
  ) {
    return jsonError("invalid_token", "Challenge mismatch.", 400, corsHeaders)
  }

  const { verifyRegistrationResponse } = await import(
    "@simplewebauthn/server"
  )
  try {
    const verification = await verifyRegistrationResponse({
      response: body.response as Parameters<typeof verifyRegistrationResponse>[0]["response"],
      expectedChallenge: payload.expectedChallenge,
      expectedOrigin: payload.origin ?? "",
      expectedRPID: payload.rpId ?? "",
      requireUserVerification: false,
    })
    if (!verification.verified || !verification.registrationInfo) {
      return jsonError(
        "invalid_credentials",
        "Passkey registration verification failed.",
        400,
        corsHeaders,
      )
    }
    const { credential } = verification.registrationInfo
    const publicKeyB64 = Buffer.from(credential.publicKey).toString("base64")
    const credentialId = credential.id
    await authProjectUserPasskeyModel.create({
      authProjectId: project.id,
      userId: user.id,
      credentialId,
      publicKey: publicKeyB64,
      counter: credential.counter,
      transports: (credential.transports as never) ?? [],
      deviceName:
        typeof body.deviceName === "string" ? body.deviceName.trim() : null,
    })
    await audit({
      userId: user.id,
      companyId: project.companyId,
      action: "auth-project.user.passkey-registered",
      resource: "auth-project-user-passkey",
      resourceId: credentialId.slice(0, 32),
      details: { projectSlug: project.slug },
    })
    return jsonOk({ data: { ok: true } }, corsHeaders)
  } catch (err) {
    return jsonError(
      "invalid_credentials",
      err instanceof Error ? err.message.slice(0, 200) : "verification failed",
      400,
      corsHeaders,
    )
  }
}

// ─── /passkey/authenticate/begin ──────────────────────────────────────────

export async function passkeyAuthBegin(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  const ctxResult = await resolveProjectBySlug(request, projectSlug)
  if ("project" in ctxResult === false) return ctxResult
  const { project, corsHeaders } = ctxResult
  const rp = resolveRpInfo(project, request)

  let body: { email?: unknown } | null = null
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const email = typeof body?.email === "string" ? body.email : null

  // Email verilirse o user'ın passkey'leri allowList, yoksa usernameless
  let allowCredentials: Array<{ id: string; transports?: string[] }> | undefined
  let scopeUserId: string | null = null
  if (email) {
    const user = await authProjectUserModel.findByEmail(project.id, email)
    if (user) {
      scopeUserId = user.id
      const list = await authProjectUserPasskeyModel.listByUser(user.id)
      allowCredentials = list.map((p) => ({
        id: p.credentialId,
        transports: p.transports,
      }))
    }
  }

  const { generateAuthenticationOptions } = await import(
    "@simplewebauthn/server"
  )
  const options = await generateAuthenticationOptions({
    rpID: rp.rpId,
    allowCredentials: allowCredentials as Parameters<typeof generateAuthenticationOptions>[0]["allowCredentials"],
    userVerification: "preferred",
  })

  // Challenge'ı sakla (anonim — userId yok). Token model userId zorunlu;
  // scopeUserId yoksa "anonymous" placeholder kullan (token consume sırasında
  // gerçek user passkey lookup'tan gelir).
  const { token: challengeToken } = await authProjectTokenModel.create({
    authProjectId: project.id,
    userId: scopeUserId ?? "anonymous",
    purpose: "passkey-challenge",
    payload: {
      type: "authentication",
      expectedChallenge: options.challenge,
      rpId: rp.rpId,
      origin: rp.origin,
    },
  })

  return jsonOk({ data: { options, challengeToken } }, corsHeaders)
}

// ─── /passkey/authenticate/complete ───────────────────────────────────────

export async function passkeyAuthComplete(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  const ctxResult = await resolveProjectBySlug(request, projectSlug)
  if ("project" in ctxResult === false) return ctxResult
  const { project, corsHeaders } = ctxResult

  let body: { challengeToken?: unknown; response?: unknown; rememberMe?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError("invalid_request", "Body must be JSON.", 400, corsHeaders)
  }
  if (typeof body.challengeToken !== "string" || !body.response) {
    return jsonError(
      "invalid_request",
      "challengeToken + response required.",
      400,
      corsHeaders,
    )
  }
  const consume = await authProjectTokenModel.consume(
    body.challengeToken,
    "passkey-challenge",
  )
  if (!consume.ok) {
    return jsonError(
      "invalid_token",
      `Challenge ${consume.reason}.`,
      400,
      corsHeaders,
    )
  }
  const payload = consume.token.payload as {
    type?: string
    expectedChallenge?: string
    rpId?: string
    origin?: string
  } | null
  if (
    !payload ||
    payload.type !== "authentication" ||
    !payload.expectedChallenge
  ) {
    return jsonError("invalid_token", "Challenge mismatch.", 400, corsHeaders)
  }

  const response = body.response as { id?: string }
  if (!response.id) {
    return jsonError("invalid_request", "response.id missing.", 400, corsHeaders)
  }
  const passkey = await authProjectUserPasskeyModel.findByCredentialId(response.id)
  if (!passkey || passkey.authProjectId !== project.id) {
    return jsonError(
      "invalid_credentials",
      "Unknown passkey.",
      401,
      corsHeaders,
    )
  }
  const user = await authProjectUserModel.findById(passkey.userId)
  if (!user) {
    return jsonError("invalid_credentials", "User missing.", 401, corsHeaders)
  }

  const { verifyAuthenticationResponse } = await import(
    "@simplewebauthn/server"
  )
  try {
    const verification = await verifyAuthenticationResponse({
      response: body.response as Parameters<typeof verifyAuthenticationResponse>[0]["response"],
      expectedChallenge: payload.expectedChallenge,
      expectedOrigin: payload.origin ?? "",
      expectedRPID: payload.rpId ?? "",
      credential: {
        id: passkey.credentialId,
        publicKey: Buffer.from(passkey.publicKey, "base64"),
        counter: passkey.counter,
        transports: passkey.transports as never,
      },
      requireUserVerification: false,
    })
    if (!verification.verified) {
      return jsonError(
        "invalid_credentials",
        "Passkey verification failed.",
        401,
        corsHeaders,
      )
    }
    await authProjectUserPasskeyModel.updateCounter(
      passkey.credentialId,
      verification.authenticationInfo.newCounter,
    )
  } catch (err) {
    return jsonError(
      "invalid_credentials",
      err instanceof Error ? err.message.slice(0, 200) : "verification failed",
      401,
      corsHeaders,
    )
  }

  await authProjectUserModel.recordLoginSuccess(user.id, extractIp(request))
  await audit({
    userId: user.id,
    companyId: project.companyId,
    action: "auth-project.user.login",
    resource: "auth-project-user",
    resourceId: user.id,
    details: { projectSlug: project.slug, via: "passkey" },
    ipAddress: extractIp(request) ?? undefined,
  })

  dispatchAuthWebhook(
    project.id,
    "user.login",
    {
      user: { id: user.id, email: user.email },
      via: "passkey",
      ipAddress: extractIp(request),
      userAgent: request.headers.get("user-agent"),
      projectSlug: project.slug,
    },
    { userId: user.id },
  )

  // Tokens issue — sürekli accessToken + refreshToken
  const rememberMe = body.rememberMe === true
  const REMEMBER_MS = 90 * 24 * 60 * 60 * 1000
  const { token: refreshToken } = await authProjectSessionModel.create({
    authProjectId: project.id,
    userId: user.id,
    userAgent: request.headers.get("user-agent"),
    ip: extractIp(request),
    ttlMs: rememberMe ? REMEMBER_MS : undefined,
  })
  const { signProjectIdToken, ACCESS_TOKEN_TTL_SECONDS } = await import(
    "@workspace/console/lib/auth-project-jwt"
  )
  const now = Math.floor(Date.now() / 1000)
  const accessToken = signProjectIdToken(project, {
    sub: user.id,
    iss: `${process.env.NEXT_PUBLIC_AUTH_APP_URL || "https://auth.sentroy.com"}/p/${project.slug}`,
    aud: project.apiKeyPrefix,
    iat: now,
    exp: now + ACCESS_TOKEN_TTL_SECONDS,
    email: user.email,
    email_verified: user.emailVerified,
    name: user.displayName ?? undefined,
    picture: user.image ?? undefined,
  })

  return jsonOk(
    {
      data: {
        user: safeUser(user),
        accessToken,
        refreshToken,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        tokenType: "Bearer",
      },
    },
    corsHeaders,
  )
}
