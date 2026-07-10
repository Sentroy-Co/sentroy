import { NextRequest, NextResponse } from "next/server"
import {
  authProjectModel,
  authProjectUserModel,
  authProjectSessionModel,
  authProjectTokenModel,
  authProjectUserExternalModel,
} from "@workspace/db/models"
import {
  jsonError,
  jsonOk,
} from "@workspace/console/lib/auth-project-api"
import { audit } from "@workspace/console/lib/audit"
import { dispatchAuthWebhook } from "@workspace/console/lib/auth-webhook-dispatcher"
import { decryptValue } from "@workspace/console/lib/env-vault-crypto"
import {
  signProjectIdToken,
  ACCESS_TOKEN_TTL_SECONDS,
  type AuthProjectIdTokenClaims,
} from "@workspace/console/lib/auth-project-jwt"
import {
  buildAppleClientSecret,
  decodeAppleIdToken,
} from "@workspace/console/lib/apple-client-secret"
import { createHash, randomBytes } from "node:crypto"
import type { AuthProject } from "@workspace/db/models/auth-project"
import type { AuthProjectUser } from "@workspace/db/models/auth-project-user"
import type { SocialProvider } from "@workspace/db/models/auth-project-user-external"

/**
 * Social federation handlers — Google + GitHub OAuth 2.0.
 *
 * Flow:
 *   1. `/social/[provider]/authorize?redirectUri=` — state token üret,
 *      provider authorize URL'sine redirect.
 *   2. `/social/[provider]/callback?code=&state=` — state verify,
 *      code exchange, userinfo fetch, link/create user, accessToken issue,
 *      `redirectUri#access_token=...&refresh_token=...` ile RP'ye redirect.
 *
 * Tüm credential'lar AES-GCM şifrelidir (project.socialProviders.*).
 */

interface ProviderDef {
  authUrl: (project: AuthProject) => string
  tokenUrl: (project: AuthProject) => string
  userinfoUrl: string | null
  scope: string
  /** PKCE required (Twitter ve isteğe bağlı diğerleri). */
  pkce: boolean
  /** Authorize URL'e provider-spesifik ek query param'lar. */
  extraAuthParams: Record<string, string>
  /** Callback HTTP yöntemi: standartlar GET, Apple form_post için POST. */
  callbackMethod: "GET" | "POST"
  /** Userinfo'dan stable id alma. */
  extractId: (info: Record<string, unknown>) => string | null
  extractEmail: (info: Record<string, unknown>) => string | null
  extractName: (info: Record<string, unknown>) => string | null
  extractImage: (info: Record<string, unknown>) => string | null
  extractEmailVerified: (info: Record<string, unknown>) => boolean
  /** Standart "openidconnect userinfo" yerine, id_token decode etmek
   *  isteyen provider'lar için (Apple). True ise token exchange response'undan
   *  id_token alınır, decode edilir, userinfoUrl çağrılmaz. */
  useIdToken?: boolean
}

