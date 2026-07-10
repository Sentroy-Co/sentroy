"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { KanbanIcon, ArrowRight02Icon } from "@hugeicons/core-free-icons"
import { WidgetErrorState, WidgetHeader, WidgetSpinner } from "./widget-ui"

const POLL_MS = 90_000
const LINEAR_COLOR = "#5E6AD2"

/**
 * Linear "My requests" widget'ı — Inbox'taki okunmamış talep SAYACI.
 * Veri kaynağı mevcut endpoint (core rewrite):
 *   GET /api/linear/companies/[slug]/inbox-count → { data: { count } }
 * NOT: Linear app'te JSON "son N talep" liste endpoint'i yok (requests sayfası
 * server-render; /issues GET form metadata, /search q ister) — platform kuralı
 * gereği yeni endpoint yazılmadı, v1 yalnız sayaç + "Open Linear" (rapor edildi).
 * Endpoint Linear bağlı değilken de count:0 döner — 0 nötr gösterilir.
 */
export function LinearWidgetContent({
  slug,
  refreshKey = 0,
  onOpenApp,
}: {
  slug: string
  /** Sağ-tık "Refresh widgets" sayacı — değişince yeniden fetch. */
  refreshKey?: number
  onOpenApp: (appId: string) => void
}) {
  const t = useTranslations("os")
  const [count, setCount] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setCount(null)
    setFailed(false)
    const load = async () => {
      try {
        const res = await fetch(`/api/linear/companies/${slug}/inbox-count`)
        if (!res.ok) throw new Error(String(res.status))
        const json = (await res.json()) as { data?: { count?: number } }
        if (cancelled) return
        setCount(typeof json.data?.count === "number" ? json.data.count : 0)
        setFailed(false)
      } catch {
        if (!cancelled) setFailed(true)
      }
    }
    void load()
    const id = setInterval(() => void load(), POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [slug, nonce, refreshKey])

  return (
    <div className="p-3">
      <WidgetHeader
        icon={KanbanIcon}
        color={LINEAR_COLOR}
        title={t("widgetsHub.types.linear-requests.title")}
      />
      {failed ? (
        <WidgetErrorState onRetry={() => setNonce((n) => n + 1)} />
      ) : count === null ? (
        <WidgetSpinner />
      ) : (
        <div className="mt-2 flex items-end justify-between gap-2 px-1 pb-1">
          <div>
            <div className="text-[30px] font-semibold leading-none tabular-nums text-foreground">
              {count}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("widgetsHub.linear.openRequests")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenApp("linear")}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-foreground/80 hover:bg-foreground/10"
          >
            {t("widgetsHub.linear.open")}
            <HugeiconsIcon icon={ArrowRight02Icon} className="size-3" strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  )
}
