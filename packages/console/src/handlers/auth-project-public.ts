import { NextRequest } from "next/server"
import {
  authProjectModel,
  authProjectUserModel,
  authProjectSessionModel,
  authProjectTokenModel,
  authProjectUserMfaModel,
} from "@workspace/db/models"
import {
  resolveProjectAuth,
  resolveProjectBySlug,
  jsonError,
  jsonOk,
  preflight,
  isLikelyEmail,
} from "@workspace/console/lib/auth-project-api"
import { sendAuthProjectMail } from "@workspace/auth/server/auth-project-mail-events"
import {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
} from "@workspace/console/lib/auth-project-password"
import {
  AUTH_LIMITS,
  checkAuthLimit,
  enforceMinLatency,
} from "@workspace/console/lib/auth-uniform-response"
import { checkPwnedPassword } from "@workspace/console/lib/pwned-passwords"
import { dispatchAuthWebhook } from "@workspace/console/lib/auth-webhook-dispatcher"
import {
  signProjectIdToken,
  getProjectJwks,
  ACCESS_TOKEN_TTL_SECONDS,
  type AuthProjectIdTokenClaims,
} from "@workspace/console/lib/auth-project-jwt"
import type { AuthProject } from "@workspace/db/models/auth-project"
import type { AuthProjectUser } from "@workspace/db/models/auth-project-user"
import { audit } from "@workspace/console/lib/audit"

/**
 * Public Auth-as-a-Service endpoint handler'ları.
 *
 * Tüm endpoint'ler `/api/v1/auth/[projectSlug]/...` altında. Browser-
 * facing — CORS, rate limit, token rotation hepsi burada.
 *
 * Auth modes:
 *   - **Project API key** (`Authorization: Bearer aps_...`): signup,
 *     login, refresh, logout, password-reset/request — server-to-server.
 *     Sentroy RP'sini authenticate eder; browser'da expose edilmez.
 *   - **End-user access token** (`Authorization: Bearer <jwt>`):
 *     userinfo. JWT verify per-project public key ile.
 *   - **Slug-only (token-of-knowledge)**: verify-email,
 *     password-reset/confirm. Mail link'inden gelir, body'deki single-use
 *     token zaten secret — API key zorlamak browser'a master key
 *     dağıtmak demek olurdu.
 */

// ─── /signup ──────────────────────────────────────────────────────────────

const SIGNUP_MIN_LATENCY_MS = 300
const LOGIN_MIN_LATENCY_MS = 500
const RESET_REQUEST_MIN_LATENCY_MS = 300

