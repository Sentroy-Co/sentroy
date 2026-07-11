export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { SentroyHttpError } from "@sentroy-co/sdk"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"
import { catchAllRuleModel } from "@workspace/db/models"
import { filterAccessibleMailboxes } from "@workspace/auth/server/permissions"
import type { CompanyMember } from "@workspace/db/types"
import { syncOnMailboxCreate } from "@/lib/mailbox-account-sync"

/**
 * Catch-all kuralı yönetimi. Her domain için **bir** aktif rule.
 *
 * Politika: catch-all aktifleşirken aynı domain'deki diğer specific
 * mailbox'lar **silinir** (kullanıcı tercihi). Anchor mailbox (catch-all'ın
 * yöneldiği) hariç. Bu sayede gerçekten "tüm mail tek kutuya" akar; specific
 * mailbox priority'si gibi backend davranışlarına bağımlı kalmaz.
 *
 * Frontend bu silmeden önce kullanıcıyı uyaran bir confirm dialog gösterir;
 * endpoint'te `confirmDeleteOthers: true` flag'i ile geliyorsa silme yapılır.
 *
 * Akış:
 *   1. Domain validate (kullanıcı erişebiliyor mu)
 *   2. Anchor mailbox: gönderilen email mevcut mailbox'a ait mi? Yoksa
 *      yarat (password ile).
 *   3. Aynı domain'deki diğer specific mailbox'ları sil (anchor hariç)
 *      — `confirmDeleteOthers === true` ise. False ise: count döndür,
 *      kullanıcı dialog'da confirm etmeden silmeyi atla.
 *   4. Backend `setCatchAll(domainId, anchorEmail)` çağır
 *   5. DB'de `catchAllRuleModel.upsertRule` yaz
 */

interface CatchAllPostBody {
  domainId?: string
  targetMailboxEmail?: string
  password?: string
  confirmDeleteOthers?: boolean
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const result = await getSentroyForCompany(request, slug)
  if ("error" in result && result.error) return result.error

  const rules = await catchAllRuleModel.findByCompanyId(result.companyId!)

  // Token access (SDK) tüm rule'ları görür — scope company-bazlı.
  // Session access: rule'ları kullanıcının erişebildiği target mailbox'a
  // göre filtrele. Sadece `inbox.mailbox:specific@x` permission'ı olan
  // member'ın compose'unda başka catch-all hedeflerini görmemesi
  // gerekir — yetkisi olmadığı bir adresten send göstermek anlamsız +
  // information leak.
  if (result.isTokenAccess) return jsonSuccess(rules)

