"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Cloudflare Turnstile (CAPTCHA) widget. `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
 * env'i set edilmişse render olur, doğrulama tokenını parent'a callback
 * ile iletir. Set edilmemişse hiçbir şey render etmez (dev-friendly).
 *
 * Server-side karşılığı: `verifyTurnstileToken(token, ip)` —
 * `BETTER_AUTH_TURNSTILE_SECRET` ile Cloudflare siteverify'a fetch atar.
 *
 * Script lazy-load edilir (her form mount'unda); birden fazla widget
 * render olursa Turnstile bunları kendisi keep-alive yapar.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        opts: {
          sitekey: string
          callback: (token: string) => void
          "error-callback"?: () => void
          "expired-callback"?: () => void
          theme?: "light" | "dark" | "auto"
          appearance?: "always" | "execute" | "interaction-only"
        },
      ) => string
      reset: (widgetId?: string) => void
      remove: (widgetId?: string) => void
    }
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

let scriptPromise: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      `script[src^="https://challenges.cloudflare.com/turnstile"]`,
    )
    if (existing) {
      existing.addEventListener("load", () => resolve())
      return
    }
    const s = document.createElement("script")
    s.src = SCRIPT_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error("Failed to load Turnstile"))
    document.head.appendChild(s)
  })
  return scriptPromise
}

interface TurnstileWidgetProps {
  /** Token üretildiğinde tetiklenir; form bunu hidden input'a yazar. */
  onToken: (token: string) => void
  /** Token expire edince ya da error olunca; form gönderim disable. */
  onClear?: () => void
  /** Light/dark/auto. Default auto (sistem tercihiyle uyumlu). */
  theme?: "light" | "dark" | "auto"
}

export function TurnstileWidget({
  onToken,
  onClear,
  theme = "auto",
}: TurnstileWidgetProps) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!siteKey) return
    let cancelled = false

    loadScript()
      .then(() => {
        if (cancelled) return
        const ts = window.turnstile
        const el = containerRef.current
        if (!ts || !el) return
        widgetIdRef.current = ts.render(el, {
          sitekey: siteKey,
          theme,
          callback: (token) => onToken(token),
          "expired-callback": () => onClear?.(),
          "error-callback": () => {
            setError("Captcha failed. Refresh the page.")
            onClear?.()
          },
        })
      })
      .catch((err) => {
        console.warn("[turnstile] script load failed:", err)
        setError("Captcha could not load. Refresh the page.")
      })

    return () => {
      cancelled = true
      const ts = window.turnstile
      if (ts && widgetIdRef.current) {
        try {
          ts.remove(widgetIdRef.current)
        } catch {
          // mount/unmount race — ignore
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, theme])

  if (!siteKey) return null

  return (
    <div className="flex flex-col gap-1">
      <div ref={containerRef} />
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  )
}

/**
 * Turnstile config'i kontrolü — formlar siteKey yoksa "submit disable"
 * mantığını atlayabilir. SSR-safe (env her zaman client'ta okunur).
 *
 * `NEXT_PUBLIC_TURNSTILE_DISABLED=1` set edilirse site key olsa bile
 * widget render olmaz — server-side `TURNSTILE_DISABLED` ile pair'lı
 * çalışır (ikisi de set edilince captcha tamamen sessizleşir).
 */
export function isTurnstileEnabled(): boolean {
  if (
    process.env.NEXT_PUBLIC_TURNSTILE_DISABLED === "1" ||
    process.env.NEXT_PUBLIC_TURNSTILE_DISABLED === "true"
  ) {
    return false
  }
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
}
