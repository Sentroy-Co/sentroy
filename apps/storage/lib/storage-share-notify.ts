// lib/storage-share-notify.ts — "X seninle Y'yi paylaştı" bildirim fan-out'u.
//
// Üç kanal (meet davetiyle aynı desen): (1) kalıcı in-app bildirim
// (userNotificationModel → bildirim merkezi), (2) e-posta (sendSystemMailEvent
// "storage.shared"), (3) cihaz push'u (core /api/internal/storage-push → web
// VAPID + APNs + FCM). Hepsi best-effort; hata paylaşımı bozmaz.

import { userNotificationModel } from "@workspace/db/models"
import { sendSystemMailEvent } from "@workspace/auth/server/system-mail-events"
import { internalAuthHeaders } from "@workspace/console/lib/internal-auth"

const CORE_INTERNAL = (
  process.env.CORE_APP_URL ||
  process.env.NEXT_PUBLIC_CORE_APP_URL ||
  "http://localhost:3000"
).replace(/\/+$/, "")

const CORE_PUBLIC = (
  process.env.NEXT_PUBLIC_CORE_APP_URL || "https://sentroy.com"
).replace(/\/+$/, "")

export interface ShareRecipient {
  userId: string
  email: string | null
}

/**
 * Alıcılara "X seninle Y'yi paylaştı" bildirimi gönderir. Tıklandığında OS
 * içinde storage penceresi o dosyayı açar (?os-app=storage&os-bucket&os-file).
 */
export async function notifyStorageShare(opts: {
  recipients: ShareRecipient[]
  sharerName: string
  fileName: string
  companySlug: string
  bucketSlug: string
  folder: string // media folder ("uploads" = kök)
  fileId: string
}): Promise<void> {
  const {
    recipients,
    sharerName,
    fileName,
    companySlug,
    bucketSlug,
    folder,
    fileId,
  } = opts
  const userIds = [...new Set(recipients.map((r) => r.userId).filter(Boolean))]
  if (userIds.length === 0) return

  // OS deep-link: bildirime tıklayınca storage penceresi bu dosyayı açar.
  const qs = new URLSearchParams({
    "os-app": "storage",
    "os-bucket": bucketSlug,
    "os-file": fileId,
  })
  if (folder && folder !== "uploads") qs.set("os-folder", folder)
  const osDeepLink = `${CORE_PUBLIC}/en/d/${companySlug}?${qs.toString()}`

  const title = `${sharerName} · ${fileName}`
  const bodyText = "shared a file with you"

  // 1) Kalıcı bildirim merkezi kaydı.
  await Promise.all(
    recipients.map((r) =>
      userNotificationModel
        .create({
          userId: r.userId,
          type: "storage-shared",
          title: sharerName,
          body: fileName,
          href: osDeepLink,
          meta: { companySlug, bucketSlug, folder, fileId },
        })
        .catch(() => {}),
    ),
  )

  // 2) E-posta (farkındalık + fallback).
  await Promise.all(
    recipients
      .filter((r) => r.email)
      .map((r) =>
        sendSystemMailEvent("storage.shared", {
          to: r.email as string,
          variables: { sharerName, fileName, url: osDeepLink },
        }).catch(() => {}),
      ),
  )

  // 3) Cihaz push'u (core internal endpoint üzerinden).
  try {
    await fetch(`${CORE_INTERNAL}/api/internal/storage-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...internalAuthHeaders() },
      body: JSON.stringify({
        userIds,
        title,
        body: bodyText,
        url: osDeepLink,
        tag: `storage-${fileId}`,
      }),
    })
  } catch {
    /* push best-effort */
  }
}
