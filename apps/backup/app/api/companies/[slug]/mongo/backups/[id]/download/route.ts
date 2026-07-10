import { NextRequest, NextResponse } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import { mongoBackupJobModel } from "@workspace/db/models"
import { workerFetchArtifact } from "@/lib/worker"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /mongo/backups/[id]/download — yedek artefaktını (.archive.gz) masaüstüne
 * indir. Company-scope doğrulanır, sonra worker /file'dan STREAM-PROXY edilir
 * (S3 kredensiyalleri yalnız worker'da). İndirme audit'lenir. ⚠ KVKK: artefakt
 * gerçek veri içerir — indiren kişi sorumludur (UI'da uyarı gösterilir).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const ctx = await resolveCompanyAccess(req, slug, "mongo.manage")
  if ("error" in ctx) return ctx.error

  const job = await mongoBackupJobModel.findByIdForCompany(id, ctx.companyId)
  if (!job) return jsonError("Not found", 404)
  if (job.kind !== "backup" || job.status !== "success" || !job.s3Key) {
    return jsonError("No downloadable artifact for this job", 400)
  }

  const upstream = await workerFetchArtifact(job.s3Key)
  if (!upstream.ok || !upstream.body) {
    return jsonError("Artifact unavailable", 502)
  }

  await audit({
    userId: ctx.callerUserId,
    companyId: ctx.companyId,
    action: "mongo.backup.download",
    resource: "mongo-backup-job",
    resourceId: id,
    details: { dbName: job.dbName },
    request: req,
  }).catch(() => {})

  const safeDb = job.dbName.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80)
  const filename = `${safeDb}-${job.id}.archive.gz`
  const headers = new Headers()
  headers.set("Content-Type", "application/gzip")
  headers.set("Content-Disposition", `attachment; filename="${filename}"`)
  headers.set("Cache-Control", "private, no-store")
  const len = upstream.headers.get("content-length")
  if (len) headers.set("Content-Length", len)

  return new NextResponse(upstream.body, { status: 200, headers })
}
