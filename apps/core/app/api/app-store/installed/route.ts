import { NextRequest } from "next/server"
import { ObjectId } from "mongodb"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { sentroyAppModel, appInstallModel, companyModel, companyMemberModel } from "@workspace/db/models"
import { firstPartyIdFromInstall, isFirstPartyAppId } from "@/lib/app-store/first-party-catalog"

/**
 * GET ?company=slug → kullanıcının o şirkette kurulu (active) uygulamaları.
 *
 * İki grup döner:
 *  - `apps`: 3rd-party App Store uygulamaları (onaylı/enabled). OS bunları
 *    dynamicApps olarak enjekte edip Launchpad/dock'ta gösterir + güvenli
 *    iframe'de açar.
 *  - `firstPartyIds`: kurulu first-party (status/whatsapp/studio/opencut) ham
 *    id listesi. OS gating bunu okuyup ilgili app'i dock/launchpad/spotlight'ta
 *    gösterir (kurulu değilse gizler).
 */
export async function GET(req: NextRequest) {
  const session = await getAuthSession(req)
  if (!session) return jsonError("Unauthorized", 401)

  const slug = new URL(req.url).searchParams.get("company")
  if (!slug) return jsonError("company required", 400)

  const company = await companyModel.findBySlug(slug)
  if (!company) return jsonError("Company not found", 404)

  const member = await companyMemberModel.findByCompanyAndUser(company.id, session.user.id)
  if (!member || member.status !== "active") return jsonError("Forbidden", 403)

  const installs = await appInstallModel.findByUserCompany(session.user.id, company.id)

  // First-party (sentinel `fp:<id>`) kurulumlarını ayır → gating id listesi.
  const firstPartyIds = installs
    .map((inst) => firstPartyIdFromInstall(inst.appId))
    .filter((id): id is string => id !== null && isFirstPartyAppId(id))

  // 3rd-party — appId geçerli ObjectId (DB app.id) olanlar; `fp:` sentinel'leri
  // findById'ye VERME (invalid ObjectId → BSONError).
  const thirdPartyInstalls = installs.filter((inst) => ObjectId.isValid(inst.appId))
  const apps = (
    await Promise.all(
      thirdPartyInstalls.map(async (inst) => {
        const app = await sentroyAppModel.findById(inst.appId)
        if (!app || app.status !== "approved" || !app.enabled) return null
        return {
          appId: app.appId,
          name: app.name,
          slug: app.slug,
          logoUrl: app.appearance.logoUrl,
          color: app.appearance.color,
          embedUrl: app.embedUrl,
          embedOrigin: app.embedOrigin,
          authMode: app.authMode,
          sandboxAttr: app.sandboxAttr,
          allowAttr: app.allowAttr,
          injectedParams: app.injectedParams,
          supportedLangs: app.store.supportedLangs,
          fallbackLang: app.store.fallbackLang,
          minHeight: app.minHeight,
        }
      }),
    )
  ).filter(Boolean)

  return jsonSuccess({ apps, firstPartyIds })
}