const PROVIDER_DEFS: Record<SocialProvider, ProviderDef> = {
  google: {
    authUrl: () => "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: () => "https://oauth2.googleapis.com/token",
    userinfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
    pkce: false,
    extraAuthParams: { access_type: "online", prompt: "select_account" },
    callbackMethod: "GET",
    extractId: (i) => (typeof i.sub === "string" ? i.sub : null),
    extractEmail: (i) => (typeof i.email === "string" ? i.email : null),
    extractName: (i) => (typeof i.name === "string" ? i.name : null),
    extractImage: (i) => (typeof i.picture === "string" ? i.picture : null),
    extractEmailVerified: (i) => i.email_verified === true,
  },
  github: {
    authUrl: () => "https://github.com/login/oauth/authorize",
    tokenUrl: () => "https://github.com/login/oauth/access_token",
    userinfoUrl: "https://api.github.com/user",
    scope: "read:user user:email",
    pkce: false,
    extraAuthParams: {},
    callbackMethod: "GET",
    extractId: (i) =>
      typeof i.id === "number" || typeof i.id === "string"
        ? String(i.id)
        : null,
    extractEmail: (i) => (typeof i.email === "string" ? i.email : null),
    extractName: (i) =>
      typeof i.name === "string"
        ? i.name
        : typeof i.login === "string"
          ? (i.login as string)
          : null,
    extractImage: (i) =>
      typeof i.avatar_url === "string" ? (i.avatar_url as string) : null,
    extractEmailVerified: () => true,
  },
  facebook: {
    authUrl: () => "https://www.facebook.com/v18.0/dialog/oauth",
    tokenUrl: () => "https://graph.facebook.com/v18.0/oauth/access_token",
    userinfoUrl:
      "https://graph.facebook.com/me?fields=id,name,email,picture.type(large)",
    scope: "email public_profile",
    pkce: false,
    extraAuthParams: {},
    callbackMethod: "GET",
    extractId: (i) => (typeof i.id === "string" ? i.id : null),
    extractEmail: (i) => (typeof i.email === "string" ? i.email : null),
    extractName: (i) => (typeof i.name === "string" ? i.name : null),
    extractImage: (i) => {
      const pic = i.picture as { data?: { url?: string } } | undefined
      return pic?.data?.url ?? null
    },
    extractEmailVerified: () => true,
  },
  microsoft: {
    authUrl: (project) => {
      const tenant = project.socialProviders?.microsoft?.tenant ?? "common"
      return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`
    },
    tokenUrl: (project) => {
      const tenant = project.socialProviders?.microsoft?.tenant ?? "common"
      return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`
    },
    userinfoUrl: "https://graph.microsoft.com/v1.0/me",
    scope: "openid email profile User.Read offline_access",
    pkce: false,
    extraAuthParams: { response_mode: "query" },
    callbackMethod: "GET",
    extractId: (i) => (typeof i.id === "string" ? i.id : null),
    extractEmail: (i) =>
      typeof i.mail === "string"
        ? i.mail
        : typeof i.userPrincipalName === "string"
          ? (i.userPrincipalName as string)
          : null,
    extractName: (i) =>
      typeof i.displayName === "string" ? (i.displayName as string) : null,
    extractImage: () => null,
    extractEmailVerified: () => true,
  },
  twitter: {
    authUrl: () => "https://twitter.com/i/oauth2/authorize",
    tokenUrl: () => "https://api.twitter.com/2/oauth2/token",
    userinfoUrl:
      "https://api.twitter.com/2/users/me?user.fields=name,profile_image_url,username",
    scope: "tweet.read users.read",
    pkce: true,
    extraAuthParams: {},
    callbackMethod: "GET",
    extractId: (i) => {
      const data = i.data as { id?: string } | undefined
      return data?.id ?? null
    },
    extractEmail: () => null, // X email standart OAuth scope'unda yok
    extractName: (i) => {
      const data = i.data as { name?: string; username?: string } | undefined
      return data?.name ?? data?.username ?? null
    },
    extractImage: (i) => {
      const data = i.data as { profile_image_url?: string } | undefined
      return data?.profile_image_url ?? null
    },
    extractEmailVerified: () => false, // placeholder email — verified değil
  },
  apple: {
    authUrl: () => "https://appleid.apple.com/auth/authorize",
    tokenUrl: () => "https://appleid.apple.com/auth/token",
    userinfoUrl: null, // id_token decode
    scope: "name email",
    pkce: false,
    extraAuthParams: { response_mode: "form_post" },
    callbackMethod: "POST",
    useIdToken: true,
    extractId: () => null, // id_token decode helper'da alınır (decodeAppleIdToken)
    extractEmail: () => null,
    extractName: () => null,
    extractImage: () => null,
    extractEmailVerified: () => true,
  },
}

const VALID_PROVIDERS: SocialProvider[] = [
  "google",
  "github",
  "facebook",
  "microsoft",
  "twitter",
  "apple",
]