export async function signupPost(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const startedAt = Date.now()
  const { projectSlug } = await params
  const ctx = await resolveProjectAuth(request, projectSlug)
  if ("project" in ctx === false) return ctx
  const { project, corsHeaders } = ctx

  let body: { email?: unknown; password?: unknown; displayName?: unknown; metadata?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError("invalid_request", "Body must be JSON.", 400, corsHeaders)
  }

  const emailLower =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : null

  // IP + per-email rate limit (auth_signup bucket).
  const limit = checkAuthLimit(request, project.id, AUTH_LIMITS.signup, emailLower)
  if (!limit.allowed) {
    await enforceMinLatency(startedAt, SIGNUP_MIN_LATENCY_MS)
    return jsonError(
      "rate_limited",
      `Too many signup attempts. Retry in ${limit.retryAfter}s.`,
      429,
      { ...corsHeaders, "Retry-After": String(limit.retryAfter) },
    )
  }

  // MAU cap (free tier hard ceiling)
  const userCount = await authProjectUserModel.countByProject(project.id)
  if (userCount >= project.maxMau) {
    await enforceMinLatency(startedAt, SIGNUP_MIN_LATENCY_MS)
    return jsonError(
      "quota_exceeded",
      `User pool reached plan limit (${project.maxMau}). Upgrade plan.`,
      402,
      corsHeaders,
    )
  }

  if (!isLikelyEmail(body.email)) {
    await enforceMinLatency(startedAt, SIGNUP_MIN_LATENCY_MS)
    return jsonError("invalid_request", "email is required and must look like an email.", 400, corsHeaders)
  }
  if (typeof body.password !== "string") {
    await enforceMinLatency(startedAt, SIGNUP_MIN_LATENCY_MS)
    return jsonError("invalid_request", "password is required (string).", 400, corsHeaders)
  }

  const policy = validatePasswordPolicy(body.password, project.passwordPolicy)
  if (!policy.ok) {
    await enforceMinLatency(startedAt, SIGNUP_MIN_LATENCY_MS)
    return jsonError(
      "weak_password",
      `Password does not meet policy: ${policy.reason} (required ${policy.details.required}).`,
      400,
      corsHeaders,
    )
  }

  // HaveIBeenPwned breach check — k-anonymity, upstream fail-open.
  const pwned = await checkPwnedPassword(body.password, { minCount: 3 })
  if (pwned.breached) {
    await enforceMinLatency(startedAt, SIGNUP_MIN_LATENCY_MS)
    return jsonError(
      "weak_password",
      `This password has appeared in ${pwned.count.toLocaleString()} known breaches. Choose a different one.`,
      400,
      corsHeaders,
    )
  }

  // Quota check + atomic increment — sadece valid request için sayalım
  // (yoksa attacker invalid body ile counter exhaust eder).
  const quota = await authProjectModel.incrementSignupCounter(project.id)
  if (!quota?.allowed) {
    await enforceMinLatency(startedAt, SIGNUP_MIN_LATENCY_MS)
    return jsonError(
      "quota_exceeded",
      `Signup rate limit reached (${quota?.limit ?? 0}/hour). Try again later.`,
      429,
      corsHeaders,
    )
  }

  const existing = await authProjectUserModel.findByEmail(project.id, body.email)
  if (existing) {
    // Email enumeration protection — uniform 201 with "check inbox" message.
    // Var olan user'a "another signup attempt" mail göndererek hesap
    // sahibini bilgilendiriyoruz; attacker enumeration sızıntısı görmüyor.
    await sendAuthProjectMail("auth-project.signup-attempt-existing", {
      to: existing.email,
      locale: resolveLocaleFromRequest(request),
      brand: brandFromProject(project),
      variables: {
        userEmail: existing.email,
        signinUrl: `${authPublicBase()}/p/${project.slug}/login`,
        resetUrl: `${authPublicBase()}/p/${project.slug}/reset-password`,
      },
    }).catch(() => undefined)
    await audit({
      userId: existing.id,
      companyId: project.companyId,
      action: "auth-project.user.signup-collision",
      resource: "auth-project-user",
      resourceId: existing.id,
      details: { projectSlug: project.slug },
    })
    await enforceMinLatency(startedAt, SIGNUP_MIN_LATENCY_MS)
    return jsonOk(
      {
        data: {
          ok: true,
          emailVerificationRequired: project.emailVerificationRequired,
          message: "If the email is available, check your inbox to continue.",
        },
      },
      corsHeaders,
      202,
    )
  }

  const user = await authProjectUserModel.create({
    authProjectId: project.id,
    email: body.email,
    passwordHash: hashPassword(body.password),
    displayName:
      typeof body.displayName === "string" ? body.displayName : null,
    emailVerified: !project.emailVerificationRequired,
    metadata:
      body.metadata && typeof body.metadata === "object"
        ? (body.metadata as Record<string, unknown>)
        : {},
  })

  // Issue verification token + send mail. Mail send injection
  // (`getSystemMailSender`) auth2 instrumentation'da kurulur; sender
  // configure değilse silently no-op (`no-sender`) — signup başarılı
  // sayılır, debug log token'ı işaret eder.
  let verificationToken: string | null = null
  if (project.emailVerificationRequired) {
    const { token } = await authProjectTokenModel.create({
      authProjectId: project.id,
      userId: user.id,
      purpose: "verify-email",
    })
    verificationToken = token
    const verifyUrl = `${authPublicBase()}/p/${project.slug}/verify-email?token=${encodeURIComponent(token)}`
    const result = await sendAuthProjectMail("auth-project.verify-email", {
      to: user.email,
      locale: resolveLocaleFromRequest(request),
      brand: brandFromProject(project),
      variables: {
        userEmail: user.email,
        verifyUrl,
      },
    })
    if (!result.sent) {
      console.warn(
        "[auth-project] verification email not sent",
        { projectSlug: project.slug, userId: user.id, reason: result.reason, tokenPrefix: token.slice(0, 8) },
      )
    }
  }

  await audit({
    userId: user.id,
    companyId: project.companyId,
    action: "auth-project.user.signup",
    resource: "auth-project-user",
    resourceId: user.id,
    details: {
      projectSlug: project.slug,
      emailDomain: body.email.split("@")[1] ?? null,
      verificationRequired: project.emailVerificationRequired,
    },
  })

  dispatchAuthWebhook(
    project.id,
    "user.signup",
    {
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
      projectSlug: project.slug,
    },
    { userId: user.id },
  )

  // Email verification REQUIRED → token issue etme; sadece user info.
  // Required değil → access + refresh hemen.
  if (project.emailVerificationRequired) {
    await enforceMinLatency(startedAt, SIGNUP_MIN_LATENCY_MS)
    return jsonOk(
      {
        data: {
          user: safeUser(user),
          emailVerificationRequired: true,
          // Verification token'ı response'a koymuyoruz (Phase 4'te email ile)
          ...(process.env.AUTH_PROJECT_DEBUG === "1"
            ? { _debug: { verificationToken } }
            : {}),
        },
      },
      corsHeaders,
      201,
    )
  }

  const tokens = await issueTokens(project, user, request)
  await enforceMinLatency(startedAt, SIGNUP_MIN_LATENCY_MS)
  return jsonOk(
    { data: { user: safeUser(user), ...tokens } },
    corsHeaders,
    201,
  )
}

// ─── /login ───────────────────────────────────────────────────────────────

