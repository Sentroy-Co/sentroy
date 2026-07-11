export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import { backupJobModel, auditLogModel } from "@workspace/db/models"
import {
  buildBackupDbName,
  getDbNameFromUri,
  runBackup,
  sanitizeUri,
} from "@/lib/backup-service"

/**
 * POST /api/admin/backups/[id]/retry — same target ile yeni snapshot alır.
 * Yeni timestamp'le yeni dbName, yeni job kaydı. Eski job kaydı history'de
 * kalır (silinmez).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const { id } = await params
  const previous = await backupJobModel.findById(id)
  if (!previous) return jsonError("Backup job not found", 404)
  if (previous.kind !== "backup") {
    return jsonError("Only backup jobs can be retried", 400)
  }

  const sourceUri = process.env.MONGODB_URI
  if (!sourceUri) return jsonError("MONGODB_URI is not configured", 500)
  const sourceDbName = getDbNameFromUri(sourceUri)
  const targetDbName = buildBackupDbName()

  const job = await backupJobModel.insert({
    kind: "backup",
    triggeredBy: session.user.id,
    sourceUri,
    sourceDbName,
    targetUri: previous.targetUri,
    targetDbName,
  })
  await backupJobModel.updateStatus(job.id, { status: "running" })

  const result = await runBackup({
    sourceUri,
    sourceDbName,
    targetUri: previous.targetUri,
    targetDbName,
  })

  const finalJob = await backupJobModel.updateStatus(job.id, {
    status: result.ok ? "success" : "failed",
    collectionsCopied: result.collectionsCopied,
    totalDocs: result.totalDocs,
    error: result.ok ? null : result.error ?? "unknown",
    finishedAt: new Date(),
  })

  auditLogModel
    .insert({
      userId: session.user.id,
      action: "admin.backup.retry",
      resource: "database",
      resourceId: job.id,
      details: {
        previousJobId: id,
        targetHost: sanitizeUri(previous.targetUri),
        targetDbName,
        ok: result.ok,
        error: result.error,
      },
    })
    .catch(() => {})

  if (!result.ok) return jsonError(result.error ?? "Retry failed", 500)
  return jsonSuccess({
    ...finalJob,
    sourceUri: sanitizeUri(finalJob!.sourceUri),
    targetUri: sanitizeUri(finalJob!.targetUri),
  })
}
