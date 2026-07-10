import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import { mongoBackupJobModel } from "@workspace/db/models"
import { workerDeleteArtifact } from "@/lib/worker"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET    /mongo/backups/[id] — tek job (polling: worker status/progress günceller).
 * DELETE /mongo/backups/[id] — job kaydını + (backup ise) S3 artefaktını sil.
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
  return jsonSuccess(job)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const ctx = await resolveCompanyAccess(req, slug, "mongo.manage")
  if ("error" in ctx) return ctx.error

  const job = await mongoBackupJobModel.findByIdForCompany(id, ctx.companyId)
  if (!job) return jsonError("Not found", 404)

  if (job.kind === "backup" && job.s3Key) {
    await workerDeleteArtifact(job.s3Key)
  }
  await mongoBackupJobModel.remove(id, ctx.companyId)

  await audit({
    userId: ctx.callerUserId,
    companyId: ctx.companyId,
    action: "mongo.backup.delete",
    resource: "mongo-backup-job",
    resourceId: id,
    request: req,
  }).catch(() => {})

  return jsonSuccess({ deleted: true })
}
