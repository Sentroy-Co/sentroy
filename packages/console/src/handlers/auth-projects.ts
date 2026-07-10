import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import {
  authProjectModel,
  authProjectUserModel,
  authProjectSessionModel,
} from "@workspace/db/models"
import { audit } from "@workspace/console/lib/audit"

/**
 * Auth Project management — dashboard backend.
 *
 * Tüm endpoint'ler `assertCompanyAccess(..., "auth-projects.manage")`
 * ile korunur — owner/admin default; member granular permission ile
 * erişebilir. Public auth API'leri (signup/login) ayrı pattern
 * (`auth-project-public.ts`) ve `Authorization: Bearer aps_...`
 * kullanır.
 */

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// ─── List + Create ─────────────────────────────────────────────────────────

export async function listGet(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(
    request,
    slug,
    "auth-projects.manage",
  )
  if ("error" in access) return access.error

  const projects = await authProjectModel.findByCompany(access.companyId)
  return jsonSuccess(projects)
}

export async function createPost(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(
    request,
    slug,
    "auth-projects.manage",
  )
  if ("error" in access) return access.error

  let body: {
    name?: string
    slug?: string
    emailVerificationRequired?: boolean
    magicLinkEnabled?: boolean
    allowedOrigins?: string[]
    branding?: {
      displayName?: string
      primaryColor?: string | null
      logoUrl?: string | null
    }
    passwordPolicy?: {
      minLength?: number
      requireUppercase?: boolean
      requireNumber?: boolean
    }
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const name = (body.name ?? "").trim()
  if (!name) return jsonError("name required")

  const desiredSlug = (body.slug ?? "").trim().toLowerCase()
  if (!desiredSlug || !SLUG_REGEX.test(desiredSlug)) {
    return jsonError(
      "slug must be lowercase letters, digits and hyphens (e.g. my-app).",
    )
  }
  const existing = await authProjectModel.findBySlug(desiredSlug)
  if (existing) {
    return jsonError("slug already in use", 409)
  }

  if (
    body.allowedOrigins &&
    !body.allowedOrigins.every((o) => typeof o === "string")
  ) {
    return jsonError("allowedOrigins must be string[]")
  }

  const result = await authProjectModel.create({
    companyId: access.companyId,
    name,
    slug: desiredSlug,
    emailVerificationRequired: body.emailVerificationRequired ?? true,
    magicLinkEnabled: body.magicLinkEnabled ?? false,
    allowedOrigins: body.allowedOrigins ?? [],
    branding: body.branding,
    passwordPolicy: body.passwordPolicy
      ? {
          minLength: body.passwordPolicy.minLength,
          requireUppercase: body.passwordPolicy.requireUppercase,
          requireNumber: body.passwordPolicy.requireNumber,
        }
      : undefined,
    createdBy: access.session!.user.id,
  })

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "auth-project.create",
    resource: "auth-project",
    resourceId: result.project.id,
    details: { slug: result.project.slug, name: result.project.name },
  })

  // Plaintext API key tek seferlik döner — caller bunu kopyalat zorunlu.
  return jsonSuccess(
    {
      ...(await authProjectModel.publish(result.project)),
      apiKey: result.plainApiKey,
    },
    201,
  )
}

// ─── Item ──────────────────────────────────────────────────────────────────

async function loadOwned(id: string, companyId: string) {
  const p = await authProjectModel.findById(id)
  if (!p || p.companyId !== companyId) return null
  return p
}

export async function itemGet(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const access = await assertCompanyAccess(
    request,
    slug,
    "auth-projects.manage",
  )
  if ("error" in access) return access.error

  const p = await loadOwned(id, access.companyId)
  if (!p) return jsonError("project not found", 404)
  // Stats — user count + active session count
  const userCount = await authProjectUserModel.countByProject(p.id)
  return jsonSuccess({
    ...(await authProjectModel.publish(p)),
    stats: { users: userCount },
  })
}

