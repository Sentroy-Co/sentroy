import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyOwnerOrAdmin } from "@workspace/console/lib/company-access"
import { oauthClientModel } from "@workspace/db/models"
import {
  ALLOWED_SCOPES,
  type OAuthScope,
} from "@workspace/db/models/oauth-client"
import { audit } from "@workspace/console/lib/audit"

/**
 * OAuth Client CRUD handler'ları — Sentroy Auth "Sign in with Sentroy"
 * provider için per-company client kayıtları.
 *
 * Bu dosya **app-agnostic**: hem `apps/core` hem `apps/auth2` route'larından
 * import ediliyor. Next.js convention'ı gereği route.ts dosyaları `GET`,
 * `POST` vs. adlı export bekliyor — route shim'leri bu modülün adlandırılmış
 * fonksiyonlarını `export { listGet as GET } from ...` pattern'iyle re-export
 * eder.
 *
 * Auth: `assertCompanyOwnerOrAdmin` (owner / admin company member).
 * Cross-subdomain better-auth cookie sayesinde aynı session her iki app'te
 * geçerli.
 */

function isHttpsUrl(s: string): boolean {
  try {
    const u = new URL(s)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

function safe(client: Awaited<ReturnType<typeof oauthClientModel.findById>>) {
  if (!client) return null
  const { clientSecretHash: _drop, ...rest } = client
  return rest
}

async function loadOwned(id: string, companyId: string) {
  const c = await oauthClientModel.findById(id)
  if (!c || c.companyId !== companyId) return null
  return c
}

// ─── Collection routes: /api/companies/[slug]/oauth-clients ──────────────

export async function listGet(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const auth = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in auth) return auth.error

  const clients = await oauthClientModel.findByCompany(auth.companyId!)
  return jsonSuccess(clients.map((c) => safe(c)))
}

export async function createPost(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const auth = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in auth) return auth.error

  let body: {
    name?: string
    description?: string | null
    redirectUris?: string[]
    allowedScopes?: string[]
    homepageUrl?: string | null
    logoUrl?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const name = (body.name ?? "").trim()
  if (!name) return jsonError("name required")

  const redirectUris = Array.isArray(body.redirectUris) ? body.redirectUris : []
  if (redirectUris.length === 0) {
    return jsonError("at least one redirect_uri required")
  }
  for (const u of redirectUris) {
    if (typeof u !== "string" || !isHttpsUrl(u)) {
      return jsonError(`redirect_uri "${u}" must be a valid http(s) URL`)
    }
  }

  const allowedScopes: OAuthScope[] = []
  const requestedScopes =
    Array.isArray(body.allowedScopes) && body.allowedScopes.length > 0
      ? body.allowedScopes
      : ["openid", "profile", "email"]
  for (const s of requestedScopes) {
    if (typeof s !== "string" || !ALLOWED_SCOPES.has(s as OAuthScope)) {
      return jsonError(`scope "${s}" is not supported`)
    }
    if (!allowedScopes.includes(s as OAuthScope)) {
      allowedScopes.push(s as OAuthScope)
    }
  }
  if (!allowedScopes.includes("openid")) allowedScopes.unshift("openid")

  if (body.homepageUrl && !isHttpsUrl(body.homepageUrl)) {
    return jsonError("homepageUrl must be a valid http(s) URL")
  }
  if (body.logoUrl && !isHttpsUrl(body.logoUrl)) {
    return jsonError("logoUrl must be a valid http(s) URL")
  }

  const { client, plainSecret } = await oauthClientModel.create({
    name,
    description: body.description ?? null,
    redirectUris,
    allowedScopes,
    homepageUrl: body.homepageUrl ?? null,
    logoUrl: body.logoUrl ?? null,
    companyId: auth.companyId!,
    createdBy: auth.session!.user.id,
  })

  await audit({
    userId: auth.session!.user.id,
    companyId: auth.companyId!,
    action: "oauth-client.create",
    resource: "oauth-client",
    resourceId: client.id,
    details: { name: client.name, clientId: client.clientId },
  })

  return jsonSuccess({ ...safe(client), clientSecret: plainSecret }, 201)
}

// ─── Item routes: /api/companies/[slug]/oauth-clients/[id] ───────────────

export async function itemGet(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const auth = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in auth) return auth.error

  const client = await loadOwned(id, auth.companyId!)
  if (!client) return jsonError("client not found", 404)
  return jsonSuccess(safe(client))
}

