"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { motion } from "framer-motion"
import { HugeiconsIcon } from "@hugeicons/react"
import type { AppDescriptor } from "@workspace/console/components/layout/app-launcher"

/**
 * Sentroy App Store uygulaması için SANDBOX'lı iframe. ⚠ Güvenlik kalbi:
 * - sandbox/allow SERVER'da hesaplanan değerlerden (descriptor.embed) gelir.
 * - Kimlik yalnız kısa-ömürlü embed token ile geçer (cookie ASLA).
 * - Token /api/app-store/embed-token'dan mint edilir; URL'ye param olarak girer.
 * - postMessage bridge: yalnız app origin'inden gelen mesajı kabul eder;
 *   "app:request-token-refresh" → taze token postlar (iframe reload etmeden).
 */
export function StoreAppFrame({
  app,
  lang,
  interacting,
}: {
  app: AppDescriptor
  lang: string
  interacting: boolean
}) {
  const embed = app.embed!
  const origin = useMemo(() => {
    try {
      return new URL(app.href).origin
    } catch {
      return ""
    }
  }, [app.href])
  const { resolvedTheme } = useTheme()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Token mint (gerekiyorsa) — auth.mode none ise atla.
  const needsToken = embed.injectedParams.includes("token") && embed.authMode !== "none"

  async function fetchToken(): Promise<string | null> {
    try {
      const res = await fetch("/api/app-store/embed-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appId: embed.appId, companySlug: embed.companySlug }),
      })
      if (!res.ok) return null
      const json = (await res.json()) as { data?: { token?: string } }
      return json.data?.token ?? null
    } catch {
      return null
    }
  }

  // İlk yüklemede src'yi (token dahil) kur.
  useEffect(() => {
    let cancelled = false
    async function build() {
      const u = new URL(app.href)
      const langToUse = embed.supportedLangs.includes(lang) ? lang : embed.fallbackLang
      const set = new Set(embed.injectedParams)
      if (set.has("lang")) u.searchParams.set("lang", langToUse)
      if (set.has("fallbackLang")) u.searchParams.set("fallbackLang", embed.fallbackLang)
      if (set.has("theme")) u.searchParams.set("theme", resolvedTheme === "dark" ? "dark" : "light")
      if (set.has("companySlug")) u.searchParams.set("companySlug", embed.companySlug)
      if (needsToken) {
        const token = await fetchToken()
        if (!token) {
          if (!cancelled) setError("Could not authenticate with Sentroy")
          return
        }
        u.searchParams.set("token", token)
      }
      if (!cancelled) setSrc(u.toString())
    }
    void build()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.href, lang, resolvedTheme])

  // postMessage bridge — yalnız app origin'i; token refresh isteğine yanıt ver.
  useEffect(() => {
    if (!origin) return
    async function onMessage(e: MessageEvent) {
      if (e.origin !== origin) return // origin guard — başka kaynak yok sayılır
      const data = e.data as { type?: string } | null
      if (!data || typeof data.type !== "string") return
      if (data.type === "app:request-token-refresh" && needsToken) {
        const token = await fetchToken()
        if (token && iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage({ type: "sentroy:token", token }, origin)
        }
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, needsToken])

  if (error) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-2 bg-background p-6 text-center">
        <span className="text-sm font-medium text-foreground">{app.name}</span>
        <span className="text-xs text-destructive">{error}</span>
      </div>
    )
  }

  return (
    <div className="relative size-full bg-background" style={{ minHeight: embed.minHeight ?? undefined }}>
      {src ? (
        <iframe
          ref={iframeRef}
          src={src}
          title={app.name}
          sandbox={embed.sandbox}
          allow={embed.allow}
          referrerPolicy="strict-origin-when-cross-origin"
          className="size-full border-0 bg-background"
          style={{ pointerEvents: interacting ? "none" : undefined }}
          onLoad={() => setLoaded(true)}
        />
      ) : null}
      {!loaded ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-background">
          <motion.span
            animate={{ scale: [0.92, 1.02, 0.92] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
            className="flex size-16 items-center justify-center overflow-hidden rounded-[24%] shadow-xl"
            style={{ background: `linear-gradient(155deg, ${app.color}, ${app.color}bb)` }}
          >
            {app.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={app.logoUrl} alt="" className="size-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
            ) : (
              <HugeiconsIcon icon={app.icon} className="size-1/2 text-white drop-shadow" strokeWidth={2} />
            )}
          </motion.span>
          <div className="h-1 w-36 overflow-hidden rounded-full bg-muted">
            <motion.div
              initial={{ x: "-110%" }}
              animate={{ x: "210%" }}
              transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut" }}
              className="h-full w-1/2 rounded-full"
              style={{ background: app.color }}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
