import { NextRequest } from "next/server"
import { jsonError } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "./sentroy-proxy"
import { hasPermission } from "@workspace/auth/server/permissions"
import type { Permission } from "@workspace/db/types"

/**
 * Inbox endpoint'leri icin esitlenmis yetki kontrolu:
 *
 * - `mailbox` parametresi verilmisse → `inbox.mailbox:<mailbox>` yetkisi yeterli
 *   (bu kontrol `inbox.view` sahibi kullanicilari da otomatik kabul eder).
 * - `mailbox` yoksa (ornegin tum kutular uzerinde genel liste) → `inbox.view`
 *   gerekir.
 *
 * `getSentroyForCompany` cagrisini tek bir yerde yonetir, izin reddinde 403 doner.
 */
export async function getSentroyForInbox(
  request: NextRequest,
  slug: string,
  mailbox: string | null | undefined,
) {
  const result = await getSentroyForCompany(request, slug)
  if ("error" in result && result.error) return result
  if (!result.session) return result // narrow

  const required: Permission = mailbox
    ? (`inbox.mailbox:${mailbox.toLowerCase()}` as Permission)
    : "inbox.view"

  const allowed = await hasPermission(result.session, slug, required)
  if (!allowed) {
    return { error: jsonError("Insufficient permissions", 403) }
  }

  return result
}

/**
 * Aktif (doğrulanmış) domain var mı? Company'nin doğrulanmış domain'i yoksa
 * mailbox'ı da yoktur → inbox/mailbox list çağrıları mail-server'da hata verir.
 * Bu helper'ı route'ların catch dalında kullanıp "henüz domain yok" durumunu
 * 500 yerine boş sonuç olarak döndürürüz (kullanıcı henüz domain eklememiş).
 * Domains list'in kendisi de patlarsa `false` döner — orijinal hatayı maskeleme.
 */
export async function hasNoActiveDomain(sentroy: {
  domains: {
    list: () => Promise<{ data?: Array<{ status?: string }> | null }>
  }
}): Promise<boolean> {
  try {
    const res = await sentroy.domains.list()
    return !(res.data ?? []).some((d) => d.status === "active")
  } catch {
    return false
  }
}

/**
 * Normalize an error from the mail-server SDK into an HTTP status the
 * dashboard route should bubble back to the browser.
 *
 * `SentroyHttpError` carries the upstream `statusCode` (mail-server's
 * own response). When the SDK itself blows up (timeout, network fail,
 * bad JSON from a gateway 502 page) we keep the default 500 — caller
 * still gets the message via `err.message`.
 */
export function statusFromMailServerError(err: unknown): number {
  if (err && typeof err === "object" && "statusCode" in err) {
    const code = (err as { statusCode: unknown }).statusCode
    if (typeof code === "number" && code >= 400 && code < 600) return code
  }
  return 500
}
