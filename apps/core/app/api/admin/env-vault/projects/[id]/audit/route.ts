import { NextRequest } from "next/server"
import { jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import { envAuditLogModel } from "@workspace/db/models"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await assertAdmin(request)
  if ("error" in auth) return auth.error
  const { id } = await params
  const limit = Math.min(
    Number(request.nextUrl.searchParams.get("limit")) || 100,
    500,
  )
  const logs = await envAuditLogModel.findByProject(id, limit)
  return jsonSuccess(logs)
}
