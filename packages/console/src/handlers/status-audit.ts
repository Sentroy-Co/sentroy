import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { auditLogModel } from "@workspace/db/models"

/**
 * Status page audit log viewer — dashboard tab'da gösterim için.
 * Sadece "status-page.*" prefix'li action'ları döner (page CRUD,
 * components, checks, incidents, maintenances, subscribers, restart
 * targets — hepsi). Permission: status-page.manage.
 */

export async function auditListGet(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const url = new URL(request.url)
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? "100"), 1),
    500,
  )
  const skip = Math.max(Number(url.searchParams.get("skip") ?? "0"), 0)

  const entries = await auditLogModel.findByCompany(access.companyId, {
    actionPrefix: "status-page.",
    limit,
    skip,
  })

  return jsonSuccess(
    entries.map((e) => ({
      id: e.id,
      action: e.action,
      resource: e.resource,
      resourceId: e.resourceId,
      userId: e.userId,
      details: e.details,
      ipAddress: e.ipAddress ?? null,
      createdAt: e.createdAt,
    })),
  )
}
