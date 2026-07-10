import { NextRequest } from "next/server"
import { ObjectId } from "mongodb"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getDb } from "@workspace/db/client"
import { sentroyAppModel, oauthClientModel } from "@workspace/db/models"
import { sendSystemMailEvent } from "@workspace/auth/server/system-mail-events"
import { audit } from "@workspace/console/lib/audit"
import { verifyOriginOwnership } from "@/lib/app-store/verify-origin"

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_CORE_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://sentroy.com"
}

async function devEmail(userId: string): Promise<string | null> {
  if (!ObjectId.isValid(userId)) return null
  const db = await getDb()
  const u = await db.collection("user").findOne({ _id: new ObjectId(userId) }, { projection: { email: 1 } })
  return (u?.email as string) ?? null
}

/**
 * Admin — onay aksiyonu. Body: { action: "approve"|"reject"|"suspend", reason? }.
 * approve: origin sahiplik doğrula → (oauth ise) OAuthClient üret (scope clamp)
 * → approved + enabled. reject: rejected + reason + mail. suspend: enabled=false.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession(req)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const { id } = await params
  const app = await sentroyAppModel.findById(id)
  if (!app) return jsonError("Not found", 404)

  let body: { action?: string; reason?: string; skipOriginVerification?: boolean }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return jsonError("Invalid JSON", 400)
  }
  const action = body.action
  const now = new Date()
  const base = baseUrl()

  if (action === "approve") {
    // 1) Origin sahiplik doğrulama (well-known). Operatör-curated app'lerde
    // (Sentroy'un kendi eklediği popüler public app — geliştirici/domain yok)
    // admin `skipOriginVerification` ile atlayabilir. Yalnız system admin
    // (route zaten role==="admin" gate'li); audit'e işlenir.
    const skipVerify = body.skipOriginVerification === true
    if (!skipVerify) {
      const v = await verifyOriginOwnership(app.embedOrigin, app.verificationToken)
      if (!v.ok) {
        return jsonError(`Origin verification failed: ${v.reason}. Ask the developer to serve /.well-known/sentroy-app-verification.txt with the token — or use "Force approve" for a Sentroy-curated app.`, 400)
      }
    }

    // 2) OAuth modunda client üret — scope manifest requiredScopes'a clamp'li.
    let oauthClientId = app.oauthClientId
    if (app.authMode === "oauth" && !oauthClientId) {
      const { client } = await oauthClientModel.create({
        name: app.name,
        description: `Sentroy App Store — ${app.name}`,
        redirectUris: [app.embedUrl],
        allowedScopes: app.requiredScopes.length ? app.requiredScopes : ["openid", "profile"],
        homepageUrl: app.embedOrigin,
        logoUrl: app.appearance.logoUrl,
        companyId: app.developerCompanyId,
        createdBy: session.user.id,
      })
      oauthClientId = client.clientId
    }

    await sentroyAppModel.update(id, {
      status: "approved",
      enabled: true,
      originVerifiedAt: now,
      reviewedByUserId: session.user.id,
      reviewedAt: now,
      rejectionReason: null,
      oauthClientId,
    })

    const email = app.submittedByUserId ? await devEmail(app.submittedByUserId) : null
    if (email) {
      void sendSystemMailEvent("app.approved", {
        to: email,
        variables: { appName: app.name, storeUrl: `${base}/en/store/${app.slug}` },
      })
    }

    await audit({
      userId: session.user.id,
      action: "app.approve",
      resource: "app",
      resourceId: id,
      details: { appId: app.appId, oauth: app.authMode === "oauth", originVerificationSkipped: skipVerify },
      request: req,
    })
    return jsonSuccess({ ok: true, status: "approved" })
  }

  if (action === "reject") {
    const reason = (body.reason ?? "").trim()
    if (!reason) return jsonError("reason is required to reject", 400)
    await sentroyAppModel.update(id, {
      status: "rejected",
      reviewedByUserId: session.user.id,
      reviewedAt: now,
      rejectionReason: reason,
    })
    const email = app.submittedByUserId ? await devEmail(app.submittedByUserId) : null
    if (email) {
      void sendSystemMailEvent("app.rejected", {
        to: email,
        variables: { appName: app.name, reason, dashboardUrl: `${base}/en/d/${app.slug}/apps` },
      })
    }
    await audit({
      userId: session.user.id,
      action: "app.reject",
      resource: "app",
      resourceId: id,
      details: { appId: app.appId, reason },
      request: req,
    })
    return jsonSuccess({ ok: true, status: "rejected" })
  }

  if (action === "suspend") {
    await sentroyAppModel.update(id, {
      status: "suspended",
      enabled: false,
      reviewedByUserId: session.user.id,
      reviewedAt: now,
      rejectionReason: (body.reason ?? "").trim() || null,
    })
    await audit({
      userId: session.user.id,
      action: "app.suspend",
      resource: "app",
      resourceId: id,
      details: { appId: app.appId },
      request: req,
    })
    return jsonSuccess({ ok: true, status: "suspended" })
  }

  return jsonError("unknown action", 400)
}
