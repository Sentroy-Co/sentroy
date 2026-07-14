// Web Push dispatch (server, node runtime). Platform-seviye VAPID keypair
// (core app'e ait tek keypair) ile ilgili kullanıcıların tüm tarayıcı
// abonelerine bildirim yollar. Yeni mail geldiğinde /api/internal/mail-push
// endpoint'inden fire-and-forget çağrılır — KAPALI sekme/uygulama için (açık
// sekmeye zaten SSE gidiyor). Payload service worker (public/sw.js) tarafından
// showNotification'a çevrilir.
import webpush from "web-push"
import { pushSubscriptionModel } from "@workspace/db/models"

let configured = false

/** VAPID env'i tanımlı mı — dispatch/subscribe bunsuz no-op. */
export function pushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  )
}

/** Client'a verilecek public key (secret DEĞİL). Yoksa push desteklenmiyor. */
export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null
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

export interface PushPayload {
  title: string
  body: string
  /** Tıklamada açılacak URL (mutlak — bildirim OS-seviye, relative çözemez). */
  url: string
  /** Aynı tag'li bildirimler üst üste binmez (aynı mailbox → tek stack). */
  tag?: string
}

/**
 * Verilen kullanıcıların TÜM abonelerine push yollar. VAPID yoksa / hedef
 * yoksa / abone yoksa sessizce çıkar. Süresi geçmiş abonelikleri (404/410)
 * temizler. Fire-and-forget — çağıran await etse de hata fırlatmaz.
 *
 * @returns Başarıyla gönderilen abone sayısı (log/debug için).
 */
export async function dispatchToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<number> {
  if (!ensureConfigured()) return 0
  if (userIds.length === 0) return 0

  const subs = await pushSubscriptionModel.findByUsers(userIds)
  if (subs.length === 0) return 0

  const body = JSON.stringify(payload)
  let sent = 0

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        )
        sent++
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          // Abonelik ölmüş (tarayıcı iptal etti / cihaz gitti) — temizle.
          await pushSubscriptionModel
            .deleteByEndpoint(s.endpoint)
            .catch(() => {})
        } else {
          console.warn(
            `[push] sendNotification failed (status=${status ?? "?"}): ${
              (err as Error).message
            }`,
          )
        }
      }
    }),
  )

  return sent
}