export async function loginPost(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const startedAt = Date.now()
  const { projectSlug } = await params
  const ctx = await resolveProjectAuth(request, projectSlug)
  if ("project" in ctx === false) return ctx
  const { project, corsHeaders } = ctx

  let body: { email?: unknown; password?: unknown; rememberMe?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError("invalid_request", "Body must be JSON.", 400, corsHeaders)
  }

  const emailLower =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : null
  const rememberMe = body.rememberMe === true

  // IP + per-email rate limit
  const limit = checkAuthLimit(request, project.id, AUTH_LIMITS.login, emailLower)
  if (!limit.allowed) {
    await enforceMinLatency(startedAt, LOGIN_MIN_LATENCY_MS)
    return jsonError(
      "rate_limited",
      `Too many login attempts. Retry in ${limit.retryAfter}s.`,
      429,
      { ...corsHeaders, "Retry-After": String(limit.retryAfter) },
    )
  }

  if (!isLikelyEmail(body.email) || typeof body.password !== "string") {
    await enforceMinLatency(startedAt, LOGIN_MIN_LATENCY_MS)
    return jsonError(
      "invalid_credentials",
      "Email or password is incorrect.",
      401,
      corsHeaders,
    )
  }

  const user = await authProjectUserModel.findByEmail(project.id, body.email)
  if (!user) {
    // Email enumeration: uniform invalid_credentials response.
    await enforceMinLatency(startedAt, LOGIN_MIN_LATENCY_MS)
    return jsonError(
      "invalid_credentials",
      "Email or password is incorrect.",
      401,
      corsHeaders,
    )
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await enforceMinLatency(startedAt, LOGIN_MIN_LATENCY_MS)
    return jsonError(
      "account_locked",
      `Account temporarily locked until ${user.lockedUntil.toISOString()}.`,
      423,
      corsHeaders,
    )
  }

  if (!verifyPassword(body.password, user.passwordHash)) {
    const lockResult = await authProjectUserModel.recordLoginFailure(user.id)
    if (lockResult.locked) {
      // A5: Lockout notification mail (best-effort, non-blocking).
      await sendAuthProjectMail("auth-project.account-locked", {
        to: user.email,
        locale: resolveLocaleFromRequest(request),
        brand: brandFromProject(project),
        variables: {
          userEmail: user.email,
          lockedUntil: lockResult.until?.toISOString() ?? "",
          ipAddress: extractIp(request) ?? "unknown",
          resetUrl: `${authPublicBase()}/p/${project.slug}/reset-password`,
        },
      }).catch(() => undefined)
      await audit({
        userId: user.id,
        companyId: project.companyId,
        action: "auth-project.user.account-locked",
        resource: "auth-project-user",
        resourceId: user.id,
        details: {
          projectSlug: project.slug,
          lockedUntil: lockResult.until?.toISOString(),
          ipAddress: extractIp(request),
        },
        ipAddress: extractIp(request) ?? undefined,
      })

      dispatchAuthWebhook(
        project.id,
        "user.account-locked",
        {
          user: { id: user.id, email: user.email },
          lockedUntil: lockResult.until?.toISOString() ?? null,
          ipAddress: extractIp(request),
          projectSlug: project.slug,
        },
        { userId: user.id },
      )
      await enforceMinLatency(startedAt, LOGIN_MIN_LATENCY_MS)
      return jsonError(
        "account_locked",
        `Too many failed attempts. Locked until ${lockResult.until?.toISOString() ?? "soon"}.`,
        423,
        corsHeaders,
      )
    }
    await enforceMinLatency(startedAt, LOGIN_MIN_LATENCY_MS)
    return jsonError(
      "invalid_credentials",
      "Email or password is incorrect.",
      401,
      corsHeaders,
    )
  }

  if (project.emailVerificationRequired && !user.emailVerified) {
    await enforceMinLatency(startedAt, LOGIN_MIN_LATENCY_MS)
    return jsonError(
      "email_not_verified",
      "Verify your email before signing in.",
      403,
      corsHeaders,
    )
  }

  // MFA enrolled? Şimdi 2nd factor iste, final token issue etme.
  const mfa = await authProjectUserMfaModel.findByUser(user.id)
  if (mfa && mfa.verifiedAt) {
    const { token: mfaToken } = await authProjectTokenModel.create({
      authProjectId: project.id,
      userId: user.id,
      purpose: "mfa-pending",
      payload: { rememberMe },
    })
    await enforceMinLatency(startedAt, LOGIN_MIN_LATENCY_MS)
    return jsonOk(
      {
        data: {
          mfaRequired: true,
          mfaToken,
          factorType: mfa.factorType,
        },
      },
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
    details: { projectSlug: project.slug },
    ipAddress: extractIp(request) ?? undefined,
  })

  dispatchAuthWebhook(
    project.id,
    "user.login",
    {
      user: { id: user.id, email: user.email },
      ipAddress: extractIp(request),
      userAgent: request.headers.get("user-agent"),
      projectSlug: project.slug,
    },
    { userId: user.id },
  )

  const tokens = await issueTokens(project, user, request, { rememberMe })
  await enforceMinLatency(startedAt, LOGIN_MIN_LATENCY_MS)
  return jsonOk({ data: { user: safeUser(user), ...tokens } }, corsHeaders)
}

// ─── /login/mfa/verify ────────────────────────────────────────────────────

