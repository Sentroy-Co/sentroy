import { NextRequest } from "next/server"
import { verifyInternalRequest } from "@workspace/console/lib/internal-auth"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import {
  companyModel,
  companyMemberModel,
  inboxBlockModel,
} from "@workspace/db/models"
import { memberHasPermission } from "@workspace/auth/server/permissions"
import { serverRootDomain, rootOrigin } from "@workspace/auth/lib/domains"
import { dispatchToUsers } from "@/lib/push"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Yeni mail → Web Push dispatch (server-to-server, mail-server çağırır).
 * mail-server `mail:delivered` event'inde mailbox→domain→companyId'yi Prisma'dan
 * çözer + buraya x-internal-secret ile POST'lar. Burada:
 *   1. Bloklu gönderenden ise ATLA (operatör güvenlik talebi — [[inbox-block]]).
 *   2. Bu şirkette bu mailbox'a inbox erişimi olan aktif üyeleri bul.
 *   3. O kullanıcıların push abonelerine bildirim yolla (kapalı sekme için).
 * Açık sekmeye zaten SSE ile canlı inbox gidiyor; bu ona ek OS-seviye bildirim.
 */

/** "Ad <email>" veya "email" → bare lowercase email (blocklist eşleşmesi için). */
function extractEmail(from: string | null | undefined): string | null {
  if (!from) return null
  const m = from.match(/<([^>]+)>/)
  const raw = (m ? m[1] : from).trim().toLowerCase()
  return raw.includes("@") ? raw : null
}

/** Bildirim başlığı için gönderen görünen adı — "Ad <email>" → "Ad", yoksa email. */
function senderDisplay(from: string | null | undefined): string {
  if (!from) return "New mail"
  const m = from.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/)
  const name = m?.[1]?.trim()
  return name || extractEmail(from) || from.trim()
}

export async function POST(request: NextRequest) {
  const denied = verifyInternalRequest(request)
  if (denied) return denied

  const body = (await request.json().catch(() => null)) as {
    companyId?: string
    mailbox?: string
    from?: string | null
    subject?: string | null
    messageId?: string | null
  } | null

  const companyId = body?.companyId
  const mailbox = body?.mailbox?.trim().toLowerCase()
  if (!companyId || !mailbox) {
    return jsonError("companyId and mailbox required", 400)
  }

  // 1) Bloklu gönderen filtresi — bildirim GÖNDERME.
  const senderEmail = extractEmail(body?.from)
  if (senderEmail) {
    const blocks = await inboxBlockModel.findActiveForMailbox(companyId, mailbox)
    if (blocks.some((b) => b.blockedEmail === senderEmail)) {
      return jsonSuccess({ sent: 0, skipped: "blocked" })
    }
  }

  // 2) Alıcı üyeler — bu mailbox'a inbox erişimi olan aktif üyeler.
  const company = await companyModel.findById(companyId)
  if (!company) return jsonSuccess({ sent: 0, skipped: "no-company" })

  const members = await companyMemberModel.findByCompany(companyId)
  // inbox.mailbox:<email> scope'u owner/admin + inbox.view + tam-mailbox
  // yetkisini kapsar (bkz. permissions.memberHasPermission).
  const scope = `inbox.mailbox:${mailbox}` as `inbox.mailbox:${string}`
  const userIds = [
    ...new Set(
      members
        .filter((m) => m.status === "active" && memberHasPermission(m, scope))
        .map((m) => m.userId),
    ),
  ]
  if (userIds.length === 0) {
    return jsonSuccess({ sent: 0, skipped: "no-recipients" })
  }

  // 3) Dispatch — Sentroy OS'a deep-link: mail uygulamasını OS İÇİNDE açar
  // (mail subdomain'e değil). OS `?os-app=mail` param'ını okuyup pencereyi
  // açar (bkz. sentroy-os deep-link effect). Core origin proxy arkasında
  // request.url'den değil root domain'den kurulur.
  const coreBase = rootOrigin(serverRootDomain())
  const qs = new URLSearchParams({ "os-app": "mail", "os-mailbox": mailbox })
  const url = `${coreBase}/en/d/${company.slug}?${qs.toString()}`

  const subject = body?.subject?.trim() || "(no subject)"
  const sent = await dispatchToUsers(userIds, {
    title: senderDisplay(body?.from),
    body: subject,
    url,
    // Aynı mailbox'a arka arkaya gelen mailler tek stack'te toplanır.
    tag: mailbox,
  })

  return jsonSuccess({ sent })
}
