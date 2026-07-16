// Web Push dispatch (server, node runtime). Platform-seviye VAPID keypair
// (core app'e ait tek keypair) ile ilgili kullanıcıların tüm tarayıcı
// abonelerine bildirim yollar. Yeni mail geldiğinde /api/internal/mail-push
// endpoint'inden fire-and-forget çağrılır — KAPALI sekme/uygulama için (açık
// sekmeye zaten SSE gidiyor). Payload service worker (public/sw.js) tarafından
// showNotification'a çevrilir.
import webpush from "web-push"
import { pushSubscriptionModel } from "@workspace/db/models"
import { apnsConfigured, apnsTokenDead, sendApns } from "./apns"
import { fcmConfigured, fcmTokenDead, sendFcm } from "./fcm"

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
  if (userIds.length === 0) return 0
  const webReady = ensureConfigured()
  const apnsReady = apnsConfigured()
  const fcmReady = fcmConfigured()
  if (!webReady && !apnsReady && !fcmReady) return 0

  const subs = await pushSubscriptionModel.findByUsers(userIds)
  if (subs.length === 0) return 0

  // Missing `platform` on legacy rows = web (zero-migration).
  const webSubs = subs.filter((s) => (s.platform ?? "web") === "web")
  const apnsSubs = subs.filter((s) => s.platform === "apns")
  const fcmSubs = subs.filter((s) => s.platform === "fcm")

  const body = JSON.stringify(payload)
  let sent = 0

  await Promise.all([
    // ── Web Push (VAPID) ──
    ...(webReady
      ? webSubs.map(async (s) => {
          if (!s.p256dh || !s.auth) return
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              body,
            )
            sent++
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode
            if (status === 404 || status === 410) {
              await pushSubscriptionModel.deleteByEndpoint(s.endpoint).catch(() => {})
            } else {
              console.warn(
                `[push] web sendNotification failed (status=${status ?? "?"}): ${
                  (err as Error).message
                }`,
              )
            }
          }
        })
      : []),
    // ── APNs (iOS) ── endpoint holds the hex device token.
    ...(apnsReady
      ? apnsSubs.map(async (s) => {
          const res = await sendApns(s.endpoint, {
            title: payload.title,
            body: payload.body,
            url: payload.url,
            tag: payload.tag,
          })
          if (res.ok) {
            sent++
          } else if (apnsTokenDead(res)) {
            await pushSubscriptionModel.deleteByEndpoint(s.endpoint).catch(() => {})
          } else if (res.status !== 0) {
            console.warn(`[push] apns failed (status=${res.status} reason=${res.reason ?? "?"})`)
          }
        })
      : []),
    // ── FCM (Android) ── endpoint holds the FCM registration token.
    ...(fcmReady
      ? fcmSubs.map(async (s) => {
          const res = await sendFcm(s.endpoint, {
            title: payload.title,
            body: payload.body,
            url: payload.url,
            tag: payload.tag,
          })
          if (res.ok) {
            sent++
          } else if (fcmTokenDead(res)) {
            await pushSubscriptionModel.deleteByEndpoint(s.endpoint).catch(() => {})
          } else if (res.status !== 0) {
            console.warn(`[push] fcm failed (status=${res.status} reason=${res.reason ?? "?"})`)
          }
        })
      : []),
  ])

  return sent
}
