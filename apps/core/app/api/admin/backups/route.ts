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
 * GET /api/admin/backups — list backup history (admin only).
 */
export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const jobs = await backupJobModel.list({ limit: 200 })
  // URI'leri sanitize ederek dön (DB'de plain ama response'ta credentials yok).
  const out = jobs.map((j) => ({
    ...j,
    sourceUri: sanitizeUri(j.sourceUri),
    targetUri: sanitizeUri(j.targetUri),
  }))
  return jsonSuccess(out)
}

/**
 * POST /api/admin/backups — yeni backup tetikle.
 * Body: { targetUri: string }
 *
 * Akış:
 *   1. Job kaydı pending olarak insert
 *   2. Mongo cluster-to-cluster copy (sync — büyük DB'de timeout riski var,
 *      ileride Bull queue worker'a taşınır)
 *   3. Job kaydı success/failed olarak güncelle
 *   4. Audit log
 */
export async function POST(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  let body: { targetUri?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  const targetUri = (body.targetUri ?? "").trim()
  if (!targetUri || !/^mongodb(\+srv)?:\/\//.test(targetUri)) {
    return jsonError("targetUri must be a mongodb:// or mongodb+srv:// URI")
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
    targetUri,
    targetDbName,
  })

  await backupJobModel.updateStatus(job.id, { status: "running" })

  const result = await runBackup({
    sourceUri,
    sourceDbName,
    targetUri,
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
      action: "admin.backup.create",
      resource: "database",
      resourceId: job.id,
      details: {
        targetHost: sanitizeUri(targetUri),
        targetDbName,
        ok: result.ok,
        collectionsCopied: result.collectionsCopied,
        totalDocs: result.totalDocs,
        error: result.error,
      },
    })
    .catch(() => {})

  if (!result.ok) {
    return jsonError(result.error ?? "Backup failed", 500)
  }

  return jsonSuccess({
    ...finalJob,
    sourceUri: sanitizeUri(finalJob!.sourceUri),
    targetUri: sanitizeUri(finalJob!.targetUri),
  })
}
