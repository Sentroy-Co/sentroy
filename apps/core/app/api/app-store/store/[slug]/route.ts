import { NextRequest } from "next/server"
import { ObjectId } from "mongodb"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { sentroyAppModel, appReviewModel, appInstallModel, companyModel, companyMemberModel } from "@workspace/db/models"
import { getDb } from "@workspace/db/client"

/** GET ?company=slug → mağaza detay + yorumlar + kullanıcının install/yorum durumu. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getAuthSession(req)
  if (!session) return jsonError("Unauthorized", 401)

  const { slug } = await params
  const app = await sentroyAppModel.findBySlug(slug)
  if (!app || app.status !== "approved" || !app.enabled) {
    return jsonError("Not found", 404)
  }
  // Private app: yalnız sahibi şirketin aktif üyesi görebilir. (registry
  // satırları her zaman public → developerCompanyId burada daima non-null.)
  if (app.visibility === "private") {
    if (!app.developerCompanyId) return jsonError("Not found", 404)
    const m = await companyMemberModel.findByCompanyAndUser(app.developerCompanyId, session.user.id)
    if (!m || m.status !== "active") return jsonError("Not found", 404)
  }

  const db = await getDb()
  const devCompany =
    app.developerCompanyId && ObjectId.isValid(app.developerCompanyId)
      ? await db.collection("companies").findOne({ _id: new ObjectId(app.developerCompanyId) }, { projection: { name: 1, slug: 1 } })
      : null
  // Public developer profili yalnız şirketin ≥1 public app'i varsa çözülür
  // (aksi halde /store/dev/[slug] 404 verir — gizlilik). Store panel linki
  // buna göre tıklanabilir yapar; private app'in dev'i ölü linke gitmez.
  const developerHasPublicProfile =
    app.visibility === "public"
      ? true
      : app.developerCompanyId
        ? await sentroyAppModel.hasPublicApps(app.developerCompanyId)
        : false

  const reviews = await appReviewModel.listForApp(app.id)
  const reviewerIds = Array.from(new Set(reviews.map((r) => r.userId).filter((x) => ObjectId.isValid(x))))
  const users = reviewerIds.length
    ? await db.collection("user").find({ _id: { $in: reviewerIds.map((i) => new ObjectId(i)) } }).project({ name: 1, image: 1 }).toArray()
    : []
  const userMap = new Map(users.map((u) => [u._id.toString(), { name: (u.name as string) ?? null, image: (u.image as string) ?? null }]))

  const companySlug = new URL(req.url).searchParams.get("company")
  let installed = false
  let canReview = false
  if (companySlug) {
    const company = await companyModel.findBySlug(companySlug)
    if (company) {
      const inst = await appInstallModel.findActive(session.user.id, app.id, company.id)
      installed = !!inst
      // Geliştirici kendi app'ine yorum yapamaz.
      canReview = !!inst && app.developerCompanyId !== company.id
    }
  }
  const userReview = reviews.find((r) => r.userId === session.user.id) ?? null

  return jsonSuccess({
    app: {
      appId: app.appId,
      slug: app.slug,
      name: app.name,
      tagline: app.tagline,
      logoUrl: app.appearance.logoUrl,
      color: app.appearance.color,
      category: app.appearance.category,
      screenshots: app.appearance.screenshots,
      description: app.store.description,
      longDescription: app.store.longDescription,
      supportUrl: app.store.supportUrl,
      privacyUrl: app.store.privacyUrl,
      termsUrl: app.store.termsUrl,
      authMode: app.authMode,
      requiredScopes: app.requiredScopes,
      // Embed config — yüklü app'i "Aç" ile OS penceresinde açmak için.
      embedUrl: app.embedUrl,
      sandboxAttr: app.sandboxAttr,
      allowAttr: app.allowAttr,
      injectedParams: app.injectedParams,
      supportedLangs: app.store.supportedLangs,
      fallbackLang: app.store.fallbackLang,
      minHeight: app.minHeight,
      pricing: app.pricing,
      currentVersion: app.currentVersion,
      ratingAvg: app.ratingAvg,
      ratingCount: app.ratingCount,
      installCount: app.installCount,
      developer: devCompany
        ? { name: devCompany.name as string, slug: devCompany.slug as string, hasPublicProfile: developerHasPublicProfile }
        : null,
    },
    reviews: reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      body: r.body,
      createdAt: r.createdAt,
      author: userMap.get(r.userId) ?? { name: null, image: null },
      isMine: r.userId === session.user.id,
    })),
    userReview: userReview ? { rating: userReview.rating, body: userReview.body } : null,
    installed,
    canReview,
  })
}