function isProvider(s: string): s is SocialProvider {
  return (VALID_PROVIDERS as readonly string[]).includes(s)
}

interface ResolvedProviderCfg {
  clientId: string
  /** Standart OAuth client_secret VEYA Apple JWT client_secret (runtime
   *  imzalı). Token exchange için tek alanda. */
  clientSecret: string
}

function getProviderConfig(
  project: AuthProject,
  provider: SocialProvider,
): ResolvedProviderCfg | null {
  if (provider === "apple") {
    const cfg = project.socialProviders?.apple
    if (
      !cfg ||
      !cfg.enabled ||
      !cfg.clientId ||
      !cfg.teamId ||
      !cfg.keyId ||
      !cfg.privateKeyEncrypted
    ) {
      return null
    }
    try {
      const pem = decryptValue(cfg.privateKeyEncrypted)
      const clientSecret = buildAppleClientSecret({
        teamId: cfg.teamId,
        keyId: cfg.keyId,
        serviceId: cfg.clientId,
        privateKeyPem: pem,
      })
      return { clientId: cfg.clientId, clientSecret }
    } catch {
      return null
    }
  }
  const cfg = project.socialProviders?.[provider]
  if (!cfg || !cfg.enabled || !cfg.clientId || !cfg.clientSecretEncrypted) {
    return null
  }
  try {
    return {
      clientId: cfg.clientId,
      clientSecret: decryptValue(cfg.clientSecretEncrypted),
    }
  } catch {
    return null
  }
}

function callbackUri(projectSlug: string, provider: SocialProvider): string {
  const base = (
    process.env.NEXT_PUBLIC_AUTH_APP_URL?.replace(/\/$/, "") ??
    "https://auth.sentroy.com"
  )
  return `${base}/api/v1/auth/${projectSlug}/social/${provider}/callback`
}

function extractIp(request: NextRequest): string | null {
  return (
    request.headers.get("cf-connecting-ip")?.trim() ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  )
}

// ─── GET /social/[provider]/authorize ─────────────────────────────────────

function generatePkceVerifier(): string {
  return randomBytes(32).toString("base64url")
}

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url")
}

export async function socialAuthorizeGet(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ projectSlug: string; provider: string }> },
) {
  const { projectSlug, provider } = await params
  if (!isProvider(provider)) {
    return jsonError("invalid_request", "Unknown provider.", 400, [])
  }
  const project = await authProjectModel.findBySlug(projectSlug)
  if (!project || !project.enabled) {
    return jsonError("invalid_request", "Unknown project.", 404, [])
  }
  const cfg = getProviderConfig(project, provider)
  if (!cfg) {
    return jsonError(
      "feature_disabled",
      `${provider} is not configured for this project.`,
      400,
      [],
    )
  }

  const url = new URL(request.url)
  const redirectUri = url.searchParams.get("redirectUri")?.trim() ?? null
  const rememberMe = url.searchParams.get("rememberMe") === "1"

  const def = PROVIDER_DEFS[provider]
  const verifier = def.pkce ? generatePkceVerifier() : null

  const { token: stateToken } = await authProjectTokenModel.create({
    authProjectId: project.id,
    userId: "social-state",
    purpose: "social-state",
    payload: {
      provider,
      redirectUri,
      rememberMe,
      ...(verifier ? { pkceVerifier: verifier } : {}),
    },
  })

  const authUrl = new URL(def.authUrl(project))
  authUrl.searchParams.set("client_id", cfg.clientId)
  authUrl.searchParams.set("redirect_uri", callbackUri(project.slug, provider))
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("scope", def.scope)
  authUrl.searchParams.set("state", stateToken)
  for (const [k, v] of Object.entries(def.extraAuthParams)) {
    authUrl.searchParams.set(k, v)
  }
  if (verifier) {
    authUrl.searchParams.set("code_challenge", pkceChallenge(verifier))
    authUrl.searchParams.set("code_challenge_method", "S256")
  }
  return NextResponse.redirect(authUrl.toString(), 302)
}

