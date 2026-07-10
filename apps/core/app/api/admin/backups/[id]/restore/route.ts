import { NextRequest } from "next/server"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import { backupJobModel, auditLogModel } from "@workspace/db/models"
import {
  getDbNameFromUri,
  runRestore,
  sanitizeUri,
} from "@/lib/backup-service"

/**
 * POST /api/admin/backups/[id]/restore — DESTRUCTIVE: backup'taki snapshot'ı
 * bir hedef MongoDB cluster'a geri yazar. Hedef db'deki tüm collection'lar
 * drop edilir, backup'taki veriyle değiştirilir.
 *
 * Body:
 *   { confirm: "RESTORE", targetUri?, targetDbName? }
 *
 *   - targetUri verilmezse current MONGODB_URI'ye yazılır (klasik "geri dön"
 *     senaryosu — current production'ı bu snapshot'a çevir).
 *   - targetUri verilirse o cluster'a yazılır (örnek senaryolar:
 *     dev'e prod snapshot kopyala, başka bir region'a fail-over kuralı).
 *   - targetDbName verilmezse target URI'den ya da MONGODB_DATABASE'ten
 *     çıkarılır.
 *
 * confirm="RESTORE" yanlışlıkla tetiklenmesin diye zorunlu.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  let body: {
    confirm?: string
    targetUri?: string
    targetDbName?: string
  } = {}
  try {
    body = await request.json()
  } catch {
    // boş body — confirm check'e düşer
  }
  if (body.confirm !== "RESTORE") {
    return jsonError(
      'Restore requires `{"confirm":"RESTORE"}` in the request body.',
      400,
    )
  }

  const { id } = await params
  const backupJob = await backupJobModel.findById(id)
  if (!backupJob) return jsonError("Backup job not found", 404)
  if (backupJob.kind !== "backup" || backupJob.status !== "success") {
    return jsonError(
      "Only successful backup jobs can be restored from",
      400,
    )
  }

  // Hedef cluster — body'de targetUri verilmezse current MONGODB_URI
  // (klasik geri-dön akışı). Verilirse o URI'ye yazılır (custom target,
  // örn dev cluster'a prod snapshot kopyalama).
  const targetUri = (body.targetUri ?? "").trim() || process.env.MONGODB_URI
  if (!targetUri) {
    return jsonError(
      "targetUri is required (or set MONGODB_URI for default current-cluster restore)",
      400,
    )
  }
  if (!/^mongodb(\+srv)?:\/\//.test(targetUri)) {
    return jsonError(
      "targetUri must be a mongodb:// or mongodb+srv:// URI",
      400,
    )
  }
  const targetDbName =
    (body.targetDbName ?? "").trim() || getDbNameFromUri(targetUri)

  // Restore'u yeni bir job kaydı olarak tut — ileride history'de görünür.
  const restoreJob = await backupJobModel.insert({
    kind: "restore",
    triggeredBy: session.user.id,
    sourceUri: backupJob.targetUri,
    sourceDbName: backupJob.targetDbName,
    targetUri,
    targetDbName,
  })
  await backupJobModel.updateStatus(restoreJob.id, { status: "running" })

  const result = await runRestore({
    backupUri: backupJob.targetUri,
    backupDbName: backupJob.targetDbName,
    currentUri: targetUri,
    currentDbName: targetDbName,
  })

  const finalJob = await backupJobModel.updateStatus(restoreJob.id, {
    status: result.ok ? "success" : "failed",
    collectionsCopied: result.collectionsCopied,
    totalDocs: result.totalDocs,
    error: result.ok ? null : result.error ?? "unknown",
    finishedAt: new Date(),
  })

  auditLogModel
    .insert({
      userId: session.user.id,
      action: "admin.backup.restore",
      resource: "database",
      resourceId: restoreJob.id,
      details: {
        sourceJobId: id,
        sourceDbName: backupJob.targetDbName,
        sourceHost: sanitizeUri(backupJob.targetUri),
        ok: result.ok,
        collectionsCopied: result.collectionsCopied,
        totalDocs: result.totalDocs,
        error: result.error,
      },
    })
    .catch(() => {})

  if (!result.ok) return jsonError(result.error ?? "Restore failed", 500)
  return jsonSuccess({
    ...finalJob,
    sourceUri: sanitizeUri(finalJob!.sourceUri),
    targetUri: sanitizeUri(finalJob!.targetUri),
  })
}
