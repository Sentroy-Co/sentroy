import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import {
  statusPageModel,
  statusIncidentModel,
  statusComponentModel,
} from "@workspace/db/models"
import type {
  IncidentStatus,
  IncidentImpact,
} from "@workspace/db/models/status-incident"
import type { LocalizedText } from "@workspace/db/types"
import { hasAnyLocalizedContent } from "@workspace/db/types"
import { audit } from "@workspace/console/lib/audit"

/**
 * Status Incidents — manuel + auto-detected incident management.
 *
 * Auto incidents worker tarafından açılır (apps/status-worker → incident.ts),
 * dashboard manuel ekleme + timeline update + resolve UI'ı sunar.
 *
 * Public read (active/recent incidents snapshot'ı) `status-page-public.ts`
 * tarafından servis edilir.
 */

const VALID_STATUSES: IncidentStatus[] = [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
]
const VALID_IMPACTS: IncidentImpact[] = ["minor", "major", "critical"]

async function resolvePage(
  access: { companyId: string },
): Promise<{ id: string; slug: string } | null> {
  const page = await statusPageModel.findByCompany(access.companyId)
  if (!page) return null
  return { id: page.id, slug: page.slug }
}

// ─── List ─────────────────────────────────────────────────────────────────

export async function incidentsListGet(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await resolvePage(access)
  if (!page) return jsonError("status page not found", 404)

  const url = new URL(request.url)
  const scope = url.searchParams.get("scope") ?? "all"

  let items
  if (scope === "active") {
    items = await statusIncidentModel.findActiveByPage(page.id)
  } else {
    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit") ?? "50"), 1),
      100,
    )
    const skip = Math.max(Number(url.searchParams.get("skip") ?? "0"), 0)
    items = await statusIncidentModel.findRecentByPage(page.id, { limit, skip })
  }
  return jsonSuccess(items)
}

// ─── Create (manual) ──────────────────────────────────────────────────────

export async function incidentCreatePost(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await resolvePage(access)
  if (!page) return jsonError("status page not found", 404)

  let body: {
    title?: LocalizedText | string
    initialStatus?: IncidentStatus
    impact?: IncidentImpact
    affectedComponentIds?: string[]
    initialUpdateBody?: LocalizedText | string
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!hasAnyLocalizedContent(body.title)) {
    return jsonError("title required (at least one locale)")
  }
  const initialStatus = body.initialStatus ?? "investigating"
  if (!VALID_STATUSES.includes(initialStatus)) {
    return jsonError("invalid initialStatus")
  }
  if (initialStatus === "resolved") {
    return jsonError("Cannot create an already-resolved incident; create with investigating then post resolve update")
  }
  const impact = body.impact ?? "minor"
  if (!VALID_IMPACTS.includes(impact)) {
    return jsonError("invalid impact")
  }
  const affectedComponentIds = Array.isArray(body.affectedComponentIds)
    ? body.affectedComponentIds.filter((id) => typeof id === "string")
    : []

  if (affectedComponentIds.length > 0) {
    const components = await statusComponentModel.findByPage(page.id)
    const owned = new Set(components.map((c) => c.id))
    const stranger = affectedComponentIds.find((id) => !owned.has(id))
    if (stranger) {
      return jsonError(`Component ${stranger} not in this page`, 400)
    }
  }

  const initialBody = hasAnyLocalizedContent(body.initialUpdateBody)
    ? body.initialUpdateBody!
    : {
        tr: "Bu olayı inceliyoruz.",
        en: "We are investigating this incident.",
      }

  const incident = await statusIncidentModel.create({
    pageId: page.id,
    title: body.title!,
    initialStatus,
    impact,
    affectedComponentIds,
    source: "manual",
    detectedByCheckId: null,
    initialUpdate: {
      body: initialBody,
      authorId: access.session!.user.id,
      authorName: access.session!.user.name ?? null,
    },
    createdBy: access.session!.user.id,
  })

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "status-page.incident.create",
    resource: "status-incident",
    resourceId: incident.id,
    details: {
      pageSlug: page.slug,
      title: incident.title,
      impact,
      initialStatus,
      affectedComponents: affectedComponentIds.length,
    },
  })

  return jsonSuccess(incident, 201)
}

// ─── Patch meta (title/impact/affectedComponentIds) ───────────────────────

