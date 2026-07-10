import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import {
  statusPageModel,
  statusComponentModel,
  statusCheckModel,
  statusProbeEventModel,
  statusIncidentModel,
  statusMaintenanceModel,
  statusSubscriberModel,
  statusRestartTargetModel,
} from "@workspace/db/models"
import { audit } from "@workspace/console/lib/audit"

/**
 * Status Page management — dashboard backend (RP company yönetim API'si).
 *
 * Endpoint'ler `assertCompanyAccess(..., "status-page.manage")` ile
 * korunur. Bir company'ye 1 page (1:1) — `findByCompany`'ye göre yarat
 * veya güncelle.
 *
 * Public read API (Atlassian summary.json eşleniği) ayrı handler
 * (`status-page-public.ts`).
 */

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// ─── Page CRUD ─────────────────────────────────────────────────────────────

export async function pageGet(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await statusPageModel.findByCompany(access.companyId)
  if (!page) return jsonSuccess(null)

  // Stats — components + checks + active incidents counts
  const [componentsCount, checksCount, activeIncidents, activeMaintenances, subscribersCount] =
    await Promise.all([
      statusComponentModel.countByPage(page.id),
      statusCheckModel.countByPage(page.id),
      statusIncidentModel.findActiveByPage(page.id),
      statusMaintenanceModel.findActiveByPage(page.id),
      statusSubscriberModel.countActiveByPage(page.id),
    ])

  return jsonSuccess({
    ...page,
    stats: {
      components: componentsCount,
      checks: checksCount,
      activeIncidents: activeIncidents.length,
      activeMaintenances: activeMaintenances.length,
      subscribers: subscribersCount,
    },
  })
}

export async function pageCreatePost(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const existing = await statusPageModel.findByCompany(access.companyId)
  if (existing) {
    return jsonError("Status page already exists for this company", 409)
  }

  let body: {
    slug?: string
    name?: string
    branding?: Record<string, unknown>
    embedOrigins?: string[]
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const desiredSlug = (body.slug ?? "").trim().toLowerCase()
  if (!desiredSlug || !SLUG_REGEX.test(desiredSlug)) {
    return jsonError(
      "slug must be lowercase letters, digits and hyphens (e.g. acme-status).",
    )
  }
  const slugClash = await statusPageModel.findBySlug(desiredSlug)
  if (slugClash) {
    return jsonError("slug already in use", 409)
  }

  const name = (body.name ?? "").trim()
  if (!name) return jsonError("name required")

  const page = await statusPageModel.create({
    companyId: access.companyId,
    slug: desiredSlug,
    name,
    branding: body.branding as Parameters<typeof statusPageModel.create>[0]["branding"],
    embedOrigins: Array.isArray(body.embedOrigins) ? body.embedOrigins : [],
    createdBy: access.session!.user.id,
  })

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "status-page.create",
    resource: "status-page",
    resourceId: page.id,
    details: { slug: page.slug, name: page.name },
  })

  return jsonSuccess(page, 201)
}

async function loadOwned(pageId: string, companyId: string) {
  const p = await statusPageModel.findById(pageId)
  if (!p || p.companyId !== companyId) return null
  return p
}

export async function pagePatch(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await statusPageModel.findByCompany(access.companyId)
  if (!page) return jsonError("status page not found", 404)

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const patch: Parameters<typeof statusPageModel.update>[1] = {}
  if (typeof body.name === "string") patch.name = body.name.trim()
  if (body.branding && typeof body.branding === "object") {
    patch.branding = { ...page.branding, ...body.branding }
  }
  if (Array.isArray(body.embedOrigins)) {
    if (!body.embedOrigins.every((o) => typeof o === "string")) {
      return jsonError("embedOrigins entries must be strings")
    }
    patch.embedOrigins = body.embedOrigins as string[]
  }
  if (typeof body.subscribersEnabled === "boolean") {
    patch.subscribersEnabled = body.subscribersEnabled
  }
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled

  const updated = await statusPageModel.update(page.id, patch)
  if (!updated) return jsonError("update failed", 500)

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "status-page.update",
    resource: "status-page",
    resourceId: page.id,
    details: { fields: Object.keys(patch) },
  })

  return jsonSuccess(updated)
}

