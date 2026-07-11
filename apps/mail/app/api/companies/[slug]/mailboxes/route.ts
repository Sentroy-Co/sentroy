export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"
import { syncOnMailboxCreate } from "@/lib/mailbox-account-sync"
import {
  filterAccessibleMailboxes,
  hasAnyInboxAccess,
  hasPermission,
} from "@workspace/auth/server/permissions"
import { catchAllRuleModel } from "@workspace/db/models"
import type { CompanyMember } from "@workspace/db/types"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  // Listeleme icin: mailboxes.manage (yonetici) VEYA herhangi bir inbox yetkisi
  // (inbox.view / inbox.mailbox:<email>) yeterli. Response kullanici yetkilerine
  // gore filtrelenir — kisi sadece erisebilecegi kutulari gorur.
  const result = await getSentroyForCompany(request, slug)
  if ("error" in result && result.error) return result.error

  const member = result.member as Pick<
    CompanyMember,
    "role" | "status" | "permissions"
  > | null
  const systemRole = (result.session?.user as { role?: string } | undefined)
    ?.role

  if (!result.isTokenAccess) {
    const isTeamManager = await hasPermission(
      result.session!,
      slug,
      "members.manage",
    )

    if (!hasAnyInboxAccess(member, systemRole) && !isTeamManager) {
      return jsonError("Insufficient permissions", 403)
    }
  }

  try {
    const mailboxes = await result.sentroy!.mailboxes.list()
    const filtered = result.isTokenAccess
      ? mailboxes.data ?? []
      : filterAccessibleMailboxes(mailboxes.data ?? [], member, systemRole)

    // Catch-all rozeti için lookup. Aktif rule'ların target email'ine
    // sahip mailbox'lar `isCatchAll: true` döner; UI rozet için kullanır.
    const rules = await catchAllRuleModel.findActiveByCompanyId(
      result.companyId!,
    )
    const catchAllEmails = new Set(rules.map((r) => r.targetMailboxEmail))
    const enriched = filtered.map((m) => ({
      ...m,
      isCatchAll: catchAllEmails.has(m.email),
    }))

    return jsonSuccess(enriched)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to list mailboxes"
    return jsonError(message, 500)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  let body: { email?: string; password?: string; domainId?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.email || typeof body.email !== "string" || !body.email.trim()) {
    return jsonError("Email is required")
  }

  if (
    !body.password ||
    typeof body.password !== "string" ||
    body.password.length < 8
  ) {
    return jsonError("Password must be at least 8 characters")
  }

  if (
    !body.domainId ||
    typeof body.domainId !== "string" ||
    !body.domainId.trim()
  ) {
    return jsonError("Domain is required")
  }

  // Mailbox olusturma yonetim yetkisi gerektirir (kapsama bakmaz)
  const result = await getSentroyForCompany(request, slug, "mailboxes.manage")
  if ("error" in result && result.error) return result.error

  // Plan limiti kontrolu
  const maxMailboxes = (result.company as { maxMailboxes?: number }).maxMailboxes ?? 0
  if (maxMailboxes > 0) {
    try {
      const existing = await result.sentroy!.mailboxes.list()
      const count = existing.data?.length ?? 0
      if (count >= maxMailboxes) {
        return jsonError(
          `Mailbox limit reached (${count}/${maxMailboxes})`,
          403,
        )
      }
    } catch {
      // Sayim basarisiz olursa limiti atla — olusturma denemesine izin ver
    }
  }

  const trimmedEmail = body.email.trim()

  try {
    const created = await result.sentroy!.mailboxes.create({
      email: trimmedEmail,
      password: body.password,
      domainId: body.domainId.trim(),
    })

    // Sentroy auth user account + company member sync. Best-effort —
    // mailbox sentroy mail-server'da yaratıldı, sync hatası akışı
    // kırmıyor. UI response'undaki accountSync'i okuyup uyarı
    // gösterebilir; toast: "Mail kutusu oluşturuldu, hesap senkronu
    // başarısız: …".
    const sync = await syncOnMailboxCreate({
      email: trimmedEmail,
      password: body.password,
      companyId: result.companyId!,
      // Mailbox'ın bağlı olduğu domain id'sini permission scope'una ilet —
      // user yalnızca kendi mailbox'ının domain'ini görebilsin.
      domainId: body.domainId.trim(),
    })

    return jsonSuccess(
      {
        ...created.data,
        accountSync: sync,
      },
      201,
    )
  } catch (err: any) {
    console.error("[mailboxes:create]", err?.statusCode, err?.body || err?.message)
    const message =
      err instanceof Error ? err.message : "Failed to create mailbox"
    return jsonError(message, err?.statusCode || 500)
  }
}
