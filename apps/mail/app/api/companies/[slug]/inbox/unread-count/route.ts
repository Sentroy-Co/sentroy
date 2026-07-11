export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForInbox } from "@/lib/inbox-access"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"
import { countBlockedUnread } from "@/lib/inbox-block-purge"
import { inboxBlockModel } from "@workspace/db/models"
import {
  filterAccessibleMailboxes,
  hasAnyInboxAccess,
} from "@workspace/auth/server/permissions"
import type { CompanyMember } from "@workspace/db/types"

/**
 * GET /api/companies/[slug]/inbox/unread-count?mailbox=foo@bar.com
 *
 * Notifications badge için sayım.
 *
 * Iki mod:
 *  - `?mailbox=…` verildi → tek kutuda unread count
 *  - mailbox yok → kullanıcının erişebildiği TÜM kutuların paralel toplamı
 *
 * Önemli kararlar:
 *  - sentroy-mail-server `mailbox` query'si geçilmediğinde sistem fallback
 *    IMAP_USER hesabını sorgular (şirketin gerçek kutuları değil), bu
 *    yüzden no-mailbox akışında biz kutuları enumerate edip her biri için
 *    ayrı ayrı çağırıyoruz.
 *  - SDK'nın `inbox.list` cevabı tip seviyesinde sadece `data` döner ama
 *    server `meta.totalCount` da yollar — limit'le sınırlı `data.length`
 *    yerine bu authoritative değeri okuyoruz (1000+ unread'da gerçek
 *    sayı için).
 *  - Tek bir mailbox fail ederse o sayım 0 sayılır, diğerleri toplanır
 *    (badge değer gösterir, fail bir kutu UI'yi kırmaz).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const mailbox = request.nextUrl.searchParams.get("mailbox") || undefined

  // ── Mode 1: tek mailbox ──────────────────────────────────────────────
  if (mailbox) {
    const result = await getSentroyForInbox(request, slug, mailbox)
    if ("error" in result && result.error) return result.error
    const count = await netUnreadCount(
      result.sentroy!,
      result.companyId,
      mailbox,
    )
    return jsonSuccess({ count })
  }

  // ── Mode 2: aggregate — kullanıcının erişebildiği tüm kutular ───────
  // inbox.view permission yoksa cevap 0 (kullanıcının zaten görüntüleyeceği
  // bir badge yok); fail-safe.
  const result = await getSentroyForCompany(request, slug)
  if ("error" in result && result.error) return result.error
  if (!result.session) return jsonSuccess({ count: 0 })

  const member = (result.member ?? null) as Pick<
    CompanyMember,
    "role" | "status" | "permissions"
  > | null
  const systemRole = (result.session.user as { role?: string } | undefined)
    ?.role

  if (!hasAnyInboxAccess(member, systemRole)) {
    return jsonSuccess({ count: 0 })
  }

  let mailboxes: { email: string }[] = []
  try {
    const list = await result.sentroy!.mailboxes.list()
    const items = (list.data ?? []) as { email?: string }[]
    mailboxes = filterAccessibleMailboxes(items, member, systemRole).filter(
      (m): m is { email: string } => typeof m.email === "string",
    )
  } catch {
    return jsonSuccess({ count: 0 })
  }

  if (mailboxes.length === 0) return jsonSuccess({ count: 0 })

  // Paralel — IMAP bağlantı havuzu mail-server'da yönetilir, biz ufak
  // (typically 1-5) bir fan-out atıyoruz.
  const counts = await Promise.all(
    mailboxes.map((m) =>
      netUnreadCount(result.sentroy!, result.companyId, m.email),
    ),
  )
  const total = counts.reduce((a, b) => a + b, 0)
  return jsonSuccess({ count: total })
}

/**
 * Mail-server unread toplamı, o mailbox için aktif inbox-block'lara ait
 * okunmamış maillerin sayısı düşülerek. Block yoksa fast-path (ek çağrı yok).
 * Bloklanan göndericinin mailleri zaten purge ediliyor; bu, purge ile bir
 * sonraki temizlik arasındaki pencerede de badge'i doğru tutar.
 */
async function netUnreadCount(
  sentroy: SentroyLike,
  companyId: string | undefined,
  mailbox: string,
): Promise<number> {
  const total = await safeUnreadCount(sentroy, mailbox)
  if (!companyId || total === 0) return total
  let blockedSet: Set<string>
  try {
    const blocks = await inboxBlockModel.findActiveForMailbox(
      companyId,
      mailbox,
    )
    if (blocks.length === 0) return total
    blockedSet = new Set(blocks.map((b) => b.blockedEmail))
  } catch {
    return total
  }
  const blockedUnread = await countBlockedUnread(sentroy, mailbox, blockedSet)
  return Math.max(total - blockedUnread, 0)
}

/**
 * Tek mailbox için unread count — `meta.totalCount`'i tercih eder, yoksa
 * `data.length`'e düşer. Hata olursa 0 döner (badge'i kırmasın).
 */
type SentroyLike = NonNullable<
  Awaited<ReturnType<typeof getSentroyForCompany>>["sentroy"]
>

async function safeUnreadCount(
  sentroy: SentroyLike,
  mailbox: string,
): Promise<number> {
  try {
    // limit=1 — server-side IMAP search'ini count için optimize et;
    // server meta.totalCount'i her zaman gerçek sayıyla döner.
    const raw = await sentroy.inbox.list({
      mailbox,
      unread: true,
      limit: 1,
    })
    const res = raw as unknown as {
      data?: unknown[]
      meta?: { totalCount?: number }
    }
    if (typeof res.meta?.totalCount === "number") {
      return res.meta.totalCount
    }
    return res.data?.length ?? 0
  } catch {
    return 0
  }
}