export async function pageDelete(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await statusPageModel.findByCompany(access.companyId)
  if (!page) return jsonError("status page not found", 404)

  // Cascade: tüm bağımlı koleksiyonları sil. Order önemli değil, tüm
  // collection'larda pageId index'i var.
  await Promise.all([
    statusCheckModel.removeByPage(page.id),
    statusComponentModel.removeByPage(page.id),
    statusProbeEventModel.removeByPage(page.id),
    statusIncidentModel.removeByPage(page.id),
    statusMaintenanceModel.removeByPage(page.id),
    statusSubscriberModel.removeByPage(page.id),
    statusRestartTargetModel.removeByPage(page.id),
  ])
  const ok = await statusPageModel.remove(page.id)
  if (!ok) return jsonError("delete failed", 500)

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "status-page.delete",
    resource: "status-page",
    resourceId: page.id,
    details: { slug: page.slug, name: page.name },
  })

  return jsonSuccess({ ok: true })
}

// ─── Components CRUD ──────────────────────────────────────────────────────

export async function componentsListGet(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await statusPageModel.findByCompany(access.companyId)
  if (!page) return jsonError("status page not found", 404)

  const components = await statusComponentModel.findByPage(page.id)
  return jsonSuccess(components)
}

export async function componentCreatePost(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await statusPageModel.findByCompany(access.companyId)
  if (!page) return jsonError("status page not found", 404)

  // Plan limit — free tier max
  const count = await statusComponentModel.countByPage(page.id)
  if (count >= page.maxComponents) {
    return jsonError(
      `Component limit reached (${page.maxComponents}). Upgrade plan to add more.`,
      402,
    )
  }

  let body: {
    name?: string
    description?: string | null
    groupKey?: string | null
    visible?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  if (typeof body.name !== "string" || !body.name.trim()) {
    return jsonError("name required")
  }

  const component = await statusComponentModel.create({
    pageId: page.id,
    name: body.name,
    description: body.description ?? null,
    groupKey: body.groupKey ?? null,
    visible: body.visible ?? true,
  })

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "status-page.component.create",
    resource: "status-component",
    resourceId: component.id,
    details: { pageSlug: page.slug, name: component.name },
  })

  return jsonSuccess(component, 201)
}

export async function componentPatch(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ slug: string; componentId: string }>
  },
) {
  const { slug, componentId } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await statusPageModel.findByCompany(access.companyId)
  if (!page) return jsonError("status page not found", 404)

  const component = await statusComponentModel.findById(componentId)
  if (!component || component.pageId !== page.id) {
    return jsonError("component not found", 404)
  }

  let body: {
    name?: string
    description?: string | null
    visible?: boolean
    groupKey?: string | null
    position?: number
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const patch: Parameters<typeof statusComponentModel.update>[1] = {}
  if (typeof body.name === "string") patch.name = body.name.trim()
  if (body.description !== undefined) patch.description = body.description
  if (typeof body.visible === "boolean") patch.visible = body.visible
  if (body.groupKey !== undefined) patch.groupKey = body.groupKey
  if (typeof body.position === "number") patch.position = body.position

  const updated = await statusComponentModel.update(componentId, patch)
  if (!updated) return jsonError("update failed", 500)

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "status-page.component.update",
    resource: "status-component",
    resourceId: componentId,
    details: { fields: Object.keys(patch) },
  })

  return jsonSuccess(updated)
}

export async function componentDelete(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ slug: string; componentId: string }>
  },
) {
  const { slug, componentId } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await statusPageModel.findByCompany(access.companyId)
  if (!page) return jsonError("status page not found", 404)

  const component = await statusComponentModel.findById(componentId)
  if (!component || component.pageId !== page.id) {
    return jsonError("component not found", 404)
  }

  // Cascade: bu component'in check'leri + onların probe history'si silinir.
  const checks = await statusCheckModel.findByComponent(componentId)
  for (const check of checks) {
    await statusProbeEventModel.removeByCheck(check.id)
  }
  await statusCheckModel.removeByComponent(componentId)
  const ok = await statusComponentModel.remove(componentId)
  if (!ok) return jsonError("delete failed", 500)

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "status-page.component.delete",
    resource: "status-component",
    resourceId: componentId,
    details: { pageSlug: page.slug, name: component.name },
  })

  return jsonSuccess({ ok: true })
}

export async function componentsReorderPost(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await statusPageModel.findByCompany(access.companyId)
  if (!page) return jsonError("status page not found", 404)

  let body: { positions?: Array<{ id: string; position: number }> }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  if (!Array.isArray(body.positions)) {
    return jsonError("positions array required")
  }

  await statusComponentModel.reorder(page.id, body.positions)
  return jsonSuccess({ ok: true })
}

// ─── Checks CRUD ──────────────────────────────────────────────────────────

export async function checksListGet(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await statusPageModel.findByCompany(access.companyId)
  if (!page) return jsonError("status page not found", 404)

  const checks = await statusCheckModel.findByPage(page.id)
  return jsonSuccess(checks)
}

