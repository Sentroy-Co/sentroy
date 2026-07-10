import { NextRequest } from "next/server"
import {
  authProjectModel,
  authProjectUserModel,
  authProjectSessionModel,
  authProjectTokenModel,
  authProjectUserMfaModel,
  auditLogModel,
} from "@workspace/db/models"
import { jsonError, jsonOk, preflight } from "@workspace/console/lib/auth-project-api"
import { sendAuthProjectMail } from "@workspace/auth/server/auth-project-mail-events"
import {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
} from "@workspace/console/lib/auth-project-password"
import { verifyProjectIdToken } from "@workspace/console/lib/auth-project-jwt"
import { checkPwnedPassword } from "@workspace/console/lib/pwned-passwords"
import { dispatchAuthWebhook } from "@workspace/console/lib/auth-webhook-dispatcher"
import { audit } from "@workspace/console/lib/audit"
import type { AuthProject } from "@workspace/db/models/auth-project"
import type { AuthProjectUser } from "@workspace/db/models/auth-project-user"

/**
 * End-user self-service endpoints `/api/v1/auth/[projectSlug]/me/*`.
 *
 * Auth model: **end-user access JWT** (Bearer). RP server'larından değil,
 * doğrudan SDK/browser bu endpoint'leri çağırır — kullanıcı kendi
 * hesabını yönetir. Bu yüzden API key gerekmez; JWT verify yeterli auth.
 *
 * Endpoints:
 *   GET    /me                       — current user (alias of userinfo)
 *   GET    /me/sessions              — list active sessions
 *   DELETE /me/sessions/[id]         — revoke specific session
 *   POST   /me/password              — change password (current + new)
 *   POST   /me/email/change-request  — request email change (newEmail + currentPassword)
 *   POST   /me/email/change-confirm  — confirm with token (from mail)
 *   POST   /me/account/delete-request — request account deletion (currentPassword)
 *   POST   /me/account/delete-confirm — confirm with token
 *   GET    /me/activity              — login history (last 50)
 */

const PASSWORD_CHANGE_MIN_LATENCY_MS = 500

interface ResolvedMe {
  project: AuthProject
  user: AuthProjectUser
  corsHeaders: Record<string, string>
}

interface MeError {
  error: ReturnType<typeof jsonError>
}

/**
 * End-user JWT verify + project resolve + CORS — `/me/*` handler'ları için.
 * Token süresi dolmuş veya user yoksa 401 döner.
 */
async function resolveMe(
  request: NextRequest,
  projectSlug: string,
): Promise<ResolvedMe | MeError> {
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
        "Missing Authorization Bearer token.",
        401,
        corsHeaders,
      ),
    }
  }
  const claims = verifyProjectIdToken(m[1], project)
  if (!claims) {
    return {
      error: jsonError(
        "invalid_token",
        "Access token invalid or expired.",
        401,
        corsHeaders,
      ),
    }
  }
  const user = await authProjectUserModel.findById(claims.sub)
  if (!user || user.authProjectId !== project.id) {
    return {
      error: jsonError(
        "invalid_token",
        "User no longer exists.",
        401,
        corsHeaders,
      ),
    }
  }
  return { project, user, corsHeaders }
}

function safeUser(user: AuthProjectUser): Record<string, unknown> {
  const {
    passwordHash: _h,
    passwordAlgo: _a,
    failedLoginCount: _f,
    ...rest
  } = user
  return rest
}

function extractIp(request: NextRequest): string | null {
  return (
    request.headers.get("cf-connecting-ip")?.trim() ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  )
}

function resolveLocaleFromRequest(request: NextRequest): string {
  const al = request.headers.get("accept-language") || ""
  const first = al.split(",")[0]?.trim().slice(0, 2).toLowerCase()
  return first === "tr" ? "tr" : "en"
}

function brandFromProject(project: AuthProject) {
  return {
    projectId: project.id,
    projectName: project.branding.displayName || project.name,
    primaryColor: project.branding.primaryColor,
    logoUrl: project.branding.logoUrl,
  }
}

