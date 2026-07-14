"use client"

import { useEffect, useRef } from "react"

interface MailPushEvent {
  id: string
  from: string | null
  subject: string | null
  url: string
  mailbox: string
  createdAt: string
}

const POLL_MS = 20_000

/**
 * Sentroy masaüstü (Electron) uygulamasında yeni mail için native OS bildirimi.
 * Tarayıcıda bildirim VAPID Web Push ile gelir; Electron'un Chromium'unda push
 * service olmadığından VAPID çalışmaz. Bunun yerine mail-server → core her yeni
 * mail için kısa-ömürlü bir kayıt bırakır (mail_push_events); bu hook yalnız
 * Electron'da (`window.sentroyDesktop`) `/api/push/recent`'i poll'lar ve her yeni
 * olay için `new Notification` gösterir (Electron bunu native macOS/Windows
 * bildirimine çevirir). Tıklama → OS'ta mail uygulamasını açan deep-link.
 * Tarayıcıda no-op → VAPID ile çift bildirim olmaz.
 */
export function useMailDesktopNotify() {
  const sinceRef = useRef<number>(Date.now())

  useEffect(() => {
    const isDesktop =
      typeof window !== "undefined" &&
      Boolean((window as { sentroyDesktop?: unknown }).sentroyDesktop)
    if (!isDesktop) return

    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission().catch(() => {})
    }

    let cancelled = false
    let timer: number | null = null

    async function poll() {
      try {
        const res = await fetch(`/api/push/recent?since=${sinceRef.current}`, {
          cache: "no-store",
        })
        if (res.ok) {
          const json = (await res.json()) as {
            data?: { events?: MailPushEvent[] }
          }
          const events = json?.data?.events ?? []
          for (const e of events) {
            const ts = new Date(e.createdAt).getTime()
            if (Number.isFinite(ts) && ts > sinceRef.current) sinceRef.current = ts
            if (
              typeof Notification !== "undefined" &&
              Notification.permission === "granted"
            ) {
              try {
                const n = new Notification(e.from || "New mail", {
                  body: e.subject || "",
                  tag: e.mailbox || undefined,
                  icon: "/sentroy_pwa.png",
                })
                n.onclick = () => {
                  window.focus()
                  if (e.url) window.location.href = e.url
                  n.close()
                }
                setTimeout(() => n.close(), 8000)
              } catch {
                /* Notification bazı ortamlarda atabilir — yut */
              }
            }
          }
        }
      } catch {
        /* ağ hatası — sonraki poll'da tekrar dener */
      }
      if (!cancelled) timer = window.setTimeout(poll, POLL_MS)
    }

    // İlk poll'u kısa gecikmeyle (sayfa + session otursun).
    timer = window.setTimeout(poll, 5_000)
    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [])
}
