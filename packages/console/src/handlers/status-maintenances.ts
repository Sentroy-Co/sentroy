import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import {
  statusPageModel,
  statusMaintenanceModel,
  statusComponentModel,
} from "@workspace/db/models"
import type { MaintenanceStatus } from "@workspace/db/models/status-maintenance"
import type { LocalizedText } from "@workspace/db/types"
import { hasAnyLocalizedContent } from "@workspace/db/types"
import { audit } from "@workspace/console/lib/audit"

/**
 * Maintenance windows — scheduled downtime.
 *
 * Atlassian Statuspage pattern'i: scheduled (future) → in_progress
 * (between start/end) → completed (after end). Public page banner +
 * affected component'ler "under_maintenance" gösterimi.
 *
 * Phase 5.4. Subscriber notification (1h reminder, started, completed)
 * Phase 5.3 ile birlikte gelecek.
 */

const VALID_STATUSES: MaintenanceStatus[] = [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
]

async function resolvePage(
  access: { companyId: string },
): Promise<{ id: string; slug: string } | null> {
  const page = await statusPageModel.findByCompany(access.companyId)
  if (!page) return null
  return { id: page.id, slug: page.slug }
}

function parseDate(input: unknown): Date | null {
  if (typeof input !== "string") return null
  const date = new Date(input)
  return Number.isFinite(date.getTime()) ? date : null
}

// ─── List ─────────────────────────────────────────────────────────────────

export async function maintenancesListGet(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await resolvePage(access)
  if (!page) return jsonError("status page not found", 404)

  const url = new URL(request.url)
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? "50"), 1),
    100,
  )
  const skip = Math.max(Number(url.searchParams.get("skip") ?? "0"), 0)

  const items = await statusMaintenanceModel.findRecentByPage(page.id, {
    limit,
    skip,
  })
  return jsonSuccess(items)
}

// ─── Create ───────────────────────────────────────────────────────────────

export async function maintenanceCreatePost(
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
    description?: LocalizedText | string
    affectedComponentIds?: string[]
    scheduledStart?: string
    scheduledEnd?: string
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!hasAnyLocalizedContent(body.title)) {
    return jsonError("title required (at least one locale)")
  }
  if (!hasAnyLocalizedContent(body.description)) {
    return jsonError("description required (at least one locale)")
  }
  const start = parseDate(body.scheduledStart)
  const end = parseDate(body.scheduledEnd)
  if (!start || !end) {
    return jsonError("scheduledStart and scheduledEnd required (ISO strings)")
  }
  if (end <= start) {
    return jsonError("scheduledEnd must be after scheduledStart")
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

  const maintenance = await statusMaintenanceModel.create({
    pageId: page.id,
    title: body.title!,
    description: body.description!,
    affectedComponentIds,
    scheduledStart: start,
    scheduledEnd: end,
    createdBy: access.session!.user.id,
  })

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "status-page.maintenance.create",
    resource: "status-maintenance",
    resourceId: maintenance.id,
    details: {
      pageSlug: page.slug,
      scheduledStart: start.toISOString(),
      scheduledEnd: end.toISOString(),
      affectedComponents: affectedComponentIds.length,
    },
  })

  return jsonSuccess(maintenance, 201)
}

// ─── Patch ────────────────────────────────────────────────────────────────

export async function maintenancePatch(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; maintenanceId: string }> },
) {
  const { slug, maintenanceId } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await resolvePage(access)
  if (!page) return jsonError("status page not found", 404)

  const existing = await statusMaintenanceModel.findById(maintenanceId)
  if (!existing || existing.pageId !== page.id) {
    return jsonError("maintenance not found", 404)
  }

  let body: {
    title?: LocalizedText | string
    description?: LocalizedText | string
    affectedComponentIds?: string[]
    scheduledStart?: string
    scheduledEnd?: string
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const patch: {
    title?: LocalizedText | string
    description?: LocalizedText | string
    affectedComponentIds?: string[]
    scheduledStart?: Date
    scheduledEnd?: Date
  } = {}

  if (body.title !== undefined && hasAnyLocalizedContent(body.title)) {
    patch.title = body.title
  }
  if (body.description !== undefined && hasAnyLocalizedContent(body.description)) {
    patch.description = body.description
  }
  if (Array.isArray(body.affectedComponentIds)) {
    const ids = body.affectedComponentIds.filter((id) => typeof id === "string")
    if (ids.length > 0) {
      const components = await statusComponentModel.findByPage(page.id)
      const owned = new Set(components.map((c) => c.id))
      const stranger = ids.find((id) => !owned.has(id))
      if (stranger) return jsonError(`Component ${stranger} not in this page`, 400)
    }
    patch.affectedComponentIds = ids
  }
  if (body.scheduledStart !== undefined) {
    const start = parseDate(body.scheduledStart)
    if (!start) return jsonError("scheduledStart invalid")
    patch.scheduledStart = start
  }
  if (body.scheduledEnd !== undefined) {
    const end = parseDate(body.scheduledEnd)
    if (!end) return jsonError("scheduledEnd invalid")
    patch.scheduledEnd = end
  }
  // Cross-field validation: yeni start/end consistency
  const effectiveStart = patch.scheduledStart ?? existing.scheduledStart
  const effectiveEnd = patch.scheduledEnd ?? existing.scheduledEnd
  if (effectiveEnd <= effectiveStart) {
    return jsonError("scheduledEnd must be after scheduledStart")
  }

  const updated = await statusMaintenanceModel.update(maintenanceId, patch)
  if (!updated) return jsonError("update failed", 500)

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "status-page.maintenance.update",
    resource: "status-maintenance",
    resourceId: maintenanceId,
    details: { pageSlug: page.slug },
  })

  return jsonSuccess(updated)
}

// ─── Status transition ────────────────────────────────────────────────────

export async function maintenanceTransitionPost(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; maintenanceId: string }> },
) {
  const { slug, maintenanceId } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await resolvePage(access)
  if (!page) return jsonError("status page not found", 404)

  const existing = await statusMaintenanceModel.findById(maintenanceId)
  if (!existing || existing.pageId !== page.id) {
    return jsonError("maintenance not found", 404)
  }

  let body: { status?: MaintenanceStatus }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  if (!body.status || !VALID_STATUSES.includes(body.status)) {
    return jsonError("status required")
  }

  const updated = await statusMaintenanceModel.transitionStatus(
    maintenanceId,
    body.status,
  )
  if (!updated) return jsonError("transition failed", 500)

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "status-page.maintenance.transition",
    resource: "status-maintenance",
    resourceId: maintenanceId,
    details: { pageSlug: page.slug, newStatus: body.status },
  })

  return jsonSuccess(updated)
}

// ─── Delete ───────────────────────────────────────────────────────────────

export async function maintenanceDelete(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; maintenanceId: string }> },
) {
  const { slug, maintenanceId } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await resolvePage(access)
  if (!page) return jsonError("status page not found", 404)

  const existing = await statusMaintenanceModel.findById(maintenanceId)
  if (!existing || existing.pageId !== page.id) {
    return jsonError("maintenance not found", 404)
  }

  const ok = await statusMaintenanceModel.remove(maintenanceId)
  if (!ok) return jsonError("delete failed", 500)

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "status-page.maintenance.delete",
    resource: "status-maintenance",
    resourceId: maintenanceId,
    details: { pageSlug: page.slug },
  })

  return jsonSuccess({ ok: true })
}
