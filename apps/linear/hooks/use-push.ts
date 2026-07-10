"use client"

import { useCallback, useEffect, useState } from "react"
import { useDashPaths } from "@/lib/router-compat"
import { usePushPublicKey } from "@/lib/ui-flags-context"

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
  supported: boolean
  permission: NotificationPermission | "unsupported"
  subscribed: boolean
  busy: boolean
  subscribe: () => Promise<void>
  unsubscribe: () => Promise<void>
}

/**
 * Web Push aboneliği. `subscribe()` izin ister + service worker kaydeder +
 * pushManager.subscribe + endpoint'i API'ye POST'lar. Cross-origin OS embed'de
 * tarayıcı push iznini engelleyebilir (asıl kullanım doğrudan linear.sentroy.com
 * ziyaretinde); desteklenmiyorsa supported=false.
 */
export function usePush(): PushState {
  const { apiBase } = useDashPaths()
  const publicKey = usePushPublicKey()
  const [supported, setSupported] = useState(false)
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported")
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window &&
      Boolean(publicKey)
    setSupported(ok)
    if (!ok) return
    setPermission(Notification.permission)
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => {})
  }, [publicKey])

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
      const res = await fetch(`${apiBase}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys }),
      })
      if (res.ok) setSubscribed(true)
    } finally {
      setBusy(false)
    }
  }, [supported, publicKey, apiBase])

  const unsubscribe = useCallback(async () => {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await fetch(`${apiBase}/push`, {
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
  }, [apiBase])

  return { supported, permission, subscribed, busy, subscribe, unsubscribe }
}