function authPublicBase(): string {
  return (
    process.env.NEXT_PUBLIC_AUTH_APP_URL?.replace(/\/$/, "") ||
    "https://auth.sentroy.com"
  )
}

// ─── GET /me ──────────────────────────────────────────────────────────────

export async function meGet(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  const ctx = await resolveMe(request, projectSlug)
  if ("error" in ctx) return ctx.error
  return jsonOk({ data: safeUser(ctx.user) }, ctx.corsHeaders)
}

// ─── GET /me/sessions ─────────────────────────────────────────────────────

export async function meSessionsListGet(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  const ctx = await resolveMe(request, projectSlug)
  if ("error" in ctx) return ctx.error
  const sessions = await authProjectSessionModel.listForUser(
    ctx.project.id,
    ctx.user.id,
  )
  // Sensitive (refreshTokenHash) dışındakileri publish et
  const projected = sessions.map((s) => ({
    id: s.id,
    refreshTokenPrefix: s.refreshTokenPrefix,
    userAgent: s.userAgent,
    ip: s.ip,
    expiresAt: s.expiresAt,
    createdAt: s.createdAt,
  }))
  return jsonOk({ data: projected }, ctx.corsHeaders)
}

// ─── DELETE /me/sessions/[id] ─────────────────────────────────────────────

export async function meSessionsRevoke(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ projectSlug: string; sessionId: string }>
  },
) {
  const { projectSlug, sessionId } = await params
  const ctx = await resolveMe(request, projectSlug)
  if ("error" in ctx) return ctx.error

  // Sahiplik kontrolü — user kendi session'ı dışında bir session'ı
  // revoke edemez. listForUser döner aktif olanları; içinden filter.
  const sessions = await authProjectSessionModel.listForUser(
    ctx.project.id,
    ctx.user.id,
  )
  const target = sessions.find((s) => s.id === sessionId)
  if (!target) {
    return jsonError("not_found", "Session not found.", 404, ctx.corsHeaders)
  }
  await authProjectSessionModel.revoke(sessionId)
  await audit({
    userId: ctx.user.id,
    companyId: ctx.project.companyId,
    action: "auth-project.user.session-revoked",
    resource: "auth-project-session",
    resourceId: sessionId,
    details: { projectSlug: ctx.project.slug, self: true },
    ipAddress: extractIp(request) ?? undefined,
  })
  return jsonOk({ data: { ok: true } }, ctx.corsHeaders)
}

// ─── POST /me/password (change) ───────────────────────────────────────────

