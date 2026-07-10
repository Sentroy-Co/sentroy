"use client"

import { useEffect, useRef } from "react"
import { useRevalidator } from "@/lib/router-compat"

type Options = {
  /**
   * Periyodik yenileme aralığı (ms). null veya 0 → kapalı.
   * Yalnız sekme görünür ve hiçbir yenileme zaten devam etmiyorsa
   * tetiklenir.
   */
  intervalMs?: number | null
  /**
   * Sekme/pencere fokus aldığında anında yenile.
   */
  onFocus?: boolean
  /**
   * document.visibilityState "visible" olduğunda anında yenile.
   */
  onVisible?: boolean
  /**
   * false ise hook hiç hareket etmez (örn. inline-edit halinde
   * polling'i geçici askıya almak için).
   */
  enabled?: boolean
}

/**
 * Mevcut sayfanın server verisini (router.refresh) periyodik ve/veya
 * pencere odağında otomatik yeniden çeker. Linear gibi dış sistemde
 * yapılan değişiklikleri arka planda panele yansıtır.
 */
export function useAutoRevalidate({
  intervalMs = 60_000,
  onFocus = true,
  onVisible = true,
  enabled = true,
}: Options = {}) {
  const { revalidate, state } = useRevalidator()
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    if (!enabled) return
    if (typeof window === "undefined") return

    const refresh = () => {
      // Skip if a revalidation is already in flight, or the tab is hidden.
      if (stateRef.current !== "idle") return
      if (document.visibilityState !== "visible") return
      revalidate()
    }

    const unsubscribers: Array<() => void> = []

    if (onFocus) {
      window.addEventListener("focus", refresh)
      unsubscribers.push(() => window.removeEventListener("focus", refresh))
    }

    if (onVisible) {
      const onVis = () => {
        if (document.visibilityState === "visible") refresh()
      }
      document.addEventListener("visibilitychange", onVis)
      unsubscribers.push(() =>
        document.removeEventListener("visibilitychange", onVis),
      )
    }

    if (intervalMs && intervalMs > 0) {
      const id = window.setInterval(refresh, intervalMs)
      unsubscribers.push(() => window.clearInterval(id))
    }

    return () => {
      for (const fn of unsubscribers) fn()
    }
    // revalidate kimliği shim'de useCallback([router]) ile stable; state'i
    // ref'le okuduğumuz için bağımlılıktan dışlanır.
  }, [enabled, intervalMs, onFocus, onVisible, revalidate])
}
