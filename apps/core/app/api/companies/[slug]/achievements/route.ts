export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { getDb } from "@workspace/db/client"

/**
 * GET /api/companies/[slug]/achievements — Sentroy OS "Başarımlar" durumu.
 *
 * Yalnız session (dashboard) erişimi; aktif üyelik yeter. Şirket verisinden
 * başarım durumlarını TEK istekte hesaplar, `{ done: { <id>: boolean } }`
 * döner — metin/ikon client kataloğunda
 * (apps/core/components/os/achievements/catalog.ts).
 *
 * Sinyaller iki gruptur:
 *  1. Mongo "var mı" sayımları — countDocuments({...}, { limit: 1 }) ile
 *     hafif tutulur; hepsi paralel.
 *  2. Mail grubu — domain/mailbox/template/log verisi mail-server'da yaşar
 *     (Mongo'da mirror yok). Company mail'e PROVISION EDİLMİŞSE
 *     (`sentroyApiKey` dolu) mail app'in kendi endpoint'lerine cookie
 *     forward edilerek paralel sorulur. Provision edilmemişse fan-out
 *     yapılmaz (mail app'e ilk istek lazy provisioning tetiklerdi — bir
 *     achievements poll'unun yan etkisi olmamalı) → mail başarımları false.
 *     Mail app permission'a göre 403 dönebilir (ör. domain yetkisiz üye) →
 *     o başarım false görünür; widget/pencere sessizce tolere eder.
 */

/** Mongo "≥1 kayıt var mı" — limit:1 ile ucuz. */
async function exists(
  db: Awaited<ReturnType<typeof getDb>>,
  collection: string,
  filter: Record<string, unknown>,
): Promise<boolean> {
  try {
    return (await db.collection(collection).countDocuments(filter, { limit: 1 })) > 0
  } catch {
    return false
  }
}

/** Linear app'in inbox-count endpoint'inden sayacı çek — hata/timeout → null.
 *  NOT: bu UNREAD (görülmemiş) panel talep sayısıdır; "ömür boyu ≥1 talep var
 *  mı" değil. Kullanıcı gelen kutusunu görünce 0'a döner (bkz. rapor/caveat).
 *  first-request için telegram sinyaliyle OR'lanır. */