export async function itemPatch(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const auth = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in auth) return auth.error

  const client = await loadOwned(id, auth.companyId!)
  if (!client) return jsonError("client not found", 404)

  // Secret rotation — query param flag
  if (request.nextUrl.searchParams.get("action") === "rotate-secret") {
    const result = await oauthClientModel.rotateSecret(id)
    if (!result) return jsonError("rotate failed", 500)
    await audit({
      userId: auth.session!.user.id,
      companyId: auth.companyId!,
      action: "oauth-client.rotate-secret",
      resource: "oauth-client",
      resourceId: id,
    })
    return jsonSuccess({
      ...safe(result.client),
      clientSecret: result.plainSecret,
    })
  }

  let body: {
    name?: string
    description?: string | null
    redirectUris?: string[]
    allowedScopes?: string[]
    homepageUrl?: string | null
    logoUrl?: string | null
    enabled?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.name === "string") patch.name = body.name.trim()
  if (typeof body.description === "string" || body.description === null) {
    patch.description = body.description
  }
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled

  if (Array.isArray(body.redirectUris)) {
    if (body.redirectUris.length === 0) {
      return jsonError("at least one redirect_uri required")
    }
    for (const u of body.redirectUris) {
      if (typeof u !== "string" || !isHttpsUrl(u)) {
        return jsonError(`redirect_uri "${u}" must be a valid http(s) URL`)
      }
    }
    patch.redirectUris = body.redirectUris
  }

  if (Array.isArray(body.allowedScopes)) {
    const scopes: OAuthScope[] = []
    for (const s of body.allowedScopes) {
      if (typeof s !== "string" || !ALLOWED_SCOPES.has(s as OAuthScope)) {
        return jsonError(`scope "${s}" not supported`)
      }
      if (!scopes.includes(s as OAuthScope)) scopes.push(s as OAuthScope)
    }
    if (!scopes.includes("openid")) scopes.unshift("openid")
    patch.allowedScopes = scopes
  }

  if (body.homepageUrl !== undefined) {
    if (body.homepageUrl !== null && !isHttpsUrl(body.homepageUrl)) {
      return jsonError("homepageUrl must be a valid http(s) URL")
    }
    patch.homepageUrl = body.homepageUrl
  }
  if (body.logoUrl !== undefined) {
    if (body.logoUrl !== null && !isHttpsUrl(body.logoUrl)) {
      return jsonError("logoUrl must be a valid http(s) URL")
    }
    patch.logoUrl = body.logoUrl
  }

  const updated = await oauthClientModel.update(id, patch as never)
  if (!updated) return jsonError("update failed", 500)
  await audit({
    userId: auth.session!.user.id,
    companyId: auth.companyId!,
    action: "oauth-client.update",
    resource: "oauth-client",
    resourceId: id,
    details: { fields: Object.keys(patch) },
  })
  return jsonSuccess(safe(updated))
}

export async function itemDelete(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const auth = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in auth) return auth.error

  const client = await loadOwned(id, auth.companyId!)
  if (!client) return jsonError("client not found", 404)

  const ok = await oauthClientModel.remove(id)
  if (!ok) return jsonError("delete failed", 500)
  await audit({
    userId: auth.session!.user.id,
    companyId: auth.companyId!,
    action: "oauth-client.delete",
    resource: "oauth-client",
    resourceId: id,
    details: { name: client.name, clientId: client.clientId },
  })
  return jsonSuccess({ ok: true })
}
