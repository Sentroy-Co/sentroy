"use client"

import { useEffect, useRef, useCallback } from "react"
import { useParams } from "next/navigation"
import { useCompanyStore } from "@workspace/console/stores/company"
import {
  useNotificationsStore,
  type AppNotification,
} from "@workspace/console/stores/notifications"

interface MailDeliveredPayload {
  mailbox: string
  folder: string
  messageId?: string | null
  from?: string | null
  subject?: string | null
  arrivedAt: string
}

// ── Desktop Notification helpers ────────────────────────────────────────────

/** Tarayici Notification API iznini iste (kullanici izin vermezse sessiz kal) */
function requestNotificationPermission() {
  if (typeof Notification === "undefined") return
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {})
  }
}

/** OS / masaustu bildirimi goster. Tab arka plandayken calisir. */
function showDesktopNotification(
  title: string,
  body: string,
  onClick?: () => void,
) {
  if (typeof Notification === "undefined") return
  if (Notification.permission !== "granted") return

  try {
    const n = new Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: `sentroy-mail-${Date.now()}`,
    })
    if (onClick) {
      n.onclick = () => {
        window.focus()
        onClick()
        n.close()
      }
    }
    // 8s sonra otomatik kapat
    setTimeout(() => n.close(), 8000)
  } catch {
    // Notification yapici bazi ortamlarda atabilir (http, worker vb.)
  }
}

// ── Provider ────────────────────────────────────────────────────────────────

const UNREAD_REFETCH_INTERVAL_MS = 60_000 * 15

