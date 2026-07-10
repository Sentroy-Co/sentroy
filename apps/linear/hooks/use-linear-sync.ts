"use client"

import { useEffect, useRef } from "react"
import { useDashPaths, useRevalidator } from "@/lib/router-compat"

export type SyncEvent = {
  type: string
  action: string
  issueId?: string | null
  resourceId?: string | null
  stateType?: string | null
  issueIdentifier?: string | null
  issueTitle?: string | null
  actorName?: string | null
  assigneeId?: string | null
  creatorId?: string | null
  commentUserId?: string | null
  at: number
}

type Options = {
  enabled?: boolean
  /**
   * Aynı tetiklemeleri burst etmemek için debounce penceresi.
   * Birden çok event yan-yana geldiğinde tek revalidate atılır.
   */
  debounceMs?: number
  /**
   * Event filter — false dönerse revalidate atlanır. Örn. /tasks/:id
   * sayfasındayken sadece o issue'nun event'leri.
   */
  shouldRefresh?: (event: SyncEvent) => boolean
  /**
   * Raw event callback (toast/animasyon vs. için).
   */
  onEvent?: (event: SyncEvent) => void
}

/**
 * Subscribe to the company-scoped `${apiBase}/sync/stream` SSE endpoint
 * (backed by Linear webhooks). Triggers a revalidate (router.refresh)
 * whenever a relevant event arrives — fresh server data without polling.
 *
 * Falls back gracefully: if the connection can't be established or the
 * company has no webhook configured, EventSource quietly retries (no UI
 * noise) and the parallel useAutoRevalidate polling still works.
 */
export function useLinearSync({
  enabled = true,
  debounceMs = 250,
  shouldRefresh,
  onEvent,
}: Options = {}) {
  const { revalidate } = useRevalidator()
  const { apiBase } = useDashPaths()
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (typeof window === "undefined" || typeof EventSource === "undefined")
      return

    const es = new EventSource(`${apiBase}/sync/stream`, {
      withCredentials: true,
    })

    const scheduleRefresh = () => {
      if (timerRef.current !== null) return
      timerRef.current = window.setTimeout(
        () => {
          timerRef.current = null
          revalidate()
        },
        Math.max(0, debounceMs)
      )
    }

    es.addEventListener("sync", (msg: MessageEvent) => {
      try {
        const event = JSON.parse(msg.data) as SyncEvent
        onEvent?.(event)
        if (shouldRefresh && !shouldRefresh(event)) return
        scheduleRefresh()
      } catch {
        // Malformed — ignore.
      }
    })

    // EventSource auto-reconnects on network errors. Silence noise.
    es.onerror = () => undefined

    return () => {
      es.close()
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [enabled, debounceMs, shouldRefresh, onEvent, revalidate, apiBase])
}