export async function loginMfaVerifyPost(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const startedAt = Date.now()
  const { projectSlug } = await params
  const ctx = await resolveProjectAuth(request, projectSlug)
  if ("project" in ctx === false) return ctx
  const { project, corsHeaders } = ctx

  let body: { mfaToken?: unknown; code?: unknown; recoveryCode?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError("invalid_request", "Body must be JSON.", 400, corsHeaders)
  }
  if (typeof body.mfaToken !== "string") {
    return jsonError("invalid_request", "mfaToken required.", 400, corsHeaders)
  }
  if (typeof body.code !== "string" && typeof body.recoveryCode !== "string") {
    return jsonError(
      "invalid_request",
      "code or recoveryCode required.",
      400,
      corsHeaders,
    )
  }

  const limit = checkAuthLimit(request, project.id, AUTH_LIMITS.login, null)
  if (!limit.allowed) {
    await enforceMinLatency(startedAt, LOGIN_MIN_LATENCY_MS)
    return jsonError(
      "rate_limited",
      `Too many attempts. Retry in ${limit.retryAfter}s.`,
      429,
      { ...corsHeaders, "Retry-After": String(limit.retryAfter) },
    )
  }

  const consume = await authProjectTokenModel.consume(body.mfaToken, "mfa-pending")
  if (!consume.ok) {
    await enforceMinLatency(startedAt, LOGIN_MIN_LATENCY_MS)
    return jsonError(
      "invalid_grant",
      `MFA token ${consume.reason}; sign in again.`,
      401,
      corsHeaders,
    )
  }
  if (consume.token.authProjectId !== project.id) {
    await enforceMinLatency(startedAt, LOGIN_MIN_LATENCY_MS)
    return jsonError("invalid_grant", "Token mismatch.", 401, corsHeaders)
  }

  const user = await authProjectUserModel.findById(consume.token.userId)
  if (!user) {
    await enforceMinLatency(startedAt, LOGIN_MIN_LATENCY_MS)
    return jsonError("invalid_grant", "User no longer exists.", 401, corsHeaders)
  }
  const mfa = await authProjectUserMfaModel.findByUser(user.id)
  if (!mfa || !mfa.verifiedAt) {
    await enforceMinLatency(startedAt, LOGIN_MIN_LATENCY_MS)
    return jsonError(
      "invalid_grant",
      "MFA factor no longer registered.",
      400,
      corsHeaders,
    )
  }

  const { verifyTotpCode } = await import("@workspace/console/lib/totp")
  let ok = false
  if (typeof body.code === "string") {
    ok = verifyTotpCode(mfa.secret, body.code)
  } else if (typeof body.recoveryCode === "string") {
    ok = await authProjectUserMfaModel.consumeRecoveryCode(
      user.id,
      body.recoveryCode,
    )
  }
  if (!ok) {
    await authProjectUserModel.recordLoginFailure(user.id)
    await enforceMinLatency(startedAt, LOGIN_MIN_LATENCY_MS)
    return jsonError(
      "invalid_credentials",
      "MFA code incorrect.",
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
    details: { projectSlug: project.slug, mfa: true },
    ipAddress: extractIp(request) ?? undefined,
  })

  dispatchAuthWebhook(
    project.id,
    "user.login",
    {
      user: { id: user.id, email: user.email },
      mfa: true,
      ipAddress: extractIp(request),
      userAgent: request.headers.get("user-agent"),
      projectSlug: project.slug,
    },
    { userId: user.id },
  )

  const rememberMe =
    (consume.token.payload as { rememberMe?: boolean } | null)?.rememberMe === true
  const tokens = await issueTokens(project, user, request, { rememberMe })
  await enforceMinLatency(startedAt, LOGIN_MIN_LATENCY_MS)
  return jsonOk({ data: { user: safeUser(user), ...tokens } }, corsHeaders)
}

// ─── /refresh ─────────────────────────────────────────────────────────────

export async function refreshPost(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  const ctx = await resolveProjectAuth(request, projectSlug)
  if ("project" in ctx === false) return ctx
  const { project, corsHeaders } = ctx

  let body: { refreshToken?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError("invalid_request", "Body must be JSON.", 400, corsHeaders)
  }
  if (typeof body.refreshToken !== "string") {
    return jsonError(
      "invalid_request",
      "refreshToken (string) is required.",
      400,
      corsHeaders,
    )
  }

  const stored = await authProjectSessionModel.findByToken(body.refreshToken)
  if (!stored) {
    return jsonError("invalid_grant", "Refresh token unknown.", 401, corsHeaders)
  }
  if (stored.authProjectId !== project.id) {
    return jsonError(
      "invalid_grant",
      "Token does not belong to this project.",
      401,
      corsHeaders,
    )
  }
  if (stored.revokedAt) {
    return jsonError("invalid_grant", "Refresh token revoked.", 401, corsHeaders)
  }
  if (stored.expiresAt < new Date()) {
    return jsonError("invalid_grant", "Refresh token expired.", 401, corsHeaders)
  }
  if (stored.consumedAt) {
    // Reuse → entire family revoke (RFC 9700 §4.13)
    await authProjectSessionModel.revokeFamily(stored.familyId).catch(() => {})
    await audit({
      userId: stored.userId,
      companyId: project.companyId,
      action: "auth-project.refresh.reuse-detected",
      resource: "auth-project-session",
      resourceId: stored.id,
      details: { projectSlug: project.slug, familyId: stored.familyId },
    })
    return jsonError(
      "invalid_grant",
      "Refresh token already used; the entire session family has been revoked. Sign in again.",
      401,
      corsHeaders,
    )
  }

  const user = await authProjectUserModel.findById(stored.userId)
  if (!user) {
    return jsonError("invalid_grant", "User no longer exists.", 401, corsHeaders)
  }

  // Rotate
  await authProjectSessionModel.markConsumed(stored.id)
  const next = await authProjectSessionModel.create({
    authProjectId: project.id,
    userId: user.id,
    familyId: stored.familyId,
    userAgent: request.headers.get("user-agent"),
    ip: extractIp(request),
  })
  const accessToken = mintAccessToken(project, user)

  return jsonOk(
    {
      data: {
        accessToken,
        refreshToken: next.token,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        tokenType: "Bearer",
      },
    },
    corsHeaders,
  )
}

// ─── /logout ──────────────────────────────────────────────────────────────

