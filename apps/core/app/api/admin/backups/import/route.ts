import { NextRequest } from "next/server"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import { backupJobModel, auditLogModel } from "@workspace/db/models"
import {
  applyJsonDump,
  buildBackupDbName,
  getDbNameFromUri,
  runBackup,
  sanitizeUri,
  type DbDump,
} from "@/lib/backup-service"

/**
 * POST /api/admin/backups/import — JSON dump dosyasından current db'ye import.
 *
 * Akış:
 *   1. Snapshot — current db'nin auto pre-import yedeğini al, kayıt
 *      kind="backup" + tag="snapshot". Hedef: targetSnapshotUri (body) ya
 *      da MONGODB_URI'nin kendisinde "sentroy-snapshot-..." db olarak.
 *   2. Apply — uploaded JSON dump'ı current db'ye yaz (drop + insert).
 *   3. Job kayıt: kind="import", history'de görünür.
 *   4. Restore noktası: snapshot job kullanıcıya "geri dön" linki sağlar.
 *
 * Body: multipart/form-data
 *   - file: JSON dump (DbDump shape)
 *   - snapshotTargetUri (optional): snapshot için target. Verilmezse current
 *     URI'ye yazılır (aynı cluster, farklı db ismi).
 */
export async function POST(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return jsonError("Expected multipart/form-data body")
  }

  const file = form.get("file")
  if (!(file instanceof Blob) || file.size === 0) {
    return jsonError("No JSON file provided")
  }
  const text = await file.text()
  let dump: DbDump
  try {
    dump = JSON.parse(text) as DbDump
  } catch {
    return jsonError("Invalid JSON")
  }
  if (!dump || typeof dump !== "object" || !dump.collections) {
    return jsonError("JSON missing `collections` field")
  }

  const currentUri = process.env.MONGODB_URI
  if (!currentUri) return jsonError("MONGODB_URI is not configured", 500)
  const currentDbName = getDbNameFromUri(currentUri)

  const snapshotTargetUriRaw = form.get("snapshotTargetUri")
  const snapshotTargetUri =
    typeof snapshotTargetUriRaw === "string" && snapshotTargetUriRaw.trim()
      ? snapshotTargetUriRaw.trim()
      : currentUri
  const snapshotDbName = buildBackupDbName().replace(
    "sentroy-backup-",
    "sentroy-snapshot-",
  )

  // ── 1) Pre-import snapshot ────────────────────────────────────────────
  const snapshotJob = await backupJobModel.insert({
    kind: "backup",
    tag: "snapshot",
    triggeredBy: session.user.id,
    sourceUri: currentUri,
    sourceDbName: currentDbName,
    targetUri: snapshotTargetUri,
    targetDbName: snapshotDbName,
  })
  await backupJobModel.updateStatus(snapshotJob.id, { status: "running" })
  const snapResult = await runBackup({
    sourceUri: currentUri,
    sourceDbName: currentDbName,
    targetUri: snapshotTargetUri,
    targetDbName: snapshotDbName,
  })
  await backupJobModel.updateStatus(snapshotJob.id, {
    status: snapResult.ok ? "success" : "failed",
    collectionsCopied: snapResult.collectionsCopied,
    totalDocs: snapResult.totalDocs,
    error: snapResult.ok ? null : snapResult.error ?? "unknown",
    finishedAt: new Date(),
  })
  if (!snapResult.ok) {
    return jsonError(
      `Pre-import snapshot failed: ${snapResult.error ?? "unknown"}`,
      500,
    )
  }

  // ── 2) Import — current db'ye apply ───────────────────────────────────
  const importJob = await backupJobModel.insert({
    kind: "import",
    tag: "manual",
    triggeredBy: session.user.id,
    sourceUri: "",
    sourceDbName: dump._meta?.sourceDbName ?? "uploaded.json",
    targetUri: currentUri,
    targetDbName: currentDbName,
  })
  await backupJobModel.updateStatus(importJob.id, { status: "running" })

  const importResult = await applyJsonDump({
    targetUri: currentUri,
    targetDbName: currentDbName,
    dump,
  })

  const finalImport = await backupJobModel.updateStatus(importJob.id, {
    status: importResult.ok ? "success" : "failed",
    collectionsCopied: importResult.collectionsCopied,
    totalDocs: importResult.totalDocs,
    error: importResult.ok ? null : importResult.error ?? "unknown",
    finishedAt: new Date(),
  })

  auditLogModel
    .insert({
      userId: session.user.id,
      action: "admin.backup.import",
      resource: "database",
      resourceId: importJob.id,
      details: {
        snapshotJobId: snapshotJob.id,
        snapshotDbName,
        importedFrom: dump._meta?.sourceDbName ?? null,
        ok: importResult.ok,
        collectionsCopied: importResult.collectionsCopied,
        totalDocs: importResult.totalDocs,
        error: importResult.error,
      },
    })
    .catch(() => {})

  if (!importResult.ok) {
    return jsonError(
      `Import failed (snapshot succeeded — restore from snapshot if needed): ${importResult.error ?? "unknown"}`,
      500,
    )
  }

  return jsonSuccess({
    importJob: {
      ...finalImport,
      sourceUri: sanitizeUri(finalImport!.sourceUri || ""),
      targetUri: sanitizeUri(finalImport!.targetUri),
    },
    snapshotJobId: snapshotJob.id,
    snapshotDbName,
  })
}