async function fetchLinearCount(
  base: string,
  slug: string,
  cookie: string,
): Promise<number | null> {
  try {
    const res = await fetch(`${base}/api/companies/${slug}/inbox-count`, {
      headers: { cookie },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const json = (await res.json().catch(() => null)) as { data?: { count?: number } } | null
    return typeof json?.data?.count === "number" ? json.data.count : null
  } catch {
    return null
  }
}

/** Mail app endpoint'inden diziyi çek — hata/timeout/403 → null. */
async function fetchMailList(
  base: string,
  slug: string,
  path: string,
  cookie: string,
): Promise<unknown[] | null> {
  try {
    const res = await fetch(`${base}/api/companies/${slug}${path}`, {
      headers: { cookie },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const json = (await res.json().catch(() => null)) as { data?: unknown } | null
    const data = json?.data
    if (Array.isArray(data)) return data
    // SDK bazı listelerde { items: [...] } / { logs: [...] } shape'i dönebilir.
    if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>
      if (Array.isArray(obj.items)) return obj.items
      if (Array.isArray(obj.logs)) return obj.logs
    }
    return null
  } catch {
    return null
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug)
  if ("error" in access) return access.error

  const { companyId, company } = access
  const db = await getDb()

  // --- Mail grubu fan-out (yalnız provision edilmiş şirketlerde) ----------
  const mailBase = (
    process.env.MAIL_APP_URL ||
    process.env.NEXT_PUBLIC_MAIL_APP_URL ||
    ""
  ).replace(/\/+$/, "")
  const mailProvisioned =
    typeof company.sentroyApiKey === "string" && company.sentroyApiKey.length > 0
  const cookie = request.headers.get("cookie") ?? ""

  const mailFanout: Promise<[
    unknown[] | null,
    unknown[] | null,
    unknown[] | null,
    unknown[] | null,
  ]> =
    mailBase && mailProvisioned && cookie
      ? Promise.all([
          fetchMailList(mailBase, slug, "/domains", cookie),
          fetchMailList(mailBase, slug, "/mailboxes", cookie),
          fetchMailList(mailBase, slug, "/templates", cookie),
          fetchMailList(mailBase, slug, "/logs?limit=1&page=1", cookie),
        ])
      : Promise.resolve([null, null, null, null])

  // --- Linear fan-out — Linear bağlı (apiKeyCipher dolu) şirketlerde ------
  // Panel'den (Linear API) açılan talepler Mongo'da YAŞAMAZ; mail deseniyle
  // linear app'in inbox-count endpoint'ine cookie-forward edip count>0'ı
  // first-request için telegram sinyaliyle OR'la.
  const linearBase = (
    process.env.LINEAR_APP_URL ||
    process.env.NEXT_PUBLIC_LINEAR_APP_URL ||
    ""
  ).replace(/\/+$/, "")
  const linearSettings = await db
    .collection("linear_settings")
    .findOne({ companyId }, { projection: { apiKeyCipher: 1 } })
    .catch(() => null)
  const linearConnected =
    typeof linearSettings?.apiKeyCipher === "string" &&
    linearSettings.apiKeyCipher.length > 0
  const linearCountP: Promise<number | null> =
    linearBase && linearConnected && cookie
      ? fetchLinearCount(linearBase, slug, cookie)
      : Promise.resolve(null)

  // --- Mongo sayımları (hepsi paralel, limit:1) ---------------------------
  const [
    hasSecondMember,
    hasPendingInvite,
    hasAccessToken,
    hasPost,
    hasNote,
    hasBucket,
    hasMedia,
    hasWaNumber,
    hasWaSend,
    hasLinearRequest,
    hasOauthClient,
    hasAuthProject,
    hasStudioProject,
    [domains, mailboxes, templates, logs],
    linearCount,
  ] = await Promise.all([
    db
      .collection("company_members")
      .countDocuments({ companyId, status: "active" }, { limit: 2 })
      .then((n) => n > 1)
      .catch(() => false),
    exists(db, "company_invitations", { companyId, status: "pending" }),
    exists(db, "access_tokens", { companyId }),
    exists(db, "social_posts", { companyId }),
    exists(db, "notes", { companyId }),
    exists(db, "buckets", { companyId }),
    exists(db, "media", { companyId }),
    // Bağlanmış (veya geçmişte bağlanıp numarası kaydedilmiş) oturum.
    exists(db, "whatsapp_sessions", {
      companyId,
      $or: [{ status: "connected" }, { phoneNumber: { $ne: null } }],
    }),
    exists(db, "whatsapp_send_logs", { companyId }),
    exists(db, "linear_telegram_requests", { companyId }),
    exists(db, "oauth_clients", { companyId }),
    exists(db, "auth_projects", { companyId }),
    exists(db, "studio_projects", { companyId }),
    mailFanout,
    linearCountP,
  ])

  const done: Record<string, boolean> = {
    // getting-started (core)
    "invite-teammate": hasSecondMember || hasPendingInvite,
    "create-access-token": hasAccessToken,
    "set-company-logo":
      typeof company.avatarUrl === "string" && company.avatarUrl.length > 0,
    "first-post": hasPost,
    "first-note": hasNote,
    // mail (mail-server verisi — fan-out başarısızsa false)
    "register-domain": (domains?.length ?? 0) > 0,
    "verify-domain": (domains ?? []).some(
      (d) => (d as { status?: string } | null)?.status === "active",
    ),
    "create-mailbox": (mailboxes?.length ?? 0) > 0,
    "send-first-email": (logs?.length ?? 0) > 0,
    "create-template": (templates?.length ?? 0) > 0,
    // storage
    "create-bucket": hasBucket,
    "upload-first-file": hasMedia,
    // whatsapp
    "connect-number": hasWaNumber,
    "send-first-message": hasWaSend,
    // linear
    "connect-workspace": linearConnected,
    // Telegram bot talebi VEYA panel/API talebi (inbox-count>0) — OR.
    "first-request": hasLinearRequest || (linearCount ?? 0) > 0,
    // auth
    "create-oauth-client": hasOauthClient,
    "create-auth-project": hasAuthProject,
    // studio
    "first-project": hasStudioProject,
  }

  return jsonSuccess({ done })
}
