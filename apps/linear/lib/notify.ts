// Persisted in-app bildirimler (user_notifications) — Sentroy OS bildirim
// widget'ında + mail/storage notification sheet'inde görünür. Web Push kapalı
// sekme içindi; bu, kullanıcı Sentroy'da herhangi bir yerdeyken kalıcı geçmiş
// sağlar (hydrateFromServer ile yüklenir). Webhook event'lerinden fire-and-forget
// çağrılır (push dispatch ile aynı alıcılar).
import { getDb } from "@workspace/db/client"
import { userNotificationModel } from "@workspace/db/models"
import { internalAuthHeaders } from "@workspace/console/lib/internal-auth"
import { getLinearContext } from "./linear/context"
import { getAllLinearUsers } from "./linear/users"
import {
  recipientLinearUserIds,
  notificationTitle,
  linearAppUrl,
} from "./push"
import type { SyncEvent } from "./event-bus"
import type { UiFlags } from "./ui-flags"
import { logger } from "./logger"

/**
 * Event'in ilgili Linear kullanıcılarına (assignee/creator/…) karşılık gelen
 * Sentroy kullanıcıları için kalıcı bildirim oluşturur. Eşleme:
 * Linear user id → email (getAllLinearUsers) → Sentroy user (`user` koleksiyonu,
 * email) → aktif company üyeliği doğrula → user._id.toString() (= session.user.id).
 */
export async function createLinearNotifications(
  companyId: string,
  event: SyncEvent,
  flags: UiFlags,
): Promise<void> {
  const targets = recipientLinearUserIds(event, flags)
  if (targets.length === 0) return

  const ctx = await getLinearContext(companyId).catch(() => null)
  if (!ctx) return

  const users = await getAllLinearUsers(ctx).catch(() => [])
  const emailByLinearId = new Map<string, string>()
  for (const u of users) {
    if (u.email) emailByLinearId.set(u.id, u.email.toLowerCase())
  }
  const targetEmails = targets
    .map((id) => emailByLinearId.get(id))
    .filter((e): e is string => Boolean(e))
  if (targetEmails.length === 0) return

  const db = await getDb()
  const { ObjectId } = await import("mongodb")

  // email → Sentroy user(lar)
  const sentroyUsers = await db
    .collection("user")
    .find({ email: { $in: targetEmails } })
    .toArray()
  if (sentroyUsers.length === 0) return

  // Aktif üyelik filtresi + şirket slug'ı
  const company = await db
    .collection("companies")
    .findOne({ _id: new ObjectId(companyId) })
    .catch(() => null)
  const slug = (company?.slug as string | undefined) ?? ""
  const activeMembers = await db
    .collection("company_members")
    .find({ companyId, status: "active" })
    .toArray()
  const memberIds = new Set(activeMembers.map((m) => String(m.userId)))

  const base = linearAppUrl()
  const href =
    slug && event.issueId
      ? `${base}/en/d/${slug}/tasks/${event.issueId}`
      : slug
        ? `${base}/en/d/${slug}`
        : base
  const title = notificationTitle(event)
  const body = event.issueTitle || ""

  const targetUserIds = sentroyUsers
    .filter((u) => memberIds.has(String(u._id)))
    .map((u) => String(u._id))

  await Promise.all(
    targetUserIds.map((userId) =>
      userNotificationModel
        .create({
          userId,
          type: "linear",
          title,
          body,
          href,
          meta: { companyId, issueId: event.issueId ?? null, slug },
        })
        .catch((err) => {
          logger.warn({
            source: "linear",
            route: "notify",
            companyId,
            message: `notification create failed: ${(err as Error).message}`,
          })
        }),
    ),
  )

  // Native cihaz push'u (APNs/FCM/VAPID) — core `dispatchToUsers` core app'te
  // olduğundan (mobil cihaz kaydı orada) linear app internal endpoint'e POST'lar.
  // Best-effort: INTERNAL_API_SECRET yoksa / core erişilemezse sessizce atla
  // (in-app bildirim + web push zaten yazıldı). SSE ise foreground'u kaplar.
  void dispatchNativePush(targetUserIds, title, body, href).catch(() => {})
}

/**
 * Hedef Sentroy kullanıcılarının cihazlarına native push (mobil/masaüstü) —
 * core `/api/internal/linear-push` (x-internal-secret) üzerinden. Ayrı app
 * olduğumuz için `dispatchToUsers`'a doğrudan erişemeyiz.
 */
async function dispatchNativePush(
  userIds: string[],
  title: string,
  body: string,
  url: string,
): Promise<void> {
  if (userIds.length === 0) return
  const coreUrl =
    process.env.CORE_APP_URL ||
    process.env.NEXT_PUBLIC_CORE_APP_URL ||
    "https://sentroy.com"
  let headers: Record<string, string>
  try {
    headers = { "Content-Type": "application/json", ...internalAuthHeaders() }
  } catch {
    return // INTERNAL_API_SECRET yapılandırılmamış → native push atla
  }
  await fetch(`${coreUrl}/api/internal/linear-push`, {
    method: "POST",
    headers,
    body: JSON.stringify({ userIds, title, body, url, tag: "linear" }),
  })
}
