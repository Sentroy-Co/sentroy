// Web Push dispatch (server, node runtime). Platform-seviye VAPID keypair
// (linear app'e ait tek keypair) ile ilgili abonelere bildirim yollar. Webhook
// alıcısından fire-and-forget çağrılır. Açık sekmeye zaten SSE gidiyor; bu
// KAPALI sekme/uygulama için. `web-push` payload'u service worker (public/sw.js)
// tarafından showNotification'a çevrilir.
import webpush from "web-push"
import { getDb } from "@workspace/db/client"
import { linearPushSubscriptionModel } from "@workspace/db/models"
import type { SyncEvent } from "./event-bus"
import type { UiFlags } from "./ui-flags"
import { logger } from "./logger"

let configured = false

/** VAPID env'i tanımlı mı — dispatch/subscribe bunsuz no-op. */
export function pushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  )
}

function ensureConfigured(): boolean {
  if (configured) return true
  if (!pushConfigured()) return false
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:support@sentroy.com",
    process.env.VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  )
  configured = true
  return true
}

export function linearAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_LINEAR_APP_URL ||
    process.env.LINEAR_APP_URL ||
    "https://linear.sentroy.com"
  ).replace(/\/+$/, "")
}

/** Event + flag'lere göre bildirilecek Linear user id'leri (aktör hariç). */
export function recipientLinearUserIds(event: SyncEvent, flags: UiFlags): string[] {
  const ids = new Set<string>()
  const isIssue = event.type === "Issue"
  const completed = isIssue && event.stateType === "completed"

  if (completed && flags.notifyCompleted) {
    if (event.assigneeId) ids.add(event.assigneeId)
    if (event.creatorId) ids.add(event.creatorId)
  }
  if (isIssue && event.action === "create" && flags.notifyCreated) {
    if (event.assigneeId) ids.add(event.assigneeId)
    if (event.creatorId) ids.add(event.creatorId)
  }
  if (isIssue && event.action === "update" && !completed && flags.notifyAssigned) {
    if (event.assigneeId) ids.add(event.assigneeId)
  }
  if (event.type === "Comment" && flags.notifyComment) {
    if (event.assigneeId) ids.add(event.assigneeId)
    if (event.creatorId) ids.add(event.creatorId)
  }
  // Olayı tetikleyen kişiye bildirim gönderme (kendi eylemin).
  if (event.commentUserId) ids.delete(event.commentUserId)
  return [...ids]
}

export function notificationTitle(event: SyncEvent): string {
  const ident = event.issueIdentifier ? `${event.issueIdentifier} · ` : ""
  if (event.type === "Comment") return `${ident}New comment`
  if (event.stateType === "completed") return `${ident}Completed`
  if (event.action === "create") return `${ident}New request`
  return `${ident}Updated`
}

/**
 * Şirketin ilgili abonelerine push yollar. VAPID yoksa / hedef yoksa / abone
 * yoksa sessizce çıkar. Süresi geçmiş abonelikleri (404/410) temizler.
 */
export async function dispatchPush(
  companyId: string,
  event: SyncEvent,
  flags: UiFlags,
): Promise<void> {
  if (!ensureConfigured()) return
  const targets = recipientLinearUserIds(event, flags)
  if (targets.length === 0) return

  const subs = await linearPushSubscriptionModel.findByCompanyAndLinearUsers(
    companyId,
    targets,
  )
  if (subs.length === 0) return

  // Bildirim tıklaması issue'ya derin link — şirket slug'ı gerekir.
  let slug = ""
  try {
    const db = await getDb()
    const { ObjectId } = await import("mongodb")
    const company = await db
      .collection("companies")
      .findOne({ _id: new ObjectId(companyId) })
    slug = (company?.slug as string | undefined) ?? ""
  } catch {
    /* slug çözülemezse app köküne düşer */
  }
  const base = linearAppUrl()
  const url =
    slug && event.issueId
      ? `${base}/en/d/${slug}/tasks/${event.issueId}`
      : slug
        ? `${base}/en/d/${slug}`
        : base

  const payload = JSON.stringify({
    title: notificationTitle(event),
    body: event.issueTitle || "",
    url,
    tag: event.issueId || undefined,
  })

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        )
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          // Abonelik ölmüş — temizle.
          await linearPushSubscriptionModel
            .deleteByEndpoint(s.endpoint)
            .catch(() => {})
        } else {
          logger.warn({
            source: "linear",
            route: "push.dispatch",
            companyId,
            message: `push failed: ${(err as Error).message}`,
          })
        }
      }
    }),
  )
}
