export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { parseManifest } from "@workspace/app-manifest"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import { sentroyAppModel, registryStateModel } from "@workspace/db/models"
import { sendSystemMailEvent } from "@workspace/auth/server/system-mail-events"
import { buildAppCreateInput, semverGt } from "@/lib/app-store/build-record"

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_CORE_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://sentroy.com"
}

/** GET — bu şirketin gönderdiği App Store uygulamaları. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx = await assertCompanyAccess(req, slug, "app-store.manage")
  if ("error" in ctx) return ctx.error
  const apps = await sentroyAppModel.findByCompany(ctx.companyId)
  return jsonSuccess({ apps })
}

/**
 * POST — manifest gönder/güncelle. Body = ham manifest JSON.
 * Doğrula → developer.companySlug'ı SERVER-side teyit et → varsa
 * (aynı şirkete ait) sürümü artırıp resubmit, yoksa oluştur → pending → mail.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx = await assertCompanyAccess(req, slug, "app-store.manage")
  if ("error" in ctx) return ctx.error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError("Invalid JSON", 400)
  }

  const parsed = parseManifest(body)
  if (!parsed.ok) {
    return jsonError(`Manifest invalid: ${parsed.issues.map((i) => `${i.path || "(root)"}: ${i.message}`).join("; ")}`, 422)
  }
  const m = parsed.manifest

  // developer.companySlug, URL'deki şirketle eşleşmeli — manifest'e güvenme.
  if (m.developer.companySlug !== slug) {
    return jsonError("manifest developer.companySlug must match this company", 422)
  }

  // Faz 5: registry namespace koruması — merkezi Sentroy katalogunun appId/slug'ını
  // yerel bir gönderim iddia edemez (blocklist/tombstone dahil). Registry satırı
  // yoksa (hosted pre-dogfood / registry-kapalı) bu kontrol asla tetiklenmez.
  {
    const regState = await registryStateModel.get()
    if (
      regState.blockedAppIds.includes(m.identity.id) ||
      regState.revokedTombstones.includes(m.identity.id)
    ) {
      return jsonError("This app id is reserved by the Sentroy app registry", 409)
    }
    const appIdOwner = await sentroyAppModel.findByAppId(m.identity.id)
    if (appIdOwner && appIdOwner.source === "registry") {
      return jsonError("This app id is reserved by the Sentroy app registry", 409)
    }
    const wantSlug = m.identity.slug ?? m.identity.id
    const slugReg = await sentroyAppModel.findBySlug(wantSlug)
    if (slugReg && slugReg.source === "registry" && slugReg.appId !== m.identity.id) {
      return jsonError("This slug is reserved by the Sentroy app registry", 409)
    }
  }

  const now = new Date()
  // ?review=0 → şirkete-özel kayıt (onaya gitmez, yalnız company üyeleri görür);
  // default → public mağaza için onaya gönder.
  const submitForReview = new URL(req.url).searchParams.get("review") !== "0"
  const existing = await sentroyAppModel.findByAppId(m.identity.id)

  // appId başka bir şirkete aitse reddet (taklit/çakışma).
  if (existing && existing.developerCompanyId !== ctx.companyId) {
    return jsonError("This app id is already registered by another company", 409)
  }
  // slug çakışması (farklı app aynı slug).
  const slugOwner = await sentroyAppModel.findBySlug(m.identity.slug ?? m.identity.id)
  if (slugOwner && slugOwner.appId !== m.identity.id) {
    return jsonError("This slug is already taken", 409)
  }

  const callerEmail = (ctx.session?.user as { email?: string } | undefined)?.email ?? null
  const dashboardUrl = `${baseUrl()}/en/d/${slug}/apps`

  let appId: string
  let action: string

  // Read-then-write yarışında (eşzamanlı submit veya registry sync) unique
  // appId/slug index'i E11000 fırlatır → temiz 409'a çevir (500 değil).
  const isDup = (err: unknown): boolean =>
    !!err && typeof err === "object" && (err as { code?: number }).code === 11000

  try {
    if (existing) {
      // Resubmit/update — sürüm monoton artmalı.
      if (!semverGt(existing.currentVersion, m.identity.version)) {
        return jsonError(`version must be greater than current (${existing.currentVersion})`, 422)
      }
      const fresh = buildAppCreateInput(m, {
        developerCompanyId: ctx.companyId,
        submittedByUserId: ctx.session!.user.id,
        source: "dashboard",
        submitForReview,
      }, now)
      // appId/createdAt immutable (update patch'inde yok) → spread'den ayıkla.
      // rest zaten status/visibility/reviewedBy/originVerifiedAt'i submitForReview'a
      // göre taşır (public→pending, private→approved).
      const { appId: _appId, createdAt: _createdAt, ...rest } = fresh
      void _appId
      void _createdAt
      await sentroyAppModel.update(existing.id, {
        ...rest,
        // Son N sürümü tut (16MB doc limitine karşı retention).
        versions: [...existing.versions, ...fresh.versions].slice(-sentroyAppModel.MAX_VERSION_HISTORY),
        installCount: existing.installCount,
        ratingAvg: existing.ratingAvg,
        ratingCount: existing.ratingCount,
      })
      appId = existing.id
      action = "app.resubmit"
    } else {
      const created = await sentroyAppModel.create(
        buildAppCreateInput(m, {
          developerCompanyId: ctx.companyId,
          submittedByUserId: ctx.session!.user.id,
          source: "dashboard",
          submitForReview,
        }, now),
      )
      appId = created.id
      action = submitForReview ? "app.submit" : "app.save-private"
    }
  } catch (err) {
    if (isDup(err)) return jsonError("This app id or slug is already registered", 409)
    throw err
  }

  // Mail yalnız review'a gönderince (private kayıtta gerek yok).
  if (callerEmail && submitForReview) {
    void sendSystemMailEvent("app.submission.received", {
      to: callerEmail,
      variables: { appName: m.identity.name, dashboardUrl },
    })
  }

  await audit({
    userId: ctx.session!.user.id,
    companyId: ctx.companyId,
    action,
    resource: "app",
    resourceId: appId,
    details: { appId: m.identity.id, version: m.identity.version },
    request: req,
  })

  return jsonSuccess({ id: appId, status: submitForReview ? "pending" : "approved" }, existing ? 200 : 201)
}