// ─── GET /social/[provider]/callback ──────────────────────────────────────

export async function socialCallbackGet(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ projectSlug: string; provider: string }> },
) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const stateRaw = url.searchParams.get("state")
  return handleSocialCallback(request, params, {
    code,
    stateRaw,
    appleUserPayload: null,
  })
}

/**
 * Apple form_post handler — Apple `response_mode=form_post` ile callback'i
 * POST application/x-www-form-urlencoded olarak gönderir. body'den code +
 * state + opsiyonel `user` JSON (sadece ilk auth'ta isim verisi) parse.
 */
export async function socialCallbackPost(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ projectSlug: string; provider: string }> },
) {
  let code: string | null = null
  let stateRaw: string | null = null
  let appleUserPayload: { name?: { firstName?: string; lastName?: string }; email?: string } | null = null
  try {
    const form = await request.formData()
    code = form.get("code") as string | null
    stateRaw = form.get("state") as string | null
    const userRaw = form.get("user")
    if (typeof userRaw === "string" && userRaw) {
      try {
        appleUserPayload = JSON.parse(userRaw)
      } catch {
        appleUserPayload = null
      }
    }
  } catch {
    return jsonError("invalid_request", "Invalid form data.", 400, [])
  }
  return handleSocialCallback(request, params, {
    code,
    stateRaw,
    appleUserPayload,
  })
}

interface CallbackInput {
  code: string | null
  stateRaw: string | null
  appleUserPayload: { name?: { firstName?: string; lastName?: string }; email?: string } | null
}