export async function logoutPost(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  const ctx = await resolveProjectAuth(request, projectSlug)
  if ("project" in ctx === false) return ctx
  const { project, corsHeaders } = ctx

  let body: { refreshToken?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonOk({ data: { ok: true } }, corsHeaders) // best-effort
  }
  if (typeof body.refreshToken !== "string") {
    return jsonOk({ data: { ok: true } }, corsHeaders)
  }

  const stored = await authProjectSessionModel.findByToken(body.refreshToken)
  if (stored && stored.authProjectId === project.id) {
    await authProjectSessionModel.revoke(stored.id)
  }
  return jsonOk({ data: { ok: true } }, corsHeaders)
}

// ─── /userinfo ────────────────────────────────────────────────────────────

export async function userinfoGet(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  const project = await authProjectModel.findBySlug(projectSlug)
  if (!project || !project.enabled) {
    return jsonError("invalid_request", "Unknown project.", 404, [])
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
    return jsonError(
      "invalid_request",
      "Missing Authorization Bearer token.",
      401,
      corsHeaders,
    )
  }

  const { verifyProjectIdToken } = await import(
    "@workspace/console/lib/auth-project-jwt"
  )
  const claims = verifyProjectIdToken(m[1], project)
  if (!claims) {
    return jsonError("invalid_token", "Access token invalid or expired.", 401, corsHeaders)
  }

  const user = await authProjectUserModel.findById(claims.sub)
  if (!user || user.authProjectId !== project.id) {
    return jsonError("invalid_token", "User no longer exists.", 401, corsHeaders)
  }

  return jsonOk({ data: safeUser(user) }, corsHeaders)
}

// ─── /verify-email ────────────────────────────────────────────────────────

export async function verifyEmailPost(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  // No API key needed — the single-use verify-email token in the body is
  // the auth proof (it came from a mail we sent). API key check here would
  // force the user's browser to expose the project's master key.
  const ctx = await resolveProjectBySlug(request, projectSlug)
  if ("project" in ctx === false) return ctx
  const { project, corsHeaders } = ctx

  let body: { token?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError("invalid_request", "Body must be JSON.", 400, corsHeaders)
  }
  if (typeof body.token !== "string") {
    return jsonError("invalid_request", "token is required.", 400, corsHeaders)
  }

  const consume = await authProjectTokenModel.consume(body.token, "verify-email")
  if (!consume.ok) {
    return jsonError(
      "invalid_token",
      `Verification token ${consume.reason}.`,
      400,
      corsHeaders,
    )
  }
  if (consume.token.authProjectId !== project.id) {
    return jsonError(
      "invalid_token",
      "Token does not belong to this project.",
      400,
      corsHeaders,
    )
  }

  const user = await authProjectUserModel.update(consume.token.userId, {
    emailVerified: true,
  })
  if (!user) {
    return jsonError("invalid_token", "User no longer exists.", 400, corsHeaders)
  }

  await audit({
    userId: user.id,
    companyId: project.companyId,
    action: "auth-project.user.email-verified",
    resource: "auth-project-user",
    resourceId: user.id,
    details: { projectSlug: project.slug },
  })

  return jsonOk({ data: { user: safeUser(user) } }, corsHeaders)
}

// ─── /password-reset/request ──────────────────────────────────────────────

export async function passwordResetRequestPost(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const startedAt = Date.now()
  const { projectSlug } = await params
  const ctx = await resolveProjectAuth(request, projectSlug)
  if ("project" in ctx === false) return ctx
  const { project, corsHeaders } = ctx

  let body: { email?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError("invalid_request", "Body must be JSON.", 400, corsHeaders)
  }

  const emailLower =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : null

  const limit = checkAuthLimit(
    request,
    project.id,
    AUTH_LIMITS.passwordResetRequest,
    emailLower,
  )
  if (!limit.allowed) {
    await enforceMinLatency(startedAt, RESET_REQUEST_MIN_LATENCY_MS)
    return jsonError(
      "rate_limited",
      `Too many reset requests. Retry in ${limit.retryAfter}s.`,
      429,
      { ...corsHeaders, "Retry-After": String(limit.retryAfter) },
    )
  }

  if (!isLikelyEmail(body.email)) {
    await enforceMinLatency(startedAt, RESET_REQUEST_MIN_LATENCY_MS)
    return jsonError(
      "invalid_request",
      "email (string) is required.",
      400,
      corsHeaders,
    )
  }

  const user = await authProjectUserModel.findByEmail(project.id, body.email)
  // Uniform success response (email enumeration protection — always
  // returns ok even if user not found).
  if (user) {
    // Önceki bekleyen reset token'ları invalidate et (kullanıcı yenisini
    // istedi, eski bağlantılar bayraklansın).
    await authProjectTokenModel.invalidateAllForUser(
      project.id,
      user.id,
      "password-reset",
    )
    const { token } = await authProjectTokenModel.create({
      authProjectId: project.id,
      userId: user.id,
      purpose: "password-reset",
    })
    const resetUrl = `${authPublicBase()}/p/${project.slug}/reset-password?token=${encodeURIComponent(token)}`
    const result = await sendAuthProjectMail("auth-project.password-reset", {
      to: user.email,
      locale: resolveLocaleFromRequest(request),
      brand: brandFromProject(project),
      variables: {
        userEmail: user.email,
        resetUrl,
      },
    })
    if (!result.sent) {
      console.warn(
        "[auth-project] password reset email not sent",
        { projectSlug: project.slug, userId: user.id, reason: result.reason, tokenPrefix: token.slice(0, 8) },
      )
    }
    await audit({
      userId: user.id,
      companyId: project.companyId,
      action: "auth-project.user.password-reset-requested",
      resource: "auth-project-user",
      resourceId: user.id,
      details: { projectSlug: project.slug, mailSent: result.sent },
    })
  }

  await enforceMinLatency(startedAt, RESET_REQUEST_MIN_LATENCY_MS)
  return jsonOk({ data: { ok: true } }, corsHeaders)
}