export async function mePasswordChange(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const startedAt = Date.now()
  const { projectSlug } = await params
  const ctx = await resolveMe(request, projectSlug)
  if ("error" in ctx) return ctx.error
  const { project, user, corsHeaders } = ctx

  let body: { currentPassword?: unknown; newPassword?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError("invalid_request", "Body must be JSON.", 400, corsHeaders)
  }
  if (
    typeof body.currentPassword !== "string" ||
    typeof body.newPassword !== "string"
  ) {
    return jsonError(
      "invalid_request",
      "currentPassword and newPassword required.",
      400,
      corsHeaders,
    )
  }

  if (!verifyPassword(body.currentPassword, user.passwordHash)) {
    await new Promise((r) =>
      setTimeout(r, Math.max(0, PASSWORD_CHANGE_MIN_LATENCY_MS - (Date.now() - startedAt))),
    )
    return jsonError(
      "invalid_credentials",
      "Current password is incorrect.",
      401,
      corsHeaders,
    )
  }

  const policy = validatePasswordPolicy(body.newPassword, project.passwordPolicy)
  if (!policy.ok) {
    return jsonError(
      "weak_password",
      `New password does not meet policy: ${policy.reason}.`,
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

  // No-op short-circuit: aynı password ise reddet (kullanıcı yanlışlıkla
  // current ile new'i karıştırmış olabilir).
  if (verifyPassword(body.newPassword, user.passwordHash)) {
    return jsonError(
      "invalid_request",
      "New password must differ from current.",
      400,
      corsHeaders,
    )
  }

  await authProjectUserModel.update(user.id, {
    passwordHash: hashPassword(body.newPassword),
  })

  // Best practice: tüm session'ları revoke et (kullanıcı diğer cihazlardan
  // çıkar). Bu çağrıyı yapan session de revoke ediliyor — caller'ın
  // refresh token'ı bundan sonra invalid_grant döner.
  await authProjectSessionModel.revokeAllForUser(project.id, user.id)

  await audit({
    userId: user.id,
    companyId: project.companyId,
    action: "auth-project.user.password-changed",
    resource: "auth-project-user",
    resourceId: user.id,
    details: { projectSlug: project.slug, self: true },
    ipAddress: extractIp(request) ?? undefined,
  })

  dispatchAuthWebhook(
    project.id,
    "user.password-changed",
    {
      user: { id: user.id, email: user.email },
      via: "self-service",
      projectSlug: project.slug,
    },
    { userId: user.id },
  )

  return jsonOk({ data: { ok: true } }, corsHeaders)
}

// ─── POST /me/email/change-request ────────────────────────────────────────

export async function meEmailChangeRequest(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  const ctx = await resolveMe(request, projectSlug)
  if ("error" in ctx) return ctx.error
  const { project, user, corsHeaders } = ctx

  let body: { newEmail?: unknown; currentPassword?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError("invalid_request", "Body must be JSON.", 400, corsHeaders)
  }
  const newEmailRaw = body.newEmail
  if (typeof newEmailRaw !== "string") {
    return jsonError("invalid_request", "newEmail required.", 400, corsHeaders)
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmailRaw.trim())) {
    return jsonError("invalid_request", "newEmail looks invalid.", 400, corsHeaders)
  }
  if (typeof body.currentPassword !== "string") {
    return jsonError(
      "invalid_request",
      "currentPassword required.",
      400,
      corsHeaders,
    )
  }
  if (!verifyPassword(body.currentPassword, user.passwordHash)) {
    return jsonError(
      "invalid_credentials",
      "Current password is incorrect.",
      401,
      corsHeaders,
    )
  }
  if (newEmailRaw.trim().toLowerCase() === user.emailLower) {
    return jsonError(
      "invalid_request",
      "New email is the same as current.",
      400,
      corsHeaders,
    )
  }

  // Conflict pre-check (race-safe: değişiklik consume sırasında bir kez daha
  // yapılır, ama UX gerçekçi feedback için bunu erken yakalayalım)
  const conflict = await authProjectUserModel.findByEmail(
    project.id,
    newEmailRaw,
  )
  if (conflict) {
    // Email enumeration: uniform ok response, sahibe "someone requested
    // change to your address" maili at (signup-attempt-existing pattern'i).
    await sendAuthProjectMail("auth-project.signup-attempt-existing", {
      to: conflict.email,
      locale: resolveLocaleFromRequest(request),
      brand: brandFromProject(project),
      variables: {
        userEmail: conflict.email,
        signinUrl: `${authPublicBase()}/p/${project.slug}/login`,
        resetUrl: `${authPublicBase()}/p/${project.slug}/reset-password`,
      },
    }).catch(() => undefined)
    return jsonOk(
      { data: { ok: true, message: "If the email is available, check the inbox." } },
      corsHeaders,
    )
  }

  // Yeni adrese token-confirmation maili at
  const { token } = await authProjectTokenModel.create({
    authProjectId: project.id,
    userId: user.id,
    purpose: "email-change",
    payload: { newEmail: newEmailRaw.trim() },
  })
  const confirmUrl = `${authPublicBase()}/p/${project.slug}/email-change?token=${encodeURIComponent(token)}`
  await sendAuthProjectMail("auth-project.email-change", {
    to: newEmailRaw.trim(),
    locale: resolveLocaleFromRequest(request),
    brand: brandFromProject(project),
    variables: {
      userEmail: user.email,
      newEmail: newEmailRaw.trim(),
      confirmUrl,
    },
  }).catch(() => undefined)

  await audit({
    userId: user.id,
    companyId: project.companyId,
    action: "auth-project.user.email-change-requested",
    resource: "auth-project-user",
    resourceId: user.id,
    details: {
      projectSlug: project.slug,
      currentEmail: user.email,
      newEmailDomain: newEmailRaw.split("@")[1] ?? null,
    },
    ipAddress: extractIp(request) ?? undefined,
  })

  return jsonOk({ data: { ok: true } }, corsHeaders)
}

// ─── POST /me/email/change-confirm ────────────────────────────────────────

export async function meEmailChangeConfirm(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  // Token-of-knowledge auth — JWT gerekmez (kullanıcı outlook'tan tıklıyor).
  const project = await authProjectModel.findBySlug(projectSlug)
  if (!project || !project.enabled) {
    return jsonError("invalid_request", "Unknown project.", 404, [])
  }

  let body: { token?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError("invalid_request", "Body must be JSON.", 400, [])
  }
  if (typeof body.token !== "string") {
    return jsonError("invalid_request", "token required.", 400, [])
  }
  const consume = await authProjectTokenModel.consume(body.token, "email-change")
  if (!consume.ok) {
    return jsonError(
      "invalid_token",
      `Email change token ${consume.reason}.`,
      400,
      [],
    )
  }
  if (consume.token.authProjectId !== project.id) {
    return jsonError(
      "invalid_token",
      "Token does not belong to this project.",
      400,
      [],
    )
  }
  const newEmail =
    (consume.token.payload as { newEmail?: string } | null)?.newEmail
  if (!newEmail) {
    return jsonError("invalid_token", "Token payload missing newEmail.", 400, [])
  }

  const updated = await authProjectUserModel.changeEmail(
    consume.token.userId,
    newEmail,
  )
  if (!updated) {
    return jsonError(
      "conflict",
      "Email is already in use; pick another.",
      409,
      [],
    )
  }
  // Email değişti — session'ları revoke et (security best practice).
  await authProjectSessionModel.revokeAllForUser(project.id, updated.id)

  await audit({
    userId: updated.id,
    companyId: project.companyId,
    action: "auth-project.user.email-changed",
    resource: "auth-project-user",
    resourceId: updated.id,
    details: { projectSlug: project.slug, newEmail: updated.email },
  })

  dispatchAuthWebhook(
    project.id,
    "user.email-changed",
    {
      user: { id: updated.id, email: updated.email },
      projectSlug: project.slug,
    },
    { userId: updated.id },
  )

  return jsonOk({ data: safeUser(updated) })
}

// ─── POST /me/account/delete-request ──────────────────────────────────────

export async function meAccountDeleteRequest(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  const ctx = await resolveMe(request, projectSlug)
  if ("error" in ctx) return ctx.error
  const { project, user, corsHeaders } = ctx

  let body: { currentPassword?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError("invalid_request", "Body must be JSON.", 400, corsHeaders)
  }
  if (typeof body.currentPassword !== "string") {
    return jsonError(
      "invalid_request",
      "currentPassword required.",
      400,
      corsHeaders,
    )
  }
  if (!verifyPassword(body.currentPassword, user.passwordHash)) {
    return jsonError(
      "invalid_credentials",
      "Current password is incorrect.",
      401,
      corsHeaders,
    )
  }

  const { token } = await authProjectTokenModel.create({
    authProjectId: project.id,
    userId: user.id,
    purpose: "account-deletion",
  })
  const confirmUrl = `${authPublicBase()}/p/${project.slug}/account-delete?token=${encodeURIComponent(token)}`
  await sendAuthProjectMail("auth-project.account-delete", {
    to: user.email,
    locale: resolveLocaleFromRequest(request),
    brand: brandFromProject(project),
    variables: {
      userEmail: user.email,
      confirmUrl,
    },
  }).catch(() => undefined)

  await audit({
    userId: user.id,
    companyId: project.companyId,
    action: "auth-project.user.account-delete-requested",
    resource: "auth-project-user",
    resourceId: user.id,
    details: { projectSlug: project.slug },
    ipAddress: extractIp(request) ?? undefined,
  })

  return jsonOk({ data: { ok: true } }, corsHeaders)
}

// ─── POST /me/account/delete-confirm ──────────────────────────────────────

export async function meAccountDeleteConfirm(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  const project = await authProjectModel.findBySlug(projectSlug)
  if (!project || !project.enabled) {
    return jsonError("invalid_request", "Unknown project.", 404, [])
  }
  let body: { token?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError("invalid_request", "Body must be JSON.", 400, [])
  }
  if (typeof body.token !== "string") {
    return jsonError("invalid_request", "token required.", 400, [])
  }
  const consume = await authProjectTokenModel.consume(
    body.token,
    "account-deletion",
  )
  if (!consume.ok) {
    return jsonError(
      "invalid_token",
      `Deletion token ${consume.reason}.`,
      400,
      [],
    )
  }
  if (consume.token.authProjectId !== project.id) {
    return jsonError(
      "invalid_token",
      "Token does not belong to this project.",
      400,
      [],
    )
  }

  const user = await authProjectUserModel.findById(consume.token.userId)
  if (!user) {
    return jsonError("invalid_token", "User no longer exists.", 400, [])
  }

  // Cascade: tüm session'ları revoke + user'ı sil
  await authProjectSessionModel.revokeAllForUser(project.id, user.id)
  await authProjectUserModel.remove(user.id)

  await audit({
    userId: user.id,
    companyId: project.companyId,
    action: "auth-project.user.account-deleted",
    resource: "auth-project-user",
    resourceId: user.id,
    details: { projectSlug: project.slug, userEmail: user.email },
  })

  dispatchAuthWebhook(
    project.id,
    "user.account-deleted",
    {
      user: { id: user.id, email: user.email },
      projectSlug: project.slug,
    },
    { userId: user.id },
  )

  return jsonOk({ data: { ok: true } })
}

// ─── GET /me/activity ─────────────────────────────────────────────────────

export async function meActivityGet(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  const ctx = await resolveMe(request, projectSlug)
  if ("error" in ctx) return ctx.error
  const { user, corsHeaders } = ctx

  // audit_log koleksiyonunda userId match'liyle filtreler. Auth-related
  // event'ler audit-log'a yazılıyor zaten (login, password-changed,
  // session-revoked, vb).
  const RELEVANT_ACTIONS = [
    "auth-project.user.login",
    "auth-project.user.password-changed",
    "auth-project.user.password-reset",
    "auth-project.user.password-reset-requested",
    "auth-project.user.email-changed",
    "auth-project.user.email-change-requested",
    "auth-project.user.session-revoked",
    "auth-project.user.account-locked",
    "auth-project.user.account-delete-requested",
  ]
  const items = await auditLogModel.findByUser(user.id, {
    actions: RELEVANT_ACTIONS,
    limit: 50,
  })
  const projected = items.map((i) => ({
    id: i.id,
    action: i.action,
    ipAddress: i.ipAddress ?? null,
    createdAt: i.createdAt,
    details: i.details ?? null,
  }))
  return jsonOk({ data: projected }, corsHeaders)
}

// ─── GET /me/mfa ──────────────────────────────────────────────────────────

export async function meMfaStatusGet(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  const ctx = await resolveMe(request, projectSlug)
  if ("error" in ctx) return ctx.error
  const mfa = await authProjectUserMfaModel.findByUser(ctx.user.id)
  if (!mfa) return jsonOk({ data: { enrolled: false } }, ctx.corsHeaders)
  return jsonOk(
    {
      data: {
        enrolled: true,
        factorType: mfa.factorType,
        verifiedAt: mfa.verifiedAt,
        recoveryCodesRemaining: mfa.recoveryCodes.filter((r) => !r.consumedAt)
          .length,
      },
    },
    ctx.corsHeaders,
  )
}

// ─── POST /me/mfa/totp/enroll ─────────────────────────────────────────────

export async function meMfaTotpEnroll(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  const ctx = await resolveMe(request, projectSlug)
  if ("error" in ctx) return ctx.error
  const { project, user, corsHeaders } = ctx

  const mfa = await authProjectUserMfaModel.enrollTotp({
    authProjectId: project.id,
    userId: user.id,
  })
  const { buildTotpProvisioningUri } = await import(
    "@workspace/console/lib/totp"
  )
  const uri = buildTotpProvisioningUri({
    secret: mfa.secret,
    accountName: user.email,
    issuer: project.branding.displayName || project.name,
  })

  await audit({
    userId: user.id,
    companyId: project.companyId,
    action: "auth-project.user.mfa-enroll-started",
    resource: "auth-project-user",
    resourceId: user.id,
    details: { projectSlug: project.slug, factorType: "totp" },
  })

  return jsonOk(
    {
      data: {
        secret: mfa.secret,
        otpauthUri: uri,
        // Recovery codes verify-enrollment'ta üretilir
      },
    },
    corsHeaders,
  )
}

// ─── POST /me/mfa/totp/verify-enrollment ──────────────────────────────────

export async function meMfaTotpVerifyEnrollment(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  const ctx = await resolveMe(request, projectSlug)
  if ("error" in ctx) return ctx.error
  const { project, user, corsHeaders } = ctx

  let body: { code?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError("invalid_request", "Body must be JSON.", 400, corsHeaders)
  }
  if (typeof body.code !== "string") {
    return jsonError("invalid_request", "code required.", 400, corsHeaders)
  }
  const mfa = await authProjectUserMfaModel.findByUser(user.id)
  if (!mfa) {
    return jsonError("not_found", "No pending enrollment.", 404, corsHeaders)
  }
  if (mfa.verifiedAt) {
    return jsonError(
      "conflict",
      "MFA already verified — disable first to re-enroll.",
      409,
      corsHeaders,
    )
  }

  const { verifyTotpCode } = await import("@workspace/console/lib/totp")
  if (!verifyTotpCode(mfa.secret, body.code)) {
    return jsonError(
      "invalid_credentials",
      "Code incorrect.",
      401,
      corsHeaders,
    )
  }

  const result = await authProjectUserMfaModel.verifyEnrollment(mfa.id)
  if (!result) {
    return jsonError("verify failed", "Could not finalize enrollment.", 500, corsHeaders)
  }
  await audit({
    userId: user.id,
    companyId: project.companyId,
    action: "auth-project.user.mfa-enabled",
    resource: "auth-project-user",
    resourceId: user.id,
    details: { projectSlug: project.slug, factorType: "totp" },
  })
  // Recovery codes — sadece bu response'ta gösterilir.
  return jsonOk(
    {
      data: {
        enrolled: true,
        recoveryCodes: result.recoveryCodes,
      },
    },
    corsHeaders,
  )
}

// ─── POST /me/mfa/totp/disable ────────────────────────────────────────────

export async function meMfaTotpDisable(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  const ctx = await resolveMe(request, projectSlug)
  if ("error" in ctx) return ctx.error
  const { project, user, corsHeaders } = ctx

  let body: { currentPassword?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError("invalid_request", "Body must be JSON.", 400, corsHeaders)
  }
  if (typeof body.currentPassword !== "string") {
    return jsonError(
      "invalid_request",
      "currentPassword required.",
      400,
      corsHeaders,
    )
  }
  if (!verifyPassword(body.currentPassword, user.passwordHash)) {
    return jsonError(
      "invalid_credentials",
      "Current password is incorrect.",
      401,
      corsHeaders,
    )
  }
  await authProjectUserMfaModel.disable(user.id)
  await audit({
    userId: user.id,
    companyId: project.companyId,
    action: "auth-project.user.mfa-disabled",
    resource: "auth-project-user",
    resourceId: user.id,
    details: { projectSlug: project.slug },
  })
  return jsonOk({ data: { ok: true } }, corsHeaders)
}

// ─── OPTIONS preflight ────────────────────────────────────────────────────

export async function meOptions(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  const { projectSlug } = await params
  const project = await authProjectModel.findBySlug(projectSlug)
  return preflight(request, project)
}
