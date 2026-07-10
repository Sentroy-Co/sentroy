import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import { mongoConnectionModel, mongoBackupJobModel } from "@workspace/db/models"
import { isValidDbName } from "@/lib/mongo-uri"
import { workerTrigger } from "@/lib/worker"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /mongo/restore — bir yedek artefaktını bir HEDEF bağlantıya geri yükle
 * (sunucular arası: kaynak sunucudaki yedek → başka sunucudaki Mongo). ⚠ YIKICI:
 * `drop=true` ise hedef koleksiyonlar önce silinir. UI'da confirm({destructive})
 * ile onay alınır. Job (queued) oluşturur, worker'a fire-and-forget yollar.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const ctx = await resolveCompanyAccess(req, slug, "mongo.manage")
  if ("error" in ctx) return ctx.error

  let body: {
    sourceJobId?: string
    targetConnectionId?: string
    targetDbName?: string
    drop?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return jsonError("Invalid body")
  }

  const sourceJobId = (body.sourceJobId ?? "").trim()
  const targetConnectionId = (body.targetConnectionId ?? "").trim()
  if (!sourceJobId || !targetConnectionId) {
    return jsonError("sourceJobId and targetConnectionId are required")
  }

  const source = await mongoBackupJobModel.findByIdForCompany(sourceJobId, ctx.companyId)
  if (!source || source.kind !== "backup" || source.status !== "success" || !source.s3Key) {
    return jsonError("Source backup not found or not restorable", 404)
  }

  const target = await mongoConnectionModel.findByIdForCompany(targetConnectionId, ctx.companyId)
  if (!target) return jsonError("Target connection not found", 404)

  const targetDbName = (body.targetDbName ?? "").trim() || source.dbName
  if (!isValidDbName(targetDbName)) return jsonError("Invalid target database name")

  // Hedef bağlantıda aktif iş varsa reddet (eşzamanlı restore çakışması guard'ı).
  if (await mongoBackupJobModel.hasActive(ctx.companyId, targetConnectionId)) {
    return jsonError("A backup or restore is already running for the target connection", 409)
  }

  const drop = body.drop === true

  const job = await mongoBackupJobModel.create({
    companyId: ctx.companyId,
    kind: "restore",
    dbName: targetDbName,
    connectionId: targetConnectionId,
    connectionLabel: target.label,
    sourceJobId,
    s3Key: source.s3Key,
    drop,
    triggeredByUserId: ctx.callerUserId,
    triggeredByEmail: ctx.callerEmail ?? null,
  })

  try {
    await workerTrigger("/restore", {
      jobId: job.id,
      companyId: ctx.companyId,
      connectionId: targetConnectionId,
      sourceDbName: source.dbName,
      targetDbName,
      s3Key: source.s3Key,
      drop,
    })
  } catch (e) {
    await mongoBackupJobModel.markFailed(
      job.id,
      e instanceof Error ? e.message : "Worker unreachable",
    )
    return jsonError("Backup worker unavailable — try again later", 502)
  }

  await audit({
    userId: ctx.callerUserId,
    companyId: ctx.companyId,
    action: "mongo.restore.start",
    resource: "mongo-backup-job",
    resourceId: job.id,
    details: {
      target: target.label,
      targetDbName,
      sourceJobId,
      drop,
    },
    request: req,
  }).catch(() => {})

  const fresh = await mongoBackupJobModel.findByIdForCompany(job.id, ctx.companyId)
  return jsonSuccess(fresh, 201)
}