// ─── /password-reset/confirm ──────────────────────────────────────────────

export async function passwordResetConfirmPost(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  // No API key needed — the reset token in the body is the auth proof.
  // RP'nin browser'ı bu endpoint'i çağırırken master key'i taşımak
  // zorunda kalmamalı; token zaten secret-of-knowledge.
  const ctx = await resolveProjectBySlug(request, projectSlug)
  if ("project" in ctx === false) return ctx
  const { project, corsHeaders } = ctx

  let body: { token?: unknown; newPassword?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError("invalid_request", "Body must be JSON.", 400, corsHeaders)
  }
  if (typeof body.token !== "string" || typeof body.newPassword !== "string") {
    return jsonError(
      "invalid_request",
      "token and newPassword are required.",
      400,
      corsHeaders,
    )
  }

  const policy = validatePasswordPolicy(body.newPassword, project.passwordPolicy)
  if (!policy.ok) {
    return jsonError(
      "weak_password",
      `Password does not meet policy: ${policy.reason}.`,
      400,
      corsHeaders,
    )
  }

  const pwned = await checkPwnedPassword(body.newPassword, { minCount: 3 })
  if (pwned.breached) {
    return jsonError(
      "weak_password",
      `This password has appeared in ${pwned.count.toLocaleString()} known breaches. Choose a different one.`,
      400,
      corsHeaders,
    )
  }

  const consume = await authProjectTokenModel.consume(body.token, "password-reset")
  if (!consume.ok) {
    return jsonError(
      "invalid_token",
      `Reset token ${consume.reason}.`,
      400,
      corsHeaders,
    )
  }
  if (consume.token.authProjectId !== project.id) {
    return jsonError(
      "invalid_token",
      "Token does not belong to this project.",
      400,
      corsHeaders,
    )
  }

  const user = await authProjectUserModel.update(consume.token.userId, {
    passwordHash: hashPassword(body.newPassword),
  })
  if (!user) {
    return jsonError("invalid_token", "User no longer exists.", 400, corsHeaders)
  }

  // Reset sonrası tüm session'ları revoke et — sahibi tüm cihazlardan
  // çıkar (security best practice).
  await authProjectSessionModel.revokeAllForUser(project.id, user.id)

  await audit({
    userId: user.id,
    companyId: project.companyId,
    action: "auth-project.user.password-reset",
    resource: "auth-project-user",
    resourceId: user.id,
    details: { projectSlug: project.slug },
  })

  dispatchAuthWebhook(
    project.id,
    "user.password-changed",
    {
      user: { id: user.id, email: user.email },
      via: "reset",
      projectSlug: project.slug,
    },
    { userId: user.id },
  )

  return jsonOk({ data: { user: safeUser(user) } }, corsHeaders)
}

// ─── /jwks.json ───────────────────────────────────────────────────────────

// ─── /invitation/accept ──────────────────────────────────────────────────

export async function invitationAcceptPost(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  const ctxResult = await resolveProjectBySlug(request, projectSlug)
  if ("project" in ctxResult === false) return ctxResult
  const { project, corsHeaders } = ctxResult

  let body: { token?: unknown; password?: unknown; displayName?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError("invalid_request", "Body must be JSON.", 400, corsHeaders)
  }
  if (typeof body.token !== "string" || typeof body.password !== "string") {
    return jsonError(
      "invalid_request",
      "token + password required.",
      400,
      corsHeaders,
    )
  }
  const policy = validatePasswordPolicy(body.password, project.passwordPolicy)
  if (!policy.ok) {
    return jsonError(
      "weak_password",
      `Password does not meet policy: ${policy.reason}.`,
      400,
      corsHeaders,
    )
  }
  const pwned = await checkPwnedPassword(body.password, { minCount: 3 })
  if (pwned.breached) {
    return jsonError(
      "weak_password",
      `This password has appeared in ${pwned.count.toLocaleString()} known breaches. Choose a different one.`,
      400,
      corsHeaders,
    )
  }
  const consume = await authProjectTokenModel.consume(body.token, "invitation")
  if (!consume.ok) {
    return jsonError(
      "invalid_token",
      `Invitation ${consume.reason}.`,
      400,
      corsHeaders,
    )
  }
  if (consume.token.authProjectId !== project.id) {
    return jsonError("invalid_token", "Token mismatch.", 400, corsHeaders)
  }
  const payload = consume.token.payload as
    | {
        email?: string
        displayName?: string | null
        metadata?: Record<string, unknown>
      }
    | null
  if (!payload?.email) {
    return jsonError("invalid_token", "Invitation payload missing.", 400, corsHeaders)
  }

  // Conflict — bu sırada admin user oluşturmuş olabilir
  const existing = await authProjectUserModel.findByEmail(project.id, payload.email)
  if (existing) {
    return jsonError(
      "conflict",
      "An account with this email already exists. Sign in instead.",
      409,
      corsHeaders,
    )
  }

  const user = await authProjectUserModel.create({
    authProjectId: project.id,
    email: payload.email,
    passwordHash: hashPassword(body.password),
    displayName:
      typeof body.displayName === "string"
        ? body.displayName
        : payload.displayName ?? null,
    emailVerified: true,
    metadata: payload.metadata ?? {},
  })

  await audit({
    userId: user.id,
    companyId: project.companyId,
    action: "auth-project.user.invitation-accepted",
    resource: "auth-project-user",
    resourceId: user.id,
    details: { projectSlug: project.slug },
  })

  dispatchAuthWebhook(
    project.id,
    "user.signup",
    {
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
      via: "invitation",
      projectSlug: project.slug,
    },
    { userId: user.id },
  )

  const tokens = await issueTokens(project, user, request)
  return jsonOk({ data: { user: safeUser(user), ...tokens } }, corsHeaders, 201)
}