async function handleSocialCallback(
  request: NextRequest,
  paramsPromise: Promise<{ projectSlug: string; provider: string }>,
  input: CallbackInput,
) {
  const { projectSlug, provider } = await paramsPromise
  if (!isProvider(provider)) {
    return jsonError("invalid_request", "Unknown provider.", 400, [])
  }
  const project = await authProjectModel.findBySlug(projectSlug)
  if (!project || !project.enabled) {
    return jsonError("invalid_request", "Unknown project.", 404, [])
  }
  const cfg = getProviderConfig(project, provider)
  if (!cfg) {
    return jsonError("feature_disabled", "Provider misconfigured.", 400, [])
  }

  const { code, stateRaw, appleUserPayload } = input
  if (!code || !stateRaw) {
    return jsonError("invalid_request", "code + state required.", 400, [])
  }

  const stateConsume = await authProjectTokenModel.consume(
    stateRaw,
    "social-state",
  )
  if (!stateConsume.ok) {
    return jsonError("invalid_grant", `State ${stateConsume.reason}.`, 400, [])
  }
  const statePayload = stateConsume.token.payload as
    | {
        provider?: SocialProvider
        redirectUri?: string | null
        rememberMe?: boolean
        pkceVerifier?: string
      }
    | null
  if (statePayload?.provider !== provider) {
    return jsonError("invalid_grant", "State provider mismatch.", 400, [])
  }
  if (stateConsume.token.authProjectId !== project.id) {
    return jsonError("invalid_grant", "State project mismatch.", 400, [])
  }

  // Code exchange — provider-aware (PKCE for X, basic auth header for X too).
  const def = PROVIDER_DEFS[provider]
  let tokenJson: Record<string, unknown>
  try {
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUri(project.slug, provider),
      client_id: cfg.clientId,
    })
    // PKCE verifier (X/Twitter)
    if (statePayload.pkceVerifier) {
      tokenBody.set("code_verifier", statePayload.pkceVerifier)
    }
    const tokenHeaders: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    }
    // X token endpoint Basic auth ister (client_id:secret base64) — body'de
    // de göndermek opsiyonel ama her ikisini sağlamak daha kararlı.
    if (provider === "twitter") {
      tokenHeaders.Authorization = `Basic ${Buffer.from(
        `${cfg.clientId}:${cfg.clientSecret}`,
      ).toString("base64")}`
    } else {
      tokenBody.set("client_secret", cfg.clientSecret)
    }
    const tokenRes = await fetch(def.tokenUrl(project), {
      method: "POST",
      headers: tokenHeaders,
      body: tokenBody.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })
    if (!tokenRes.ok) {
      const txt = await tokenRes.text().catch(() => "")
      return jsonError(
        "invalid_grant",
        `Token exchange ${tokenRes.status}: ${txt.slice(0, 200)}`,
        400,
        [],
      )
    }
    tokenJson = (await tokenRes.json()) as Record<string, unknown>
  } catch (err) {
    return jsonError(
      "server_error",
      err instanceof Error ? err.message.slice(0, 200) : "exchange failed",
      500,
      [],
    )
  }

  const accessToken = tokenJson.access_token
  if (typeof accessToken !== "string") {
    return jsonError("invalid_grant", "No access_token in response.", 400, [])
  }

  let externalId: string | null = null
  let email: string | null = null
  let displayName: string | null = null
  let verified = false

  // Apple: id_token decode (userinfo endpoint yok)
  if (def.useIdToken) {
    const idTokenRaw = tokenJson.id_token
    if (typeof idTokenRaw !== "string") {
      return jsonError("invalid_grant", "Apple id_token missing.", 400, [])
    }
    const decoded = decodeAppleIdToken(idTokenRaw)
    if (!decoded) {
      return jsonError("invalid_grant", "Apple id_token invalid.", 400, [])
    }
    externalId = decoded.sub
    email = decoded.email ?? appleUserPayload?.email ?? null
    verified = decoded.emailVerified
    if (appleUserPayload?.name) {
      const parts = [
        appleUserPayload.name.firstName,
        appleUserPayload.name.lastName,
      ].filter((s): s is string => Boolean(s && s.trim()))
      if (parts.length > 0) displayName = parts.join(" ")
    }
  } else if (def.userinfoUrl) {
    // Standart OAuth userinfo fetch
    let info: Record<string, unknown>
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "User-Agent": "sentroy-auth/1.0",
      }
      const infoRes = await fetch(def.userinfoUrl, {
        method: "GET",
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      })
      if (!infoRes.ok) {
        const txt = await infoRes.text().catch(() => "")
        return jsonError(
          "server_error",
          `userinfo ${infoRes.status}: ${txt.slice(0, 200)}`,
          500,
          [],
        )
      }
      info = (await infoRes.json()) as Record<string, unknown>
    } catch (err) {
      return jsonError(
        "server_error",
        err instanceof Error ? err.message.slice(0, 200) : "userinfo failed",
        500,
        [],
      )
    }

    externalId = def.extractId(info)
    email = def.extractEmail(info)
    displayName = def.extractName(info)
    verified = def.extractEmailVerified(info)

    // GitHub: primary email ayrı endpoint'te. Email null geliyorsa /user/emails çek.
    if (provider === "github" && !email) {
      try {
        const emailsRes = await fetch("https://api.github.com/user/emails", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
            "User-Agent": "sentroy-auth/1.0",
          },
        })
        if (emailsRes.ok) {
          const emails = (await emailsRes.json()) as Array<{
            email: string
            primary: boolean
            verified: boolean
          }>
          const primary =
            emails.find((e) => e.primary && e.verified) ?? emails[0]
          email = primary?.email ?? null
        }
      } catch {
        // ignore
      }
    }

    // X (Twitter): standart OAuth email scope vermez. Placeholder email
    // üret — username@x.local. Kullanıcı /me/email/change-request ile
    // kendi gerçek email'ini ekleyebilir.
    if (provider === "twitter" && !email) {
      const data = info.data as { username?: string } | undefined
      const username = data?.username ?? externalId
      if (username) {
        email = `${username}@x.local`
        verified = false
      }
    }
  }

  if (!externalId) {
    return jsonError("invalid_grant", "Provider id missing.", 400, [])
  }

  // User resolve:
  // 1. external link var mı?
  let user: AuthProjectUser | null = null
  const link = await authProjectUserExternalModel.findByExternal(
    project.id,
    provider,
    externalId,
  )
  if (link) {
    user = await authProjectUserModel.findById(link.userId)
  }
  // 2. email match — mevcut user'la link
  if (!user && email) {
    const existing = await authProjectUserModel.findByEmail(project.id, email)
    if (existing) {
      user = existing
      await authProjectUserExternalModel.create({
        authProjectId: project.id,
        userId: existing.id,
        provider,
        externalId,
        externalEmail: email,
      })
    }
  }
  // 3. Yeni user create — emailVerified provider-trust
  if (!user) {
    if (!email) {
      return jsonError(
        "invalid_grant",
        "Provider did not return an email; cannot link account.",
        400,
        [],
      )
    }
    // MAU check
    const userCount = await authProjectUserModel.countByProject(project.id)
    if (userCount >= project.maxMau) {
      return jsonError(
        "quota_exceeded",
        `User pool reached plan limit (${project.maxMau}).`,
        402,
        [],
      )
    }
    // Random tmp password (kullanıcı social only kalır; password-reset
    // ile kendisi belirleyebilir).
    const { hashPassword } = await import(
      "@workspace/console/lib/auth-project-password"
    )
    const tmpPassword = `social_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
    user = await authProjectUserModel.create({
      authProjectId: project.id,
      email,
      passwordHash: hashPassword(tmpPassword),
      displayName,
      emailVerified: verified,
      metadata: {},
    })
    await authProjectUserExternalModel.create({
      authProjectId: project.id,
      userId: user.id,
      provider,
      externalId,
      externalEmail: email,
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
        },
        via: provider,
        projectSlug: project.slug,
      },
      { userId: user.id },
    )
  }

  await authProjectUserModel.recordLoginSuccess(user.id, extractIp(request))
  await audit({
    userId: user.id,
    companyId: project.companyId,
    action: "auth-project.user.login",
    resource: "auth-project-user",
    resourceId: user.id,
    details: { projectSlug: project.slug, via: provider },
    ipAddress: extractIp(request) ?? undefined,
  })
  dispatchAuthWebhook(
    project.id,
    "user.login",
    {
      user: { id: user.id, email: user.email },
      via: provider,
      ipAddress: extractIp(request),
      userAgent: request.headers.get("user-agent"),
      projectSlug: project.slug,
    },
    { userId: user.id },
  )

  const rememberMe = statePayload?.rememberMe === true
  const REMEMBER_MS = 90 * 24 * 60 * 60 * 1000
  const { token: refreshToken } = await authProjectSessionModel.create({
    authProjectId: project.id,
    userId: user.id,
    userAgent: request.headers.get("user-agent"),
    ip: extractIp(request),
    ttlMs: rememberMe ? REMEMBER_MS : undefined,
  })
  const now = Math.floor(Date.now() / 1000)
  const idTokenClaims: AuthProjectIdTokenClaims = {
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
  const accessJwt = signProjectIdToken(project, idTokenClaims)

  // RP'ye yönlendir — redirectUri varsa fragment ile token'ları geçir.
  const redirectUri = statePayload?.redirectUri ?? null
  if (redirectUri) {
    const target = new URL(redirectUri)
    target.hash = new URLSearchParams({
      access_token: accessJwt,
      refresh_token: refreshToken,
      token_type: "Bearer",
      expires_in: String(ACCESS_TOKEN_TTL_SECONDS),
    }).toString()
    return NextResponse.redirect(target.toString(), 302)
  }

  // Fallback: JSON response (RP redirectUri vermediyse).
  return jsonOk({
    data: {
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        displayName: user.displayName,
        image: user.image,
      },
      accessToken: accessJwt,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      tokenType: "Bearer",
    },
  })
}
