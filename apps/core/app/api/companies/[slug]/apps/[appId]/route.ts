export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import { sentroyAppModel, appInstallModel } from "@workspace/db/models"

/** GET — bu şirkete ait tek app detayı (appId = DB id). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; appId: string }> }) {
  const { slug, appId } = await params
  const ctx = await assertCompanyAccess(req, slug, "app-store.manage")
  if ("error" in ctx) return ctx.error
  const app = await sentroyAppModel.findById(appId)
  if (!app || app.developerCompanyId !== ctx.companyId) return jsonError("Not found", 404)
  return jsonSuccess({ app })
}

/**
 * DELETE — geri çek / sil. YALNIZ yayındaki PUBLIC app (approved+public)
 * yayından kaldırılır (enabled=false) — başka şirketlerin kurulu
 * kullanıcılarını korumak için kaydı silmeyiz. Şirkete-özel (private) app'te
 * korunacak dış kullanıcı yoktur → kaydı tamamen sil + kurulum kayıtlarını
 * temizle. pending/rejected/draft de tamamen silinir.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string; appId: string }> }) {
  const { slug, appId } = await params
  const ctx = await assertCompanyAccess(req, slug, "app-store.manage")
  if ("error" in ctx) return ctx.error
  const app = await sentroyAppModel.findById(appId)
  if (!app || app.developerCompanyId !== ctx.companyId) return jsonError("Not found", 404)

  const unpublishOnly = app.status === "approved" && app.visibility === "public"
  if (unpublishOnly) {
    await sentroyAppModel.update(appId, { enabled: false })
  } else {
    await sentroyAppModel.remove(appId)
    await appInstallModel.removeByApp(app.id)
  }

  await audit({
    userId: ctx.session!.user.id,
    companyId: ctx.companyId,
    action: unpublishOnly ? "app.unpublish" : "app.delete",
    resource: "app",
    resourceId: appId,
    details: { appId: app.appId, previousStatus: app.status, visibility: app.visibility },
    request: req,
  })

  return jsonSuccess({ ok: true, deleted: !unpublishOnly })
}