// ─── /magic-link/request ──────────────────────────────────────────────────

const MAGIC_LINK_MIN_LATENCY_MS = 300

export async function magicLinkRequestPost(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const startedAt = Date.now()
  const { projectSlug } = await params
  const ctx = await resolveProjectAuth(request, projectSlug)
  if ("project" in ctx === false) return ctx
  const { project, corsHeaders } = ctx

  if (!project.magicLinkEnabled) {
    return jsonError(
      "feature_disabled",
      "Magic link sign-in is not enabled for this project.",
      400,
      corsHeaders,
    )
  }

  let body: { email?: unknown; redirectUri?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError("invalid_request", "Body must be JSON.", 400, corsHeaders)
  }

  const emailLower =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : null

  const limit = checkAuthLimit(
    request,
    project.id,
    AUTH_LIMITS.passwordResetRequest,
    emailLower,
  )
  if (!limit.allowed) {
    await enforceMinLatency(startedAt, MAGIC_LINK_MIN_LATENCY_MS)
    return jsonError(
      "rate_limited",
      `Too many requests. Retry in ${limit.retryAfter}s.`,
      429,
      { ...corsHeaders, "Retry-After": String(limit.retryAfter) },
    )
  }

  if (!isLikelyEmail(body.email)) {
    await enforceMinLatency(startedAt, MAGIC_LINK_MIN_LATENCY_MS)
    return jsonError(
      "invalid_request",
      "email is required.",
      400,
      corsHeaders,
    )
  }

  const user = await authProjectUserModel.findByEmail(project.id, body.email)
  // Uniform success — email enumeration protection. User yoksa yine ok döner.
  if (user) {
    await authProjectTokenModel.invalidateAllForUser(
      project.id,
      user.id,
      "magic-link",
    )
    const { token } = await authProjectTokenModel.create({
      authProjectId: project.id,
      userId: user.id,
      purpose: "magic-link",
      payload:
        typeof body.redirectUri === "string"
          ? { redirectUri: body.redirectUri }
          : null,
    })
    const magicUrl = `${authPublicBase()}/p/${project.slug}/magic-link?token=${encodeURIComponent(token)}`
    await sendAuthProjectMail("auth-project.magic-link", {
      to: user.email,
      locale: resolveLocaleFromRequest(request),
      brand: brandFromProject(project),
      variables: {
        userEmail: user.email,
        magicUrl,
      },
    }).catch(() => undefined)
    await audit({
      userId: user.id,
      companyId: project.companyId,
      action: "auth-project.user.magic-link-requested",
      resource: "auth-project-user",
      resourceId: user.id,
      details: { projectSlug: project.slug },
      ipAddress: extractIp(request) ?? undefined,
    })
  }

  await enforceMinLatency(startedAt, MAGIC_LINK_MIN_LATENCY_MS)
  return jsonOk({ data: { ok: true } }, corsHeaders)
}

// ─── /magic-link/consume ──────────────────────────────────────────────────

export async function magicLinkConsumePost(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  // Token-of-knowledge — API key gerekmez (mail'den geliyor).
  const ctxResult = await resolveProjectBySlug(request, projectSlug)
  if ("project" in ctxResult === false) return ctxResult
  const { project, corsHeaders } = ctxResult

  let body: { token?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError("invalid_request", "Body must be JSON.", 400, corsHeaders)
  }
  if (typeof body.token !== "string") {
    return jsonError("invalid_request", "token required.", 400, corsHeaders)
  }

  const consume = await authProjectTokenModel.consume(body.token, "magic-link")
  if (!consume.ok) {
    return jsonError(
      "invalid_token",
      `Magic link ${consume.reason}.`,
      400,
      corsHeaders,
    )
  }
  if (consume.token.authProjectId !== project.id) {
    return jsonError(
      "invalid_token",
      "Token does not belong to this project.",
      400,
      corsHeaders,
    )
  }

  const user = await authProjectUserModel.findById(consume.token.userId)
  if (!user) {
    return jsonError("invalid_token", "User no longer exists.", 400, corsHeaders)
  }

  // Magic link giriş aynı zamanda email verify sayılır (token'a sadece o
  // adresin sahibi ulaşabilir).
  if (!user.emailVerified) {
    await authProjectUserModel.update(user.id, { emailVerified: true })
  }

  await authProjectUserModel.recordLoginSuccess(user.id, extractIp(request))
  await audit({
    userId: user.id,
    companyId: project.companyId,
    action: "auth-project.user.login",
    resource: "auth-project-user",
    resourceId: user.id,
    details: { projectSlug: project.slug, via: "magic-link" },
    ipAddress: extractIp(request) ?? undefined,
  })

  dispatchAuthWebhook(
    project.id,
    "user.login",
    {
      user: { id: user.id, email: user.email },
      via: "magic-link",
      ipAddress: extractIp(request),
      userAgent: request.headers.get("user-agent"),
      projectSlug: project.slug,
    },
    { userId: user.id },
  )

  const tokens = await issueTokens(project, user, request)
  const redirectUri = (consume.token.payload as { redirectUri?: string } | null)
    ?.redirectUri
  return jsonOk(
    {
      data: {
        user: safeUser(user),
        ...tokens,
        redirectUri: redirectUri ?? null,
      },
    },
    corsHeaders,
  )
}