export async function itemPatch(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const access = await assertCompanyAccess(
    request,
    slug,
    "auth-projects.manage",
  )
  if ("error" in access) return access.error

  const p = await loadOwned(id, access.companyId)
  if (!p) return jsonError("project not found", 404)

  // Rotate API key — destructive op, ayrı flag.
  if (request.nextUrl.searchParams.get("action") === "rotate-api-key") {
    const result = await authProjectModel.rotateApiKey(id)
    if (!result) return jsonError("rotate failed", 500)
    await audit({
      userId: access.session!.user.id,
      companyId: access.companyId,
      action: "auth-project.rotate-api-key",
      resource: "auth-project",
      resourceId: id,
    })
    return jsonSuccess({
      ...(await authProjectModel.publish(result.project)),
      apiKey: result.plainApiKey,
    })
  }

  // Rotate JWT signing key — eski key grace slot'a düşer, yeni JWT'ler
  // yeni key ile imzalanır. RP'lerin cache'lenmiş JWKS'leri verify
  // edebilsin diye eski key publish edilmeye devam eder; grace bitince
  // `?action=clear-previous-jwt-key` ile temizlenir.
  if (request.nextUrl.searchParams.get("action") === "rotate-jwt-key") {
    const rotated = await authProjectModel.rotateJwtKey(id)
    if (!rotated) return jsonError("rotate failed", 500)
    await audit({
      userId: access.session!.user.id,
      companyId: access.companyId,
      action: "auth-project.rotate-jwt-key",
      resource: "auth-project",
      resourceId: id,
      details: { rotatedAt: rotated.previousRotatedAt?.toISOString() ?? null },
    })
    return jsonSuccess(await authProjectModel.publish(rotated))
  }

  if (
    request.nextUrl.searchParams.get("action") === "clear-previous-jwt-key"
  ) {
    if (!p.previousRsaPublicJwk) {
      return jsonError("no previous key to clear", 400)
    }
    const cleared = await authProjectModel.clearPreviousJwtKey(id)
    if (!cleared) return jsonError("clear failed", 500)
    await audit({
      userId: access.session!.user.id,
      companyId: access.companyId,
      action: "auth-project.clear-previous-jwt-key",
      resource: "auth-project",
      resourceId: id,
    })
    return jsonSuccess(await authProjectModel.publish(cleared))
  }

  let body: {
    name?: string
    branding?: {
      displayName?: string
      primaryColor?: string | null
      logoUrl?: string | null
    }
    emailVerificationRequired?: boolean
    magicLinkEnabled?: boolean
    passwordPolicy?: {
      minLength?: number
      requireUppercase?: boolean
      requireNumber?: boolean
    }
    allowedOrigins?: string[]
    enabled?: boolean
    customClaims?: {
      fromMetadata?: string[]
      staticClaims?: Record<string, string | number | boolean>
    }
    socialProviders?: {
      google?: { enabled?: boolean; clientId?: string; clientSecret?: string | null }
      github?: { enabled?: boolean; clientId?: string; clientSecret?: string | null }
      facebook?: { enabled?: boolean; clientId?: string; clientSecret?: string | null }
      microsoft?: {
        enabled?: boolean
        clientId?: string
        clientSecret?: string | null
        tenant?: string
      }
      twitter?: { enabled?: boolean; clientId?: string; clientSecret?: string | null }
      apple?: {
        enabled?: boolean
        clientId?: string
        teamId?: string
        keyId?: string
        privateKey?: string | null
      }
    }
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.name === "string") patch.name = body.name.trim()
  if (body.branding) {
    patch.branding = {
      ...p.branding,
      ...body.branding,
    }
  }
  if (typeof body.emailVerificationRequired === "boolean") {
    patch.emailVerificationRequired = body.emailVerificationRequired
  }
  if (typeof body.magicLinkEnabled === "boolean") {
    patch.magicLinkEnabled = body.magicLinkEnabled
  }
  if (body.passwordPolicy) {
    patch.passwordPolicy = {
      ...p.passwordPolicy,
      ...body.passwordPolicy,
    }
  }
  if (Array.isArray(body.allowedOrigins)) {
    for (const o of body.allowedOrigins) {
      if (typeof o !== "string") {
        return jsonError("allowedOrigins entries must be strings")
      }
    }
    patch.allowedOrigins = body.allowedOrigins
  }
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled

  // Custom JWT claims — fromMetadata + staticClaims (reserved claim'leri
  // RUNTIME tarafında filter ediliyor; burada şekilsel validation yeterli).
  if (body.customClaims) {
    const fromMetadata = Array.isArray(body.customClaims.fromMetadata)
      ? body.customClaims.fromMetadata.filter(
          (k): k is string => typeof k === "string" && k.length > 0,
        )
      : (p.customClaims?.fromMetadata ?? [])
    const staticClaims: Record<string, string | number | boolean> = {}
    if (body.customClaims.staticClaims) {
      for (const [k, v] of Object.entries(body.customClaims.staticClaims)) {
        if (
          typeof v === "string" ||
          typeof v === "number" ||
          typeof v === "boolean"
        ) {
          staticClaims[k] = v
        }
      }
    } else {
      Object.assign(staticClaims, p.customClaims?.staticClaims ?? {})
    }
    patch.customClaims = { fromMetadata, staticClaims }
  }

  // Social providers — clientSecret plaintext gelir, encrypt edip sakla.
  // Boş string veya null gelirse provider disabled + cleared.
  if (body.socialProviders) {
    const { encryptValue } = await import(
      "@workspace/console/lib/env-vault-crypto"
    )
    const current = p.socialProviders ?? {}
    const next: typeof current = { ...current }

    // 4 standart provider (google/github/facebook/twitter): clientId +
    // clientSecret pair.
    for (const key of ["google", "github", "facebook", "twitter"] as const) {
      const incoming = body.socialProviders[key]
      if (!incoming) continue
      const existing = current[key]
      const clientId =
        typeof incoming.clientId === "string" ? incoming.clientId : existing?.clientId
      const enabled =
        typeof incoming.enabled === "boolean" ? incoming.enabled : existing?.enabled ?? false
      let clientSecretEncrypted = existing?.clientSecretEncrypted ?? ""
      if (typeof incoming.clientSecret === "string" && incoming.clientSecret.length > 0) {
        clientSecretEncrypted = encryptValue(incoming.clientSecret)
      }
      if (!clientId || !clientSecretEncrypted) {
        delete next[key]
      } else {
        next[key] = {
          enabled: enabled === true,
          clientId,
          clientSecretEncrypted,
        }
      }
    }

    // Microsoft — ek olarak tenant field
    if (body.socialProviders.microsoft) {
      const incoming = body.socialProviders.microsoft
      const existing = current.microsoft
      const clientId =
        typeof incoming.clientId === "string" ? incoming.clientId : existing?.clientId
      const enabled =
        typeof incoming.enabled === "boolean"
          ? incoming.enabled
          : existing?.enabled ?? false
      let clientSecretEncrypted = existing?.clientSecretEncrypted ?? ""
      if (
        typeof incoming.clientSecret === "string" &&
        incoming.clientSecret.length > 0
      ) {
        clientSecretEncrypted = encryptValue(incoming.clientSecret)
      }
      const tenant =
        typeof incoming.tenant === "string" && incoming.tenant.trim()
          ? incoming.tenant.trim()
          : existing?.tenant
      if (!clientId || !clientSecretEncrypted) {
        delete next.microsoft
      } else {
        next.microsoft = {
          enabled: enabled === true,
          clientId,
          clientSecretEncrypted,
          ...(tenant ? { tenant } : {}),
        }
      }
    }

    // Apple — özel: teamId + keyId + p8 privateKey (PEM)
    if (body.socialProviders.apple) {
      const incoming = body.socialProviders.apple
      const existing = current.apple
      const clientId =
        typeof incoming.clientId === "string" ? incoming.clientId : existing?.clientId
      const teamId =
        typeof incoming.teamId === "string" ? incoming.teamId : existing?.teamId
      const keyId =
        typeof incoming.keyId === "string" ? incoming.keyId : existing?.keyId
      const enabled =
        typeof incoming.enabled === "boolean"
          ? incoming.enabled
          : existing?.enabled ?? false
      let privateKeyEncrypted = existing?.privateKeyEncrypted ?? ""
      if (
        typeof incoming.privateKey === "string" &&
        incoming.privateKey.length > 0
      ) {
        privateKeyEncrypted = encryptValue(incoming.privateKey)
      }
      if (!clientId || !teamId || !keyId || !privateKeyEncrypted) {
        delete next.apple
      } else {
        next.apple = {
          enabled: enabled === true,
          clientId,
          teamId,
          keyId,
          privateKeyEncrypted,
        }
      }
    }

    patch.socialProviders = next
  }

  const updated = await authProjectModel.update(id, patch as never)
  if (!updated) return jsonError("update failed", 500)

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "auth-project.update",
    resource: "auth-project",
    resourceId: id,
    details: { fields: Object.keys(patch) },
  })
  return jsonSuccess(await authProjectModel.publish(updated))
}

