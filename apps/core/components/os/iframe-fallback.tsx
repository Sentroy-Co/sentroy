"use client"

// OS iframe fallback'i — alt-app erişilemezken (502/504/ağ) çıplak "Bad
// Gateway" HTML'i yerine OS-stilinde nazik bir hata: app ikonu + "Uygulama
// başlatılamadı" + yeniden dene. Sağlık, core'un /api/os/probe endpoint'iyle
// server-side yoklanır (iframe cross-origin durum okuyamaz).

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import type { AppDescriptor } from "@workspace/console/components/layout/app-launcher"

export type ProbeState = "pending" | "ok" | "down"

/**
 * Hedef URL'i bir kez yoklar; `retry()` yeniden dener. Probe endpoint'inin
 * kendisi hata verirse iyimser "ok" kabul edilir (yanlış-pozitif fallback
 * gerçek içeriği gizlemesin).
 */
export function useAppProbe(src: string | null): { state: ProbeState; retry: () => void } {
  const [state, setState] = useState<ProbeState>("pending")
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!src) return
    let alive = true
    setState("pending")
    ;(async () => {
      try {
        const res = await fetch(`/api/os/probe?url=${encodeURIComponent(src)}`)
        if (!res.ok) {
          if (alive) setState("ok") // probe altyapısı sorunlu → iyimser
          return
        }
        const j = (await res.json()) as { data?: { ok?: boolean } }
        if (alive) setState(j.data?.ok === false ? "down" : "ok")
      } catch {
        if (alive) setState("ok")
      }
    })()
    return () => {
      alive = false
    }
  }, [src, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { state, retry }
}

/** OS-stilinde "Uygulama başlatılamadı" ekranı — ikon + mesaj + tekrar dene. */
export function AppLaunchFallback({
  icon,
  color,
  name,
  onRetry,
}: {
  icon: AppDescriptor["icon"]
  color: string
  name: string
  onRetry: () => void
}) {
  const t = useTranslations("os")
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 bg-background">
      <span
        className="flex size-16 items-center justify-center overflow-hidden rounded-[28%] opacity-60 shadow-lg ring-1 ring-white/20 saturate-50"
        style={{ background: `linear-gradient(150deg, ${color}, ${color}cc)` }}
        aria-hidden
      >
        <HugeiconsIcon icon={icon} className="size-7 text-white drop-shadow-md" strokeWidth={2} />
      </span>
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-sm font-medium text-foreground">{name}</span>
        <span className="text-xs text-muted-foreground">{t("appLaunchFailed")}</span>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full border border-border/70 px-4 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-foreground/5"
      >
        {t("appLaunchRetry")}
      </button>
    </div>
  )
}