export async function jwksGet(
  _request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  const project = await authProjectModel.findBySlug(projectSlug)
  if (!project) {
    return jsonError("invalid_request", "Unknown project.", 404, [])
  }
  return jsonOk(getProjectJwks(project) as Record<string, unknown>)
}

// ─── OPTIONS preflight (per-endpoint shim'ler kullanır) ──────────────────

export async function options(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  const project = await authProjectModel.findBySlug(projectSlug)
  return preflight(request, project)
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function safeUser(user: AuthProjectUser): Record<string, unknown> {
  // Drop sensitive fields before returning to client.
  const {
    passwordHash: _h,
    passwordAlgo: _a,
    failedLoginCount: _f,
    ...rest
  } = user
  return rest
}

function mintAccessToken(project: AuthProject, user: AuthProjectUser): string {
  const now = Math.floor(Date.now() / 1000)
  const claims: AuthProjectIdTokenClaims = {
    sub: user.id,
    iss: `${process.env.NEXT_PUBLIC_AUTH_APP_URL || "https://auth.sentroy.com"}/p/${project.slug}`,
    aud: project.apiKeyPrefix,
    iat: now,
    exp: now + ACCESS_TOKEN_TTL_SECONDS,
    email: user.email,
    email_verified: user.emailVerified,
    name: user.displayName ?? undefined,
    picture: user.image ?? undefined,
  }

  // Custom claims (project setting):
  //   1. fromMetadata: user.metadata'dan whitelist field'ları (top-level)
  //   2. staticClaims: tüm token'lara sabit
  // Reserved claim'leri override etmemek için filter.
  const RESERVED = new Set([
    "sub", "iss", "aud", "iat", "exp", "email", "email_verified",
    "name", "picture", "nbf", "jti",
  ])
  const extra: Record<string, unknown> = {}
  for (const key of project.customClaims?.fromMetadata ?? []) {
    if (RESERVED.has(key)) continue
    const v = (user.metadata as Record<string, unknown>)[key]
    if (v !== undefined) extra[key] = v
  }
  for (const [key, value] of Object.entries(
    project.customClaims?.staticClaims ?? {},
  )) {
    if (RESERVED.has(key)) continue
    extra[key] = value
  }
  const final = { ...claims, ...extra } as AuthProjectIdTokenClaims
  return signProjectIdToken(project, final)
}

const REMEMBER_ME_TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 days

async function issueTokens(
  project: AuthProject,
  user: AuthProjectUser,
  request: NextRequest,
  opts: { rememberMe?: boolean } = {},
): Promise<{
  accessToken: string
  refreshToken: string
  expiresIn: number
  tokenType: "Bearer"
}> {
  const accessToken = mintAccessToken(project, user)
  const { token: refreshToken } = await authProjectSessionModel.create({
    authProjectId: project.id,
    userId: user.id,
    userAgent: request.headers.get("user-agent"),
    ip: extractIp(request),
    ttlMs: opts.rememberMe ? REMEMBER_ME_TTL_MS : undefined,
  })
  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    tokenType: "Bearer",
  }
}

function extractIp(request: NextRequest): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  )
}

/**
 * Mail link base URL — auth.sentroy.com'da host edilen verify/reset
 * landing page'lere işaret eder. v2'de RP'lerin kendi domain'ini bağlamak
 * için per-project `mailLinkBaseUrl` ayarı eklenir (custom domain epic'i).
 */
function authPublicBase(): string {
  return (
    process.env.NEXT_PUBLIC_AUTH_APP_URL?.replace(/\/$/, "") ||
    "https://auth.sentroy.com"
  )
}

/**
 * Accept-Language → tr/en. RP, request'i `Accept-Language: tr` veya `en`
 * ile süslerse o locale ile mail gönderilir; yoksa default `en`.
 */
function resolveLocaleFromRequest(request: NextRequest): string {
  const al = request.headers.get("accept-language") || ""
  // İlk dil tag'ini al, 2-char prefix kontrol et
  const first = al.split(",")[0]?.trim().slice(0, 2).toLowerCase()
  return first === "tr" ? "tr" : "en"
}

/**
 * Project'in DB branding ayarlarını mail template'in `BrandContext`
 * shape'ine map'ler. Brand'in `projectName`'i project'in display-name'i
 * (yoksa name); `primaryColor` ve `logoUrl` null da olabilir.
 */
function brandFromProject(project: AuthProject) {
  return {
    projectId: project.id,
    projectName: project.branding.displayName || project.name,
    primaryColor: project.branding.primaryColor,
    logoUrl: project.branding.logoUrl,
  }
}
