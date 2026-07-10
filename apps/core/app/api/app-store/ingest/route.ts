import { NextRequest } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"
import { parseManifest } from "@workspace/app-manifest"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { sentroyAppModel, companyModel } from "@workspace/db/models"
import { buildAppCreateInput, semverGt } from "@/lib/app-store/build-record"

/**
 * GitHub ingest — merge edilen `sentroy-apps` manifest'lerini DB'ye pending
 * olarak senkronlar (source=github). HMAC-SHA256 ile imzalı (Actions secret
 * `APP_STORE_INGEST_SECRET`). Açık endpoint DEĞİL — imza zorunlu.
 *
 * Header: `x-sentroy-signature: <hex hmac of raw body>`.
 * developer.companySlug gerçek bir Sentroy company'ye çözülmeli; aksi halde
 * reddedilir. Admin onayı + origin doğrulama yine zorunlu.
 */
export async function POST(req: NextRequest) {
  // trim: panel/CI yapıştırmalarındaki sondaki newline/boşluk HMAC anahtarını
  // bozmasın (iki taraf da trim'lerse salt-boşluk farkı sorun olmaz).
  const secret = process.env.APP_STORE_INGEST_SECRET?.trim()
  if (!secret) return jsonError("ingest not configured", 503)

  const raw = await req.text()
  const sig = req.headers.get("x-sentroy-signature") ?? ""
  const expected = createHmac("sha256", secret).update(raw).digest("hex")
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return jsonError("invalid signature", 401)
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return jsonError("invalid JSON", 400)
  }

  const parsed = parseManifest(body)
  if (!parsed.ok) {
    return jsonError(`manifest invalid: ${parsed.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`, 422)
  }
  const m = parsed.manifest

  const company = await companyModel.findBySlug(m.developer.companySlug)
  if (!company) return jsonError(`developer.companySlug '${m.developer.companySlug}' is not a Sentroy company`, 422)

  const existing = await sentroyAppModel.findByAppId(m.identity.id)
  if (existing && existing.developerCompanyId !== company.id) {
    return jsonError("app id registered by another company", 409)
  }

  const now = new Date()
  const input = buildAppCreateInput(m, {
    developerCompanyId: company.id,
    submittedByUserId: company.ownerId,
    source: "github",
    submitForReview: true,
  }, now)

  if (existing) {
    if (!semverGt(existing.currentVersion, m.identity.version)) {
      return jsonError(`version must exceed current (${existing.currentVersion})`, 422)
    }
    const { appId: _appId, createdAt: _createdAt, ...rest } = input
    void _appId
    void _createdAt
    await sentroyAppModel.update(existing.id, {
      ...rest,
      versions: [...existing.versions, ...input.versions],
      status: "pending",
      reviewedByUserId: null,
      reviewedAt: null,
      rejectionReason: null,
      originVerifiedAt: null,
      installCount: existing.installCount,
      ratingAvg: existing.ratingAvg,
      ratingCount: existing.ratingCount,
    })
    return jsonSuccess({ id: existing.id, status: "pending", updated: true })
  }

  const created = await sentroyAppModel.create(input)
  return jsonSuccess({ id: created.id, status: "pending", updated: false }, 201)
}
