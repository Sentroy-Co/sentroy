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
 * GET  /mongo/backups?connectionId= — yedek/restore iş kayıtları (en yeni ilk).
 * POST /mongo/backups — bir bağlantı için yedek tetikle. Job (queued) oluşturur,
 *      S3 key belirler, worker'a fire-and-forget yollar; worker status'u günceller.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const ctx = await resolveCompanyAccess(req, slug, "mongo.manage")
  if ("error" in ctx) return ctx.error

  const connectionId = req.nextUrl.searchParams.get("connectionId") || undefined
  const jobs = await mongoBackupJobModel.listByCompany(ctx.companyId, {
    connectionId,
    limit: 100,
  })
  return jsonSuccess(jobs)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const ctx = await resolveCompanyAccess(req, slug, "mongo.manage")
  if ("error" in ctx) return ctx.error

  let body: { connectionId?: string; dbName?: string }
  try {
    body = await req.json()
  } catch {
    return jsonError("Invalid body")
  }

  const connectionId = (body.connectionId ?? "").trim()
  if (!connectionId) return jsonError("connectionId is required")

  const conn = await mongoConnectionModel.findByIdForCompany(connectionId, ctx.companyId)
  if (!conn) return jsonError("Connection not found", 404)

  const dbName = (body.dbName ?? "").trim() || conn.defaultDbName || ""
  if (!dbName) {
    return jsonError("Database name is required (no default on this connection)")
  }
  if (!isValidDbName(dbName)) return jsonError("Invalid database name")

  // Aynı bağlantıda zaten aktif iş varsa reddet (loop-POST kaynak istismarı guard'ı).
  if (await mongoBackupJobModel.hasActive(ctx.companyId, connectionId)) {
    return jsonError("A backup or restore is already running for this connection", 409)
  }

  // 1) Job'u queued oluştur → 2) jobId'den S3 key türet → 3) worker'a yolla.
  const job = await mongoBackupJobModel.create({
    companyId: ctx.companyId,
    kind: "backup",
    dbName,
    connectionId,
    connectionLabel: conn.label,
    triggeredByUserId: ctx.callerUserId,
    triggeredByEmail: ctx.callerEmail ?? null,
  })

  // s3Key jobId'den türetilir; job'a yazılır (UI/download referansı) + worker'a yollanır.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const s3Key = `mongo-backups/${ctx.companyId}/${job.id}/${dbName}-${stamp}.archive.gz`
  await mongoBackupJobModel.setS3Key(job.id, s3Key)

  try {
    await workerTrigger("/backup", {
      jobId: job.id,
      companyId: ctx.companyId,
      connectionId,
      dbName,
      s3Key,
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
    action: "mongo.backup.start",
    resource: "mongo-backup-job",
    resourceId: job.id,
    details: { connection: conn.label, dbName },
    request: req,
  }).catch(() => {})

  const fresh = await mongoBackupJobModel.findByIdForCompany(job.id, ctx.companyId)
  return jsonSuccess(fresh, 201)
}