export function NotificationsProvider() {
  const params = useParams<{ "company-slug": string; lang: string }>()
  const slug = params["company-slug"]
  const lang = params.lang
  const membership = useCompanyStore((s) => s.membership)
  const navigateRef = useRef<((href: string) => void) | null>(null)

  // Router.push yerine location kullaniyoruz — server component'ten bagimsiz
  useEffect(() => {
    navigateRef.current = (href: string) => {
      window.location.href = href
    }
  }, [])

  // Ilk mount'ta Notification iznini iste
  useEffect(() => {
    requestNotificationPermission()
  }, [])

  // Persisted in-app notifications (invitation vb.) — sadece bir kez fetch
  // edilir; store içinde `hydrated` flag ile tekrar tetiklenmez.
  useEffect(() => {
    useNotificationsStore.getState().hydrateFromServer()
  }, [])

  // Inbox unread count — mount'ta ve periyodik (60sn) yenile, drift düzeltici.
  // SSE event'leri arada artırır; refetch authoritative değer için.
  useEffect(() => {
    if (!slug) return
    let cancelled = false

    async function fetchUnreadCount() {
      try {
        const res = await fetch(`/api/companies/${slug}/inbox/unread-count`)
        if (!res.ok) return
        const json = await res.json()
        if (cancelled) return
        useNotificationsStore.getState().setInboxUnreadCount(
          (json?.data?.count as number) ?? 0,
        )
      } catch {
        // silent — ağ hatası badge'i sıfırlamasın
      }
    }

    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, UNREAD_REFETCH_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [slug])

  /** Bildirimin hedef URL'sini olusturur — mailbox + subject parametreli inbox
   *  linki. Inbox sayfası mail subdomain'inde, bu yüzden her zaman absolute
   *  mail URL üretiyoruz: storage/core'dan tıklansa da doğru appe açılır. */
  const buildNotifHref = useCallback(
    (payload: MailDeliveredPayload) => {
      const qs = new URLSearchParams()
      qs.set("mailbox", payload.mailbox)
      if (payload.subject) qs.set("subject", payload.subject)
      const mailUrl =
        process.env.NEXT_PUBLIC_MAIL_APP_URL || ""
      const path = `/${lang}/d/${slug}/inbox?${qs.toString()}`
      return mailUrl ? `${mailUrl}${path}` : path
    },
    [lang, slug],
  )

  useEffect(() => {
    if (!slug) return

    // Kullanıcının dinleyebileceği mailbox'lar
    let mailboxFilter: string | undefined
    if (membership) {
      const hasGlobal =
        membership.role === "owner" ||
        membership.role === "admin" ||
        membership.permissions.includes("inbox.view") ||
        membership.permissions.includes("mailboxes.manage")
      if (!hasGlobal) {
        const scoped = membership.permissions
          .filter((p) => p.startsWith("inbox.mailbox:"))
          .map((p) => p.slice("inbox.mailbox:".length))
        if (scoped.length === 0) return
        mailboxFilter = scoped.join(",")
      }
    }

    const url = `/api/companies/${slug}/inbox/events${
      mailboxFilter ? `?mailbox=${encodeURIComponent(mailboxFilter)}` : ""
    }`

    // EventSource'ın native auto-reconnect'i ne kadar bekleyeceğini
    // sunucuya bırakır + her hatadan sonra ~3sn'de tekrar dener. Mail
    // server geçici olarak ulaşılmazken (deploy, restart, IMAP pool
    // lag) bu döngü her birkaç saniyede bir error console'a düşer ve
    // network tab'ı 502/503 ile dolar. Manuel exponential backoff ile
    // hızlı transient hata sonrası ilk 30 sn'de bir kez dener, sonra
    // 1 dk, 2 dk, max 5 dk'da bir → silent failover. İlk başarılı
    // bağlantıda counter sıfırlanır.
    let es: EventSource | null = null
    let reconnectTimer: number | null = null
    let attempt = 0
    let cancelled = false

    const handleEvent = (ev: MessageEvent) => {
      let payload: MailDeliveredPayload
      try {
        payload = JSON.parse(ev.data)
      } catch {
        return
      }
      const title = payload.from ?? payload.mailbox
      const description = payload.subject || "(Konu yok)"
      const href = buildNotifHref(payload)
      const notif: Omit<AppNotification, "id" | "createdAt" | "read"> = {
        type: "mail-delivered",
        title,
        description,
        href,
        payload: payload as unknown as Record<string, unknown>,
      }
      const store = useNotificationsStore.getState()
      store.add(notif)
      store.incrementInboxUnread(1)
      // Toast KALDIRILDI — bildirimler artık Sentroy OS'ta merkezi olarak
      // (zil/sheet + rozet) görülüyor; her mail-delivered'da ayrı toast gürültü
      // yaratıyordu. Zil/sheet (store) + tab gizliyse masaüstü bildirimi kalır.
      if (document.hidden) {
        showDesktopNotification(title, description, () => {
          navigateRef.current?.(href)
        })
      }
      window.dispatchEvent(
        new CustomEvent("sentroy:mail-delivered", { detail: payload }),
      )
    }

    function scheduleReconnect() {
      if (cancelled) return
      // 5s, 15s, 30s, 60s, 120s, 300s ceiling — caps the reconnect
      // pressure on a long-down upstream while still keeping a
      // browser tab healthy if the mail server pops back in a few
      // minutes. `attempt` resets on first successful message.
      const backoffs = [5_000, 15_000, 30_000, 60_000, 120_000, 300_000]
      const delay = backoffs[Math.min(attempt, backoffs.length - 1)]!
      attempt += 1
      reconnectTimer = window.setTimeout(connect, delay)
    }

    function connect() {
      if (cancelled) return
      try {
        es = new EventSource(url, { withCredentials: true })
      } catch {
        scheduleReconnect()
        return
      }
      es.addEventListener("mail-delivered", handleEvent as EventListener)
      es.onopen = () => {
        // Connection alive — if it survives until the first message
        // it's healthy, but we reset the counter eagerly so a clean
        // reconnect after a transient blip doesn't carry the back-
        // off forward.
        attempt = 0
      }
      es.onerror = () => {
        // Native EventSource'ın silent retry'ı yerine kendi
        // backoff'umuzu kullan — connection'ı kapat, takvim koy.
        es?.close()
        es = null
        scheduleReconnect()
      }
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      es?.close()
    }
  }, [slug, lang, membership, buildNotifHref])

  return null
}
