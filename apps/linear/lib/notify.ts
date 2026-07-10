// Persisted in-app bildirimler (user_notifications) — Sentroy OS bildirim
// widget'ında + mail/storage notification sheet'inde görünür. Web Push kapalı
// sekme içindi; bu, kullanıcı Sentroy'da herhangi bir yerdeyken kalıcı geçmiş
// sağlar (hydrateFromServer ile yüklenir). Webhook event'lerinden fire-and-forget
// çağrılır (push dispatch ile aynı alıcılar).
import { getDb } from "@workspace/db/client"
import { userNotificationModel } from "@workspace/db/models"
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

  await Promise.all(
    sentroyUsers
      .filter((u) => memberIds.has(String(u._id)))
      .map((u) =>
        userNotificationModel
          .create({
            userId: String(u._id),
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
}
