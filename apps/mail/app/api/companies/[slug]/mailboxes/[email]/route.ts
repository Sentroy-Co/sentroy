export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"
import { catchAllRuleModel } from "@workspace/db/models"
import {
  syncOnMailboxPasswordChange,
  syncOnMailboxDelete,
} from "@/lib/mailbox-account-sync"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; email: string }> }
) {
  const { slug, email: rawEmail } = await params
  const email = decodeURIComponent(rawEmail)

  let body: { password?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (
    !body.password ||
    typeof body.password !== "string" ||
    body.password.length < 8
  ) {
    return jsonError("Password must be at least 8 characters")
  }

  const result = await getSentroyForCompany(request, slug, "mailboxes.manage")
  if ("error" in result && result.error) return result.error

  try {
    await result.sentroy!.mailboxes.updatePassword(email, body.password)
    // Auth user account password sync (best-effort)
    const sync = await syncOnMailboxPasswordChange({
      email,
      newPassword: body.password,
    })
    return jsonSuccess({
      message: "Password updated",
      accountSync: sync,
    })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to update password"
    return jsonError(message, 500)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; email: string }> }
) {
  const { slug, email: rawEmail } = await params
  const email = decodeURIComponent(rawEmail)

  const result = await getSentroyForCompany(request, slug, "mailboxes.manage")
  if ("error" in result && result.error) return result.error

  // ── Catch-all anchor guard ────────────────────────────────────────────
  // Bu mailbox bir domain'in catch-all HEDEFİ ise, mail-server onu silmeyi
  // reddeder (catch-all alias hâlâ ona referans veriyor → "Failed to delete
  // mailbox"). Hedef silinince catch-all zaten anlamsız; önce backend'de
  // catch-all'ı kaldırıp DB rule'unu temizle, sonra mailbox'ı sil.
  const normalizedEmail = email.toLowerCase()
  let removedCatchAllFor: string | null = null
  try {
    const rules = await catchAllRuleModel.findByCompanyId(result.companyId!)
    const anchored = rules.filter(
      (r) => r.targetMailboxEmail.toLowerCase() === normalizedEmail,
    )
    for (const rule of anchored) {
      try {
        await result.sentroy!.domains.setCatchAll(rule.sentroyDomainId, {
          mailboxEmail: null,
        })
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "catch-all unset failed"
        return jsonError(
          `This mailbox is the catch-all destination for ${rule.domainName}; removing the catch-all failed: ${msg}`,
          502,
        )
      }
      await catchAllRuleModel.removeByDomainId(rule.sentroyDomainId)
      removedCatchAllFor = rule.domainName
    }
  } catch (err: unknown) {
    // Precheck (Mongo) hatası silmeyi bloklamasın; mail-server yine de
    // referans nedeniyle reddederse aşağıdaki catch net mesaj döner.
    console.warn(
      "[mailbox delete] catch-all precheck failed:",
      err instanceof Error ? err.message : err,
    )
  }

  try {
    await result.sentroy!.mailboxes.delete(email)
    // Auth membership permission cleanup (best-effort, user kalır).
    const sync = await syncOnMailboxDelete({ email })
    return jsonSuccess({
      message: removedCatchAllFor
        ? `Mailbox deleted (catch-all for ${removedCatchAllFor} was removed)`
        : "Mailbox deleted",
      accountSync: sync,
      removedCatchAll: removedCatchAllFor,
    })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to delete mailbox"
    return jsonError(message, 500)
  }
}
