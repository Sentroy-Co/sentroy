"use client"

import { useEffect, useRef } from "react"

interface Props {
  siteKey: string
  onToken: (token: string | null) => void
  /** Theme: "auto" (default), "light", "dark" */
  theme?: "auto" | "light" | "dark"
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string
          callback: (token: string) => void
          "expired-callback"?: () => void
          "error-callback"?: () => void
          theme?: "auto" | "light" | "dark"
          size?: "normal" | "flexible" | "compact"
        },
      ) => string
      reset: (id: string) => void
      remove: (id: string) => void
    }
  }
}

let scriptLoadingPromise: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (scriptLoadingPromise) return scriptLoadingPromise
  if (typeof window === "undefined") return Promise.reject(new Error("no window"))
  if (window.turnstile) return Promise.resolve()
  scriptLoadingPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js"
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Failed to load Turnstile script"))
    document.head.appendChild(script)
  })
  return scriptLoadingPromise
}

export function TurnstileWidget({ siteKey, onToken, theme = "auto" }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const callbackRef = useRef(onToken)
  callbackRef.current = onToken

  useEffect(() => {
    let mounted = true
    loadScript()
      .then(() => {
        if (!mounted || !ref.current || !window.turnstile) return
        widgetIdRef.current = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          theme,
          size: "flexible",
          callback: (token: string) => callbackRef.current(token),
          "expired-callback": () => callbackRef.current(null),
          "error-callback": () => callbackRef.current(null),
        })
      })
      .catch((err) => {
        console.warn("[turnstile] load failed:", err)
      })

    return () => {
      mounted = false
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch {
          // ignore
        }
      }
    }
  }, [siteKey, theme])

  return <div ref={ref} className="cf-turnstile" />
}
