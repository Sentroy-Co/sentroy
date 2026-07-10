import { NextRequest } from "next/server"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import { backupJobModel, auditLogModel } from "@workspace/db/models"

/**
 * DELETE /api/admin/backups/[id] — sadece kaydı sil. Remote backup db'si
 * kalır (admin manuel temizleyebilir; otomatik drop tehlikeli).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const { id } = await params
  const job = await backupJobModel.findById(id)
  if (!job) return jsonError("Backup job not found", 404)

  await backupJobModel.deleteById(id)

  auditLogModel
    .insert({
      userId: session.user.id,
      action: "admin.backup.delete",
      resource: "database",
      resourceId: id,
      details: { targetDbName: job.targetDbName },
    })
    .catch(() => {})

  return jsonSuccess({ deleted: true })
}
