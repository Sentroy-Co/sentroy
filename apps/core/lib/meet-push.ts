// Meet bildirimleri — davet + T-15 hatırlatma push fan-out'u. Mail'in
// dispatch altyapısını (web push + APNs + FCM + Electron mail_push_events
// poll kanalı) yeniden kullanır; yalnız URL kurgusu meet'e özgüdür:
// hedef bir Sentroy OS kullanıcısıysa bildirim OS İÇİNDE meet penceresini
// doğru odayla açan deep-link taşır (?os-app=meet&os-room=…), aksi halde
// doğrudan meet.<root>/call/<oda> linki.
import { companyModel, mailPushEventModel } from "@workspace/db/models"
import { rootOrigin, serverRootDomain, subAppOrigin } from "@workspace/auth/lib/domains"
import { dispatchToUsers } from "./push"

/** Bildirim tık hedefi. companySlug verilirse OS deep-link'i tercih edilir. */
export function meetNotificationUrl(room: string, companySlug?: string | null): string {
  const root = serverRootDomain()
  if (companySlug) {
    const qs = new URLSearchParams({ "os-app": "meet", "os-room": room })
    return `${rootOrigin(root)}/en/d/${companySlug}?${qs.toString()}`
  }
  return `${subAppOrigin(root, "meet")}/call/${room}`
}

/**
 * Verilen kullanıcılara meet bildirimi yolla (push + Electron poll kanalı).
 * Fire-and-forget dostu: hata fırlatmaz, gönderilen push sayısını döner.
 */
export async function pushMeetNotification(opts: {
  userIds: string[]
  title: string
  body: string
  room: string
  companyId?: string | null
}): Promise<number> {
  const userIds = [...new Set(opts.userIds)].filter(Boolean)
  if (userIds.length === 0) return 0

  let slug: string | null = null
  if (opts.companyId) {
    try {
      slug = (await companyModel.findById(opts.companyId))?.slug ?? null
    } catch {/* slug çözülemezse meet linkine düş */}
  }
  const url = meetNotificationUrl(opts.room, slug)

  let sent = 0
  try {
    sent = await dispatchToUsers(userIds, {
      title: opts.title,
      body: opts.body,
      url,
      tag: `meet-${opts.room}`,
    })
  } catch {/* push altyapısı kapalıysa sessiz geç */}

  // Electron masaüstü poll kanalı (mail_push_events, 10 dk TTL) — VAPID
  // Electron'da çalışmadığından OS masaüstü bildirimi buradan doğar.
  await Promise.all(
    userIds.map((userId) =>
      mailPushEventModel
        .create({ userId, from: opts.title, subject: opts.body, url, mailbox: `meet-${opts.room}` })
        .catch(() => {}),
    ),
  )

  return sent
}