export async function itemDelete(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const access = await assertCompanyAccess(
    request,
    slug,
    "auth-projects.manage",
  )
  if ("error" in access) return access.error

  const p = await loadOwned(id, access.companyId)
  if (!p) return jsonError("project not found", 404)

  // Cascade: tüm user'lar, session'lar, token'lar bu projeId üzerinden
  // referans veriliyor; project silindiğinde DB'de orphan kalır. Şimdilik
  // hard delete sadece project doc'unu siler — orphan cleanup admin task'a
  // bırakılır (v2'de TTL veya cron worker).
  const ok = await authProjectModel.remove(id)
  if (!ok) return jsonError("delete failed", 500)

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "auth-project.delete",
    resource: "auth-project",
    resourceId: id,
    details: { slug: p.slug, name: p.name },
  })
  return jsonSuccess({ ok: true })
}

// ─── Users (admin) ────────────────────────────────────────────────────────

export async function usersListGet(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const access = await assertCompanyAccess(
    request,
    slug,
    "auth-projects.manage",
  )
  if ("error" in access) return access.error

  const p = await loadOwned(id, access.companyId)
  if (!p) return jsonError("project not found", 404)

  const url = request.nextUrl
  const limit = Math.min(
    Number.parseInt(url.searchParams.get("limit") ?? "50", 10),
    200,
  )
  const skip = Math.max(
    Number.parseInt(url.searchParams.get("skip") ?? "0", 10),
    0,
  )
  const verifiedParam = url.searchParams.get("emailVerified")
  const emailVerified =
    verifiedParam === "true"
      ? true
      : verifiedParam === "false"
        ? false
        : undefined

  const [users, total] = await Promise.all([
    authProjectUserModel.listByProject(p.id, { limit, skip, emailVerified }),
    authProjectUserModel.countByProject(p.id),
  ])

  return jsonSuccess({
    items: users.map((u) => ({
      id: u.id,
      email: u.email,
      emailVerified: u.emailVerified,
      displayName: u.displayName,
      image: u.image,
      lastLoginAt: u.lastLoginAt,
      lockedUntil: u.lockedUntil,
      createdAt: u.createdAt,
    })),
    pagination: { total, limit, skip },
  })
}

