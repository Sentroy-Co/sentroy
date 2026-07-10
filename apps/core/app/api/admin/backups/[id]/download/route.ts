import { NextRequest } from "next/server"
import {
  getAuthSession,
  jsonError,
} from "@workspace/console/lib/api-helpers"
import { backupJobModel, auditLogModel } from "@workspace/db/models"
import { dumpDbToJson } from "@/lib/backup-service"

/**
 * GET /api/admin/backups/[id]/download — backup'taki snapshot'ı JSON
 * olarak indir. Stream değil — küçük-orta DB için memory'de tek JSON
 * üretir, response gövdesi olarak yollar (Content-Disposition: attachment).
 *
 * Büyük DB için ileride NDJSON streaming + zip eklenir.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const { id } = await params
  const job = await backupJobModel.findById(id)
  if (!job) return jsonError("Backup job not found", 404)
  if (job.kind !== "backup" || job.status !== "success") {
    return jsonError(
      "Only successful backup jobs can be downloaded",
      400,
    )
  }

  let dump
  try {
    dump = await dumpDbToJson({
      uri: job.targetUri,
      dbName: job.targetDbName,
    })
  } catch (err) {
    console.error("[backup/download] dump failed:", err)
    return jsonError(
      err instanceof Error ? err.message : "Dump failed",
      502,
    )
  }

  auditLogModel
    .insert({
      userId: session.user.id,
      action: "admin.backup.download",
      resource: "database",
      resourceId: id,
      details: {
        targetDbName: job.targetDbName,
        docCount: dump._meta.docCount,
      },
    })
    .catch(() => {})

  const body = JSON.stringify(dump)
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${job.targetDbName}.json"`,
      "Cache-Control": "no-store",
    },
  })
}
