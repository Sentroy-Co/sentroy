import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { inboxBlockModel } from "@workspace/db/models"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"
import { purgeBlockedSenders } from "@/lib/inbox-block-purge"

/**
 * GET  /api/companies/[slug]/inbox-blocks
 *      List company-level blocks. Mailbox=null => company-wide;
 *      mailbox=<email> => o mailbox'a özel.
 *
 * POST /api/companies/[slug]/inbox-blocks
 *      Body: { email, mailbox?, reason? } — yeni block veya mevcut'u
 *      güncelle (idempotent).
 *
 * Permission: `inbox.view` — kullanıcı kendi inbox'ını yönetebiliyorsa
 * blocklist'i de yönetebilsin (gönderim değil, görünürlük kararı).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "inbox.view")
  if ("error" in access) return access.error

  const url = new URL(request.url)
  const mailbox = url.searchParams.get("mailbox")

  const rows = mailbox
    ? await inboxBlockModel.findActiveForMailbox(access.companyId, mailbox)
    : await inboxBlockModel.findByCompany(access.companyId)
  return jsonSuccess(rows)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "inbox.view")
  if ("error" in access) return access.error

  let body: {
    email?: string
    mailbox?: string | null
    reason?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const email = (body.email ?? "").trim()
  if (!email || !email.includes("@")) {
    return jsonError("email (full address) is required")
  }

  const block = await inboxBlockModel.block({
    companyId: access.companyId,
    blockedEmail: email,
    mailbox: body.mailbox ?? null,
    reason: body.reason ?? null,
    addedBy: access.callerUserId,
  })

  // Güvenlik: bloklanan göndericinin MEVCUT maillerini mail-server'dan sil.
  // Best-effort — purge başarısız olsa da block oluşturulmuş kalır. Yalnız
  // session (dashboard) çağrılarında çalışır; token-only çağrıda atlanır.
  let purged = 0
  try {
    const proxy = await getSentroyForCompany(request, slug)
    if (!("error" in proxy) && proxy.sentroy) {
      const blockedSet = new Set([email.toLowerCase()])
      let targets: string[]
      if (body.mailbox) {
        targets = [body.mailbox]
      } else {
        // Company-wide block → şirketin tüm kutularını temizle.
        const list = await proxy.sentroy.mailboxes.list()
        const items = (list as { data?: { email?: string }[] }).data ?? []
        targets = items
          .map((m) => m.email)
          .filter((e): e is string => typeof e === "string")
      }
      for (const mb of targets) {
        const r = await purgeBlockedSenders(proxy.sentroy, mb, blockedSet)
        purged += r.deleted
      }
    }
  } catch (err) {
    console.warn(
      "[inbox-blocks] purge failed:",
      err instanceof Error ? err.message : err,
    )
  }

  return jsonSuccess({ ...block, purged }, 201)
}