export async function userDelete(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ slug: string; id: string; userId: string }>
  },
) {
  const { slug, id, userId } = await params
  const access = await assertCompanyAccess(
    request,
    slug,
    "auth-projects.manage",
  )
  if ("error" in access) return access.error

  const p = await loadOwned(id, access.companyId)
  if (!p) return jsonError("project not found", 404)

  const user = await authProjectUserModel.findById(userId)
  if (!user || user.authProjectId !== p.id) {
    return jsonError("user not found", 404)
  }

  // Cascade: tüm session'ları revoke, sonra user'i sil.
  await authProjectSessionModel.revokeAllForUser(p.id, userId)
  const ok = await authProjectUserModel.remove(userId)
  if (!ok) return jsonError("delete failed", 500)

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "auth-project.user.delete",
    resource: "auth-project-user",
    resourceId: userId,
    details: { projectSlug: p.slug, email: user.email },
  })
  return jsonSuccess({ ok: true })
}

export async function userSessionsRevokePost(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ slug: string; id: string; userId: string }>
  },
) {
  const { slug, id, userId } = await params
  const access = await assertCompanyAccess(
    request,
    slug,
    "auth-projects.manage",
  )
  if ("error" in access) return access.error

  const p = await loadOwned(id, access.companyId)
  if (!p) return jsonError("project not found", 404)

  const count = await authProjectSessionModel.revokeAllForUser(p.id, userId)
  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "auth-project.user.sessions-revoke-all",
    resource: "auth-project-user",
    resourceId: userId,
    details: { projectSlug: p.slug, revoked: count },
  })
  return jsonSuccess({ revoked: count })
}
