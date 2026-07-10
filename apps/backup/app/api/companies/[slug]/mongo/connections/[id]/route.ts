import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import { encryptValue } from "@workspace/console/lib/env-vault-crypto"
import { mongoConnectionModel, mongoBackupJobModel } from "@workspace/db/models"
import { isMongoUri, sanitizeUri, assertPublicMongoHost } from "@/lib/mongo-uri"
import { workerDeleteArtifact } from "@/lib/worker"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * PATCH  /mongo/connections/[id] — etiket / URI / defaultDbName güncelle.
 * DELETE /mongo/connections/[id] — bağlantıyı + ilişkili job kayıtlarını + S3
 *        artefaktlarını sil. `mongo.manage` gerekir.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const ctx = await resolveCompanyAccess(req, slug, "mongo.manage")
  if ("error" in ctx) return ctx.error

  let body: { label?: string; uri?: string; defaultDbName?: string | null }
  try {
    body = await req.json()
  } catch {
    return jsonError("Invalid body")
  }

  const patch: Parameters<typeof mongoConnectionModel.update>[2] = {}
  if (body.label !== undefined) {
    const label = body.label.trim().slice(0, 120)
    if (!label) return jsonError("Label cannot be empty")
    patch.label = label
  }
  if (body.uri !== undefined && body.uri.trim().length > 0) {
    const uri = body.uri.trim()
    if (!isMongoUri(uri)) return jsonError("A valid mongodb URI is required")
    try {
      await assertPublicMongoHost(uri)
    } catch (e) {
      return jsonError(e instanceof Error ? e.message : "Host not allowed", 400)
    }
    patch.uriEncrypted = encryptValue(uri)
    patch.uriMasked = sanitizeUri(uri)
  }
  if (body.defaultDbName !== undefined) {
    patch.defaultDbName = (body.defaultDbName ?? "").toString().trim().slice(0, 120) || null
  }
  if (Object.keys(patch).length === 0) return jsonError("Nothing to update")

  const updated = await mongoConnectionModel.update(id, ctx.companyId, patch)
  if (!updated) return jsonError("Connection not found", 404)

  await audit({
    userId: ctx.callerUserId,
    companyId: ctx.companyId,
    action: "mongo.connection.update",
    resource: "mongo-connection",
    resourceId: id,
    request: req,
  }).catch(() => {})

  return jsonSuccess(mongoConnectionModel.toPublic(updated))
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const ctx = await resolveCompanyAccess(req, slug, "mongo.manage")
  if ("error" in ctx) return ctx.error

  const conn = await mongoConnectionModel.findByIdForCompany(id, ctx.companyId)
  if (!conn) return jsonError("Connection not found", 404)

  // İlişkili job'ların S3 artefaktlarını sil (best-effort), sonra job + bağlantıyı sil.
  const jobs = await mongoBackupJobModel.listByCompany(ctx.companyId, {
    connectionId: id,
    limit: 1000,
  })
  for (const j of jobs) {
    if (j.kind === "backup" && j.s3Key) await workerDeleteArtifact(j.s3Key)
  }
  await mongoBackupJobModel.removeByConnection(id, ctx.companyId)
  await mongoConnectionModel.remove(id, ctx.companyId)

  await audit({
    userId: ctx.callerUserId,
    companyId: ctx.companyId,
    action: "mongo.connection.delete",
    resource: "mongo-connection",
    resourceId: id,
    details: { label: conn.label },
    request: req,
  }).catch(() => {})

  return jsonSuccess({ deleted: true })
}
