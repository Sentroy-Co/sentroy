import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyOwnerOrAdmin } from "@workspace/console/lib/company-access"
import {
  envAuditLogModel,
  envProjectModel,
} from "@workspace/db/models"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const auth = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in auth) return auth.error

  const project = await envProjectModel.findById(id)
  if (!project || project.companyId !== auth.companyId) {
    return jsonError("project not found", 404)
  }

  const limit = Math.min(
    Number(request.nextUrl.searchParams.get("limit")) || 100,
    500,
  )
  const logs = await envAuditLogModel.findByProject(id, limit)
  return jsonSuccess(logs)
}