export async function incidentPatch(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; incidentId: string }> },
) {
  const { slug, incidentId } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await resolvePage(access)
  if (!page) return jsonError("status page not found", 404)

  const existing = await statusIncidentModel.findById(incidentId)
  if (!existing || existing.pageId !== page.id) {
    return jsonError("incident not found", 404)
  }

  let body: {
    title?: LocalizedText | string
    impact?: IncidentImpact
    affectedComponentIds?: string[]
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const patch: {
    title?: LocalizedText | string
    impact?: IncidentImpact
    affectedComponentIds?: string[]
  } = {}
  if (body.title !== undefined && hasAnyLocalizedContent(body.title)) {
    patch.title = body.title
  }
  if (body.impact && VALID_IMPACTS.includes(body.impact)) {
    patch.impact = body.impact
  }
  if (Array.isArray(body.affectedComponentIds)) {
    const ids = body.affectedComponentIds.filter(
      (id) => typeof id === "string",
    )
    if (ids.length > 0) {
      const components = await statusComponentModel.findByPage(page.id)
      const owned = new Set(components.map((c) => c.id))
      const stranger = ids.find((id) => !owned.has(id))
      if (stranger) {
        return jsonError(`Component ${stranger} not in this page`, 400)
      }
    }
    patch.affectedComponentIds = ids
  }

  const updated = await statusIncidentModel.update(incidentId, patch)
  if (!updated) return jsonError("update failed", 500)

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "status-page.incident.update",
    resource: "status-incident",
    resourceId: incidentId,
    details: { pageSlug: page.slug, title: updated.title },
  })

  return jsonSuccess(updated)
}

// ─── Append update (timeline post) ────────────────────────────────────────

export async function incidentUpdatePost(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; incidentId: string }> },
) {
  const { slug, incidentId } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await resolvePage(access)
  if (!page) return jsonError("status page not found", 404)

  const existing = await statusIncidentModel.findById(incidentId)
  if (!existing || existing.pageId !== page.id) {
    return jsonError("incident not found", 404)
  }
  if (existing.status === "resolved") {
    return jsonError("Cannot append updates to a resolved incident; reopen by editing status not supported in v1")
  }

  let body: {
    status?: IncidentStatus
    bodyText?: LocalizedText | string
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.status || !VALID_STATUSES.includes(body.status)) {
    return jsonError("status required (investigating|identified|monitoring|resolved)")
  }
  if (!hasAnyLocalizedContent(body.bodyText)) {
    return jsonError("bodyText required (at least one locale)")
  }

  const updated = await statusIncidentModel.appendUpdate(incidentId, {
    status: body.status,
    body: body.bodyText!,
    authorId: access.session!.user.id,
    authorName: access.session!.user.name ?? null,
  })
  if (!updated) return jsonError("update failed", 500)

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "status-page.incident.append-update",
    resource: "status-incident",
    resourceId: incidentId,
    details: {
      pageSlug: page.slug,
      title: updated.title,
      newStatus: body.status,
      resolved: body.status === "resolved",
    },
  })

  return jsonSuccess(updated)
}

// ─── Postmortem ───────────────────────────────────────────────────────────

/**
 * PUT /api/companies/[slug]/status/incidents/[id]/postmortem — postmortem
 * yaz veya güncelle. Body `{ postmortem: LocalizedText }` ya da
 * `{ postmortem: null }` (silmek için).
 *
 * Resolved olmamış incident'lere de postmortem yazılabilir (taslak
 * olarak), public render sadece resolvedAt set olduğunda gösterir.
 */
export async function incidentPostmortemPut(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; incidentId: string }> },
) {
  const { slug, incidentId } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await resolvePage(access)
  if (!page) return jsonError("status page not found", 404)

  const existing = await statusIncidentModel.findById(incidentId)
  if (!existing || existing.pageId !== page.id) {
    return jsonError("incident not found", 404)
  }

  let body: { postmortem?: LocalizedText | null | string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const next = body.postmortem
  if (next !== null && typeof next !== "string" && typeof next !== "object") {
    return jsonError("postmortem must be string, object or null")
  }

  // Empty localized object → treat as clear
  let payload: LocalizedText | string | null
  if (next === null) {
    payload = null
  } else if (typeof next === "string") {
    payload = next.trim() ? next : null
  } else {
    payload = hasAnyLocalizedContent(next) ? next : null
  }

  const updated = await statusIncidentModel.setPostmortem(incidentId, payload)
  if (!updated) return jsonError("update failed", 500)

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: payload ? "status-page.incident.postmortem.publish" : "status-page.incident.postmortem.clear",
    resource: "status-incident",
    resourceId: incidentId,
    details: { pageSlug: page.slug, title: existing.title },
  })

  return jsonSuccess(updated)
}

// ─── Delete ───────────────────────────────────────────────────────────────

export async function incidentDelete(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; incidentId: string }> },
) {
  const { slug, incidentId } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await resolvePage(access)
  if (!page) return jsonError("status page not found", 404)

  const existing = await statusIncidentModel.findById(incidentId)
  if (!existing || existing.pageId !== page.id) {
    return jsonError("incident not found", 404)
  }

  const ok = await statusIncidentModel.remove(incidentId)
  if (!ok) return jsonError("delete failed", 500)

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "status-page.incident.delete",
    resource: "status-incident",
    resourceId: incidentId,
    details: { pageSlug: page.slug, title: existing.title, source: existing.source },
  })

  return jsonSuccess({ ok: true })
}
