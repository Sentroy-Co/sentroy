import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { sentroyAppModel, appInstallModel, companyModel } from "@workspace/db/models"
import { mintEmbedToken } from "@/lib/app-store/embed-token"

/**
 * POST { appId, companySlug } → taze embed kimlik token'ı (≤60s).
 * Yalnız: oturum + o şirkette aktif install + app approved/enabled. Profil
 * claim'leri app.requiredScopes ∩ install.consentedScopes ile sınırlı.
 * Her pencere açılışında çağrılır (cache'lenmez).
 */
export async function POST(req: NextRequest) {
  const session = await getAuthSession(req)
  if (!session) return jsonError("Unauthorized", 401)

  let body: { appId?: string; companySlug?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return jsonError("Invalid JSON", 400)
  }
  if (!body.appId || !body.companySlug) return jsonError("appId and companySlug required", 400)

  const company = await companyModel.findBySlug(body.companySlug)
  if (!company) return jsonError("Company not found", 404)

  const app = await sentroyAppModel.findByAppId(body.appId)
  if (!app || app.status !== "approved" || !app.enabled) return jsonError("App not available", 404)
  if (app.authMode === "none") return jsonError("App does not use Sentroy identity", 400)

  // Aktif install zorunlu — kurulu olmayan app'e token verilmez.
  const install = await appInstallModel.findActive(session.user.id, app.id, company.id)
  if (!install) return jsonError("App not installed", 403)

  // Profil claim'leri: app'in istediği VE kullanıcının onayladığı scope kesişimi.
  const granted = new Set(app.requiredScopes.filter((s) => install.consentedScopes.includes(s)))
  const u = session.user as { email?: string | null; name?: string | null; image?: string | null }

  const minted = mintEmbedToken({
    userId: session.user.id,
    appId: app.appId,
    audience: app.jwksAudience ?? app.embedOrigin,
    companyId: company.id,
    companySlug: company.slug,
    email: granted.has("email") ? u.email ?? null : null,
    name: granted.has("profile") ? u.name ?? null : null,
    picture: granted.has("profile") ? u.image ?? null : null,
  })

  return jsonSuccess({ token: minted.token, expiresIn: minted.expiresIn })
}
