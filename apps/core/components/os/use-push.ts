"use client"

import { useCallback, useEffect, useState } from "react"

// VAPID public key (base64url) → Uint8Array (applicationServerKey).
// ArrayBuffer üstünden allocate: TS 5.7+ Uint8Array<ArrayBufferLike>'ı
// BufferSource (ArrayBuffer bekler) yerine kabul etmiyor.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(b64)
  const arr = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export type PushState = {
  /** Tarayıcı push destekliyor + VAPID yapılandırılmış mı. */
  supported: boolean
  permission: NotificationPermission | "unsupported"
  subscribed: boolean
  busy: boolean
  subscribe: () => Promise<void>
  unsubscribe: () => Promise<void>
}

/**
 * OS bildirim (Web Push) aboneliği — menu-bar toggle'ının motoru. VAPID public
 * key'i /api/push/public-key'ten çeker (env'de yoksa push devre dışı).
 * `subscribe()` izin ister + service worker kaydeder + pushManager.subscribe +
 * endpoint'i /api/push/subscribe'a POST'lar. Toggle kapatınca DELETE.
 *
 * Not: OS core.sentroy.com kökünde (embed DEĞİL) → push same-origin çalışır.
 */
export function usePush(): PushState {
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [supported, setSupported] = useState(false)
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported")
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)

  // Tarayıcı yeteneği + VAPID public key'i tespit et.
  useEffect(() => {
    const capable =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window
    if (!capable) return
    let cancelled = false
    fetch("/api/push/public-key")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return
        const key = (j as { data?: { publicKey?: string | null } } | null)?.data
          ?.publicKey
        if (!key) return
        setPublicKey(key)
        setSupported(true)
        setPermission(Notification.permission)
        navigator.serviceWorker
          .getRegistration()
          .then((reg) => reg?.pushManager.getSubscription())
          .then((sub) => !cancelled && setSubscribed(Boolean(sub)))
          .catch(() => {})
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const subscribe = useCallback(async () => {
    if (!supported || !publicKey) return
    setBusy(true)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== "granted") return
      const reg = await navigator.serviceWorker.register("/sw.js")
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      const json = sub.toJSON() as { keys?: { p256dh?: string; auth?: string } }
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys }),
      })
      if (res.ok) setSubscribed(true)
    } finally {
      setBusy(false)
    }
  }, [supported, publicKey])

  const unsubscribe = useCallback(async () => {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {})
        await sub.unsubscribe().catch(() => {})
      }
      setSubscribed(false)
    } finally {
      setBusy(false)
    }
  }, [])

  return { supported, permission, subscribed, busy, subscribe, unsubscribe }
}