export async function checkCreatePost(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await statusPageModel.findByCompany(access.companyId)
  if (!page) return jsonError("status page not found", 404)

  let body: {
    componentId?: string
    name?: string
    type?: "http" | "tcp"
    http?: { url?: string } & Record<string, unknown>
    tcp?: { host?: string; port?: number; timeoutMs?: number; degradedLatencyMs?: number }
    intervalSeconds?: number
    restartTargetId?: string | null
    restartFailureThreshold?: number
    restartCooldownSeconds?: number
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (typeof body.componentId !== "string") return jsonError("componentId required")
  const component = await statusComponentModel.findById(body.componentId)
  if (!component || component.pageId !== page.id) {
    return jsonError("component not found", 404)
  }

  if (typeof body.name !== "string" || !body.name.trim()) {
    return jsonError("name required")
  }

  const type = body.type === "tcp" ? "tcp" : "http"
  if (type === "http") {
    if (!body.http?.url || typeof body.http.url !== "string") {
      return jsonError("http.url required for HTTP check")
    }
  } else {
    if (typeof body.tcp?.host !== "string" || !body.tcp.host.trim()) {
      return jsonError("tcp.host required for TCP check")
    }
    if (typeof body.tcp.port !== "number" || body.tcp.port < 1 || body.tcp.port > 65535) {
      return jsonError("tcp.port required (1-65535)")
    }
  }

  // Plan limit
  const checksOnComponent = await statusCheckModel.countByComponent(component.id)
  if (checksOnComponent >= page.maxChecksPerComponent) {
    return jsonError(
      `Check limit per component reached (${page.maxChecksPerComponent}). Upgrade plan.`,
      402,
    )
  }

  const check = await statusCheckModel.create({
    componentId: component.id,
    pageId: page.id,
    name: body.name,
    type,
    http:
      type === "http"
        ? (body.http as Parameters<typeof statusCheckModel.create>[0]["http"])
        : undefined,
    tcp: type === "tcp" ? body.tcp : undefined,
    intervalSeconds: body.intervalSeconds,
    restartTargetId: body.restartTargetId ?? null,
    restartFailureThreshold: body.restartFailureThreshold,
    restartCooldownSeconds: body.restartCooldownSeconds,
  })

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "status-page.check.create",
    resource: "status-check",
    resourceId: check.id,
    details: { pageSlug: page.slug, componentName: component.name, name: check.name },
  })

  return jsonSuccess(check, 201)
}

export async function checkPatch(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ slug: string; checkId: string }>
  },
) {
  const { slug, checkId } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await statusPageModel.findByCompany(access.companyId)
  if (!page) return jsonError("status page not found", 404)

  const check = await statusCheckModel.findById(checkId)
  if (!check || check.pageId !== page.id) {
    return jsonError("check not found", 404)
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const patch: Parameters<typeof statusCheckModel.update>[1] = {}
  if (typeof body.name === "string") patch.name = body.name.trim()
  if (body.http && typeof body.http === "object") {
    patch.http = { ...check.http, ...(body.http as Record<string, unknown>) } as typeof check.http
  }
  if (typeof body.intervalSeconds === "number") patch.intervalSeconds = body.intervalSeconds
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled
  if (body.restartTargetId !== undefined) {
    patch.restartTargetId = (body.restartTargetId as string | null) ?? null
  }
  if (typeof body.restartFailureThreshold === "number") {
    patch.restartFailureThreshold = body.restartFailureThreshold
  }
  if (typeof body.restartCooldownSeconds === "number") {
    patch.restartCooldownSeconds = body.restartCooldownSeconds
  }

  const updated = await statusCheckModel.update(checkId, patch)
  if (!updated) return jsonError("update failed", 500)

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "status-page.check.update",
    resource: "status-check",
    resourceId: checkId,
    details: { fields: Object.keys(patch) },
  })

  return jsonSuccess(updated)
}

export async function checkDelete(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ slug: string; checkId: string }>
  },
) {
  const { slug, checkId } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await statusPageModel.findByCompany(access.companyId)
  if (!page) return jsonError("status page not found", 404)

  const check = await statusCheckModel.findById(checkId)
  if (!check || check.pageId !== page.id) {
    return jsonError("check not found", 404)
  }

  await statusProbeEventModel.removeByCheck(checkId)
  const ok = await statusCheckModel.remove(checkId)
  if (!ok) return jsonError("delete failed", 500)

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "status-page.check.delete",
    resource: "status-check",
    resourceId: checkId,
    details: { pageSlug: page.slug, name: check.name },
  })

  return jsonSuccess({ ok: true })
}
