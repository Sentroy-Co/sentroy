/**
 * Client-only desktop (OS) notification helper (triage lib/notifications
 * portu — Web Push/service-worker kısımları ÇIKARILDI, yalnız Notification
 * API + izin yönetimi kaldı; PLAN §6).
 *
 * Strateji: bildirimi YALNIZ sekme arka plandayken göster (öndeyse zil yeter).
 * "Beni ilgilendiriyor mu" kararı viewer kimliğiyle verilir — `completed`
 * her zaman; aksi halde atanan/oluşturan/(benim talebime) yorum eşleşmesi.
 *
 * Notification.requestPermission() modern tarayıcılarda kullanıcı jesti
 * ister; bu yüzden izin isteği toggle'ın onClick'inden tetiklenmeli.
 */

import type { SyncEvent } from "@/lib/event-bus"
import type { UiFlags } from "@/lib/ui-flags"
import type { Viewer } from "@/lib/ui-flags-context"
import { useUiStore } from "@/stores/ui-store"

export type { Viewer }

/**
 * Admin'den ayarlanan bildirim kapsamı (UI bayraklarının alt kümesi).
 * Hangi olay kategorilerinin masaüstü bildirimi üreteceğini belirler.
 */
export type NotificationPolicy = Pick<
  UiFlags,
  "notifyCompleted" | "notifyAssigned" | "notifyCreated" | "notifyComment"
>

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window
}

export function getNotificationPermission():
  | NotificationPermission
  | "unsupported" {
  if (!notificationsSupported()) return "unsupported"
  return Notification.permission
}

/** Yalnız kullanıcı jestinden çağır (tıklama). */
export async function requestNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (!notificationsSupported()) return "unsupported"
  if (Notification.permission !== "default") return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

/**
 * Bu olay, admin kapsamı + bu kullanıcı için bildirilmeye değer mi?
 * - `completed` issue → takım geneli; `notifyCompleted` ile yönetilir
 *   (proxy-mod kullanıcının alabildiği tek kategori).
 * - Linear kimliği varsa: atanan (`notifyAssigned`) / oluşturan
 *   (`notifyCreated`) eşleşmesi; talebime yorum (`notifyComment`). Kendi
 *   yazdığım yorum hiçbir koşulda bildirilmez.
 */
export function isRelevantForNotification(
  event: SyncEvent,
  viewer: Viewer,
  policy: NotificationPolicy
): boolean {
  if (event.type === "Issue" && event.stateType === "completed")
    return policy.notifyCompleted

  const me = viewer.linearUserId
  if (!me) return false // proxy mod: yalnız completed (yukarıda ele alındı)

  if (event.type === "Comment") {
    if (event.commentUserId === me) return false // kendi yorumum
    if (!policy.notifyComment) return false
    return event.assigneeId === me || event.creatorId === me
  }

  // Issue (completed olmayan) güncellemesi — atanan/oluşturan eşleşmesi.
  if (event.assigneeId === me && policy.notifyAssigned) return true
  if (event.creatorId === me && policy.notifyCreated) return true
  return false
}

function describe(event: SyncEvent): { title: string; body: string } {
  const ident = event.issueIdentifier ?? "Talep"
  const issueTitle = event.issueTitle ?? ""
  const actor = event.actorName ? ` · ${event.actorName}` : ""

  if (event.type === "Issue" && event.stateType === "completed") {
    return {
      title: `✅ Tamamlandı — ${ident}`,
      body: issueTitle || "Talep tamamlandı",
    }
  }
  if (event.type === "Comment") {
    return { title: `💬 Yeni yorum — ${ident}${actor}`, body: issueTitle }
  }
  if (event.type === "Issue" && event.action === "create") {
    return { title: `🆕 Yeni talep — ${ident}${actor}`, body: issueTitle }
  }
  return { title: `${ident} güncellendi${actor}`, body: issueTitle }
}

/**
 * Olayı (uygunsa) masaüstü bildirimi olarak göster. Koşullar: tercih açık +
 * izin granted + sekme arka planda + olay ilgili.
 *
 * `onNavigate` tıklamada SPA navigasyonu için çağrılır — caller bunu
 * router-compat `useNavigate()` ile kurmalı (`(id) => navigate(`/tasks/${id}`)`)
 * ki basePath (`/${lang}/d/${slug}`) prefix'lensin. Triage'daki tam-yükleme
 * fallback'i ("/tasks/:id"e location.assign) monorepo'da basePath'siz 404
 * olacağından KALDIRILDI; onNavigate yoksa sadece pencere odaklanır.
 */
export function notifyIssueEvent(
  event: SyncEvent,
  viewer: Viewer,
  policy: NotificationPolicy,
  onNavigate?: (issueId: string) => void
): void {
  if (!notificationsSupported()) return
  const ui = useUiStore.getState()
  if (!ui.desktopNotificationsEnabled) return
  if (Notification.permission !== "granted") return
  // Sekme öndeyse zil yeterli; bildirimle rahatsız etme.
  if (document.visibilityState === "visible") return
  if (!isRelevantForNotification(event, viewer, policy)) return

  const { title, body } = describe(event)
  try {
    const n = new Notification(title, {
      body,
      tag: event.issueId ?? undefined, // aynı talebi katla
      silent: false,
    })
    n.onclick = () => {
      window.focus()
      n.close()
      const id = event.issueId
      if (!id) return
      if (onNavigate) onNavigate(id)
    }
  } catch {
    // Notification ctor bazı ortamlarda (ör. iOS Safari, kurulu PWA dışı)
    // atabilir — sessiz geç.
  }
}