  const member = result.member as Pick<
    CompanyMember,
    "role" | "status" | "permissions"
  > | null
  const systemRole = (result.session?.user as { role?: string } | undefined)
    ?.role
  const accessible = filterAccessibleMailboxes(
    rules.map((r) => ({ ...r, email: r.targetMailboxEmail })),
    member,
    systemRole,
  )
  return jsonSuccess(accessible)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  let body: CatchAllPostBody
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.domainId) return jsonError("domainId is required")
  if (!body.targetMailboxEmail) {
    return jsonError("targetMailboxEmail is required")
  }
  if (!body.targetMailboxEmail.includes("@")) {
    return jsonError("targetMailboxEmail must be a full address")
  }

  const result = await getSentroyForCompany(request, slug, "mailboxes.manage")
  if ("error" in result && result.error) return result.error

  // sentroy client'ı `getSentroyForCompany` zaten provision edip dönüyor;
  // `Company` import'una ihtiyaç kalmadı.

  // Domain validate — kullanıcının kendi domain'i mi (own veya assigned)?
  let domainName: string
  try {
    const dRes = await result.sentroy!.domains.get(body.domainId)
    if (!dRes.data?.domain) return jsonError("Domain not found", 404)
    domainName = dRes.data.domain
  } catch {
    return jsonError("Domain not accessible from this company", 403)
  }

  // Email domain match kontrolü — anchor mailbox bu domain'e ait olmalı
  const anchorEmail = body.targetMailboxEmail.trim().toLowerCase()
  const [, anchorDomain] = anchorEmail.split("@")
  if (anchorDomain !== domainName.toLowerCase()) {
    return jsonError(
      `targetMailboxEmail must end with @${domainName}`,
      400,
    )
  }

  // Mevcut mailbox'ları çek (domain için)
  let allMailboxes: Array<{ email: string; domainId?: string }> = []
  try {
    const mRes = await result.sentroy!.mailboxes.list(body.domainId)
    allMailboxes = mRes.data ?? []
  } catch {
    return jsonError("Failed to list mailboxes", 502)
  }

  const anchorExists = allMailboxes.some((m) => m.email === anchorEmail)
  const conflicting = allMailboxes.filter((m) => m.email !== anchorEmail)

  // Frontend confirm flag'i yoksa: count döndür, kullanıcı dialog'da
  // confirm etsin sonra tekrar çağırsın. 409 + ek payload — `jsonError`
  // imzası 2 argüman olduğundan inline NextResponse.
  if (!body.confirmDeleteOthers && conflicting.length > 0) {
    return NextResponse.json(
      {
        data: null,
        error: "confirmDeleteOthers required",
        conflictingMailboxes: conflicting.map((m) => m.email),
        anchorExists,
      },
      { status: 409 },
    )
  }

  // Anchor yarat (yoksa)
  if (!anchorExists) {
    if (!body.password || body.password.length < 8) {
      return jsonError(
        "password (>=8 chars) required to create anchor mailbox",
        400,
      )
    }
    try {
      await result.sentroy!.mailboxes.create({
        email: anchorEmail,
        password: body.password,
        domainId: body.domainId,
      })
      // Auth user account + member sync (best-effort) — anchor mailbox
      // owner'ı da kendi inbox'ında yetkili olsun.
      await syncOnMailboxCreate({
        email: anchorEmail,
        password: body.password,
        companyId: result.companyId!,
        domainId: body.domainId,
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Anchor mailbox creation failed"
      return jsonError(message, 502)
    }
  }

  // Conflicting mailbox'ları sil
  if (conflicting.length > 0) {
    for (const m of conflicting) {
      try {
        await result.sentroy!.mailboxes.delete(m.email)
      } catch (err) {
        console.warn(
          `[catch-all] failed to delete ${m.email}:`,
          err instanceof Error ? err.message : err,
        )
        // Kısmi silme: bir mailbox başarısız olursa devam et; backend
        // catch-all aktivasyonundan sonra zaten yeni mail bu kutuya
        // düşmeyecek (catch-all'a düşer), kullanıcı admin paneli'nden
        // manual silebilir.
      }
    }
  }

  // Backend catch-all set
  try {
    await result.sentroy!.domains.setCatchAll(body.domainId, {
      mailboxEmail: anchorEmail,
    })
  } catch (err) {
    if (err instanceof SentroyHttpError) {
      return jsonError(
        `Backend catch-all set failed (${err.statusCode}): ${err.message}`,
        502,
      )
    }
    return jsonError(
      err instanceof Error ? err.message : "Backend catch-all set failed",
      502,
    )
  }

  // DB rule yaz
  const rule = await catchAllRuleModel.upsertRule({
    companyId: result.companyId!,
    sentroyDomainId: body.domainId,
    domainName,
    targetMailboxEmail: anchorEmail,
    targetMailboxId: null,
    createdBy: result.callerUserId ?? "token",
  })

  return jsonSuccess(rule, 201)
}

/**
 * Catch-all'ı kaldırır. Anchor mailbox silinmez (user data var olabilir);
 * sadece backend'de catch-all routing kapatılır + DB row silinir.
 * Conflicting mailbox'lar da geri gelmez (silindiler) — user manuel
 * yeniden yaratır.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  const url = new URL(request.url)
  const domainId = url.searchParams.get("domainId")
  if (!domainId) return jsonError("domainId query param required")

  const result = await getSentroyForCompany(request, slug, "mailboxes.manage")
  if ("error" in result && result.error) return result.error

  // sentroy client'ı `getSentroyForCompany` zaten provision edip dönüyor;
  // `Company` import'una ihtiyaç kalmadı.

  try {
    await result.sentroy!.domains.setCatchAll(domainId, { mailboxEmail: null })
  } catch (err) {
    if (err instanceof SentroyHttpError) {
      return jsonError(
        `Backend catch-all unset failed (${err.statusCode}): ${err.message}`,
        502,
      )
    }
    return jsonError(
      err instanceof Error ? err.message : "Backend catch-all unset failed",
      502,
    )
  }

  await catchAllRuleModel.removeByDomainId(domainId)
  return jsonSuccess({ message: "Catch-all removed" })
}
