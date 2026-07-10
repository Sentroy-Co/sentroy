import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { sentroyAppModel, appReviewModel, appInstallModel, companyModel } from "@workspace/db/models"

/**
 * POST { companySlug, rating(1-5), body? } → yıldız/yorum (upsert).
 * Gate: o şirkette AKTİF install + geliştirici DEĞİL. (appId,userId) unique →
 * tek yorum. Yazımdan sonra aggregate yeniden hesaplanır.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ appId: string }> }) {
  const session = await getAuthSession(req)
  if (!session) return jsonError("Unauthorized", 401)
  const { appId } = await params

  const app = await sentroyAppModel.findByAppId(appId)
  if (!app) return jsonError("App not found", 404)

  let body: { companySlug?: string; rating?: number; body?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return jsonError("Invalid JSON", 400)
  }
  const rating = Math.round(Number(body.rating))
  if (!body.companySlug) return jsonError("companySlug required", 400)
  if (!(rating >= 1 && rating <= 5)) return jsonError("rating must be 1-5", 400)

  const company = await companyModel.findBySlug(body.companySlug)
  if (!company) return jsonError("Company not found", 404)

  const install = await appInstallModel.findActive(session.user.id, app.id, company.id)
  if (!install) return jsonError("Install the app before reviewing", 403)
  if (app.developerCompanyId === company.id) return jsonError("You cannot review your own app", 403)

  await appReviewModel.upsert({
    appId: app.id,
    userId: session.user.id,
    rating,
    body: (body.body ?? "").trim() || null,
  })

  const agg = await appReviewModel.computeAggregate(app.id)
  await sentroyAppModel.setRatingAggregate(app.id, agg.ratingAvg, agg.ratingCount)

  return jsonSuccess({ ok: true, ...agg })
}

/** DELETE → kendi yorumunu sil + aggregate güncelle. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ appId: string }> }) {
  const session = await getAuthSession(req)
  if (!session) return jsonError("Unauthorized", 401)
  const { appId } = await params

  const app = await sentroyAppModel.findByAppId(appId)
  if (!app) return jsonError("App not found", 404)

  await appReviewModel.remove(app.id, session.user.id)
  const agg = await appReviewModel.computeAggregate(app.id)
  await sentroyAppModel.setRatingAggregate(app.id, agg.ratingAvg, agg.ratingCount)

  return jsonSuccess({ ok: true, ...agg })
}
