import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import { encryptValue } from "@workspace/console/lib/env-vault-crypto"
import { mongoConnectionModel } from "@workspace/db/models"
import { isMongoUri, sanitizeUri, getDbNameFromUri, assertPublicMongoHost } from "@/lib/mongo-uri"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET  /mongo/connections — şirketin kayıtlı Mongo bağlantıları (public projeksiyon,
 *      uriEncrypted ASLA dönmez).
 * POST /mongo/connections — yeni bağlantı ekle. URI şifrelenir (AES-256-GCM),
 *      yalnız maskeli hali görüntülenebilir. `mongo.manage` gerekir.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const ctx = await resolveCompanyAccess(req, slug, "mongo.manage")
  if ("error" in ctx) return ctx.error

  const list = await mongoConnectionModel.listByCompany(ctx.companyId)
  return jsonSuccess(list.map((c) => mongoConnectionModel.toPublic(c)))
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const ctx = await resolveCompanyAccess(req, slug, "mongo.manage")
  if ("error" in ctx) return ctx.error

  let body: { label?: string; uri?: string; defaultDbName?: string }
  try {
    body = await req.json()
  } catch {
    return jsonError("Invalid body")
  }

  const label = (body.label ?? "").trim().slice(0, 120)
  const uri = (body.uri ?? "").trim()
  const defaultDbName = (body.defaultDbName ?? "").trim().slice(0, 120) || null

  if (!label) return jsonError("Label is required")
  if (!uri || !isMongoUri(uri)) {
    return jsonError("A valid mongodb:// or mongodb+srv:// URI is required")
  }
  // SSRF guard — internal/private host'ları reddet (platform DB exfiltration'ı önler).
  try {
    await assertPublicMongoHost(uri)
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Host not allowed", 400)
  }

  const masked = sanitizeUri(uri)
  const created = await mongoConnectionModel.create({
    companyId: ctx.companyId,
    label,
    uriEncrypted: encryptValue(uri),
    uriMasked: masked,
    defaultDbName: defaultDbName ?? getDbNameFromUri(uri, ""),
    createdByUserId: ctx.callerUserId,
  })

  await audit({
    userId: ctx.callerUserId,
    companyId: ctx.companyId,
    action: "mongo.connection.create",
    resource: "mongo-connection",
    resourceId: created.id,
    details: { label, uri: masked },
    request: req,
  }).catch(() => {})

  return jsonSuccess(mongoConnectionModel.toPublic(created), 201)
}
