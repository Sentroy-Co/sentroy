"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useDockPinStore } from "../dock-pin-store"
import { useDesktopWidgets } from "../widgets/widget-store"
import {
  EXPLORED_TOOLS_EVENT,
  EXPLORED_TOOLS_LS_KEY,
  type AchievementDoneMap,
} from "./catalog"

function readExploredTools(): boolean {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem(EXPLORED_TOOLS_LS_KEY) === "1"
  } catch {
    return false
  }
}

// Sticky latch — bir kez KAZANILAN başarım geri ALINMAZ (Apple/oyun
// konvansiyonu). Bazı sinyaller "anlık durum"dur (linear inbox-count okununca
// 0'a düşer, son mailbox silinince create-mailbox false olur) — latch bunların
// başarımı "un-earn" etmesini önler. Per-şirket, append-only.
const latchKey = (slug: string) => `os-achievements-earned:${slug}`

function readLatch(slug: string): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = localStorage.getItem(latchKey(slug))
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(arr) ? (arr as string[]) : [])
  } catch {
    return new Set()
  }
}

/**
 * Başarım done-map fetch'i — masaüstü widget'ı, menü-bar pill'i ve
 * Achievements penceresi ortak kancası. Slug değişince state sıfırlanır ve
 * yeniden çekilir (şirket değişimi); `pollMs` verilirse aralıklı tazeler.
 * `refresh()` mevcut veriyi KORUYARAK yeniden çeker (`refreshing` true —
 * pencere başlığındaki dönen ikon bunu okur); hata → `failed`.
 *
 * CLIENT-tarafı başarımlar (explore-tools / pin-tool-to-dock) API'de YOK;
 * localStorage + dock-pin-store'dan hesaplanıp done-map'e merge edilir
 * (reaktif — pin değişince / Tools açılınca anında yansır). Masaüstü sağ-tık
 * "Refresh widgets" (widget-store.refreshNonce) bump'ı da yeniden fetch eder.
 */
export function useAchievements(
  slug: string | null,
  opts?: { pollMs?: number },
) {
  const pollMs = opts?.pollMs
  const [rawDone, setRawDone] = useState<AchievementDoneMap | null>(null)
  const [failed, setFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  // Manuel retry/refresh tetikleyicisi.
  const [nonce, setNonce] = useState(0)
  // Slug değişimini refresh'ten ayırt et — refresh mevcut veriyi blank'lemesin.
  const lastSlug = useRef<string | null>(null)

  // Client-tarafı sinyaller (reaktif).
  const pinned = useDockPinStore((s) => s.pinned)
  const widgetRefreshNonce = useDesktopWidgets((s) => s.refreshNonce)
  const [exploredTools, setExploredTools] = useState(readExploredTools)
  useEffect(() => {
    const onExplored = () => setExploredTools(true)
    window.addEventListener(EXPLORED_TOOLS_EVENT, onExplored)
    return () => window.removeEventListener(EXPLORED_TOOLS_EVENT, onExplored)
  }, [])

  const localMap = useMemo<AchievementDoneMap>(
    () => ({
      "explore-tools": exploredTools,
      "pin-tool-to-dock": pinned.some(
        (id) => id.startsWith("tool:") || id.startsWith("platform:"),
      ),
    }),
    [exploredTools, pinned],
  )

  // Kazanılmış başarım latch'i (slug'a göre seed'lenir, append-only).
  const [latch, setLatch] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    setLatch(slug ? readLatch(slug) : new Set())
  }, [slug])

  const refresh = useCallback(() => {
    setFailed(false)
    setNonce((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!slug) {
      lastSlug.current = null
      setRawDone(null)
      return
    }
    let cancelled = false
    if (lastSlug.current !== slug) {
      // Şirket değişti — eski şirketin verisi gösterilmesin.
      lastSlug.current = slug
      setRawDone(null)
      setFailed(false)
    }

    const load = async () => {
      setRefreshing(true)
      try {
        const res = await fetch(`/api/companies/${slug}/achievements`)
        if (!res.ok) throw new Error(String(res.status))
        const json = (await res.json()) as {
          data?: { done?: AchievementDoneMap }
        }
        if (cancelled) return
        const map = json?.data?.done
        if (map && typeof map === "object") {
          setRawDone(map)
          setFailed(false)
        } else {
          setFailed(true)
        }
      } catch {
        if (!cancelled) setFailed(true)
      } finally {
        if (!cancelled) setRefreshing(false)
      }
    }

    void load()
    const id = pollMs ? setInterval(() => void load(), pollMs) : null
    return () => {
      cancelled = true
      if (id) clearInterval(id)
    }
    // widgetRefreshNonce: masaüstü "Refresh widgets" → başarımları da tazele.
  }, [slug, pollMs, nonce, widgetRefreshNonce])

  // Anlık gerçek (API + yerel), latch'ten ÖNCE — yeni kazanılanları yakalamak için.
  const current = useMemo<AchievementDoneMap>(
    () => (rawDone ? { ...rawDone, ...localMap } : localMap),
    [rawDone, localMap],
  )

  // Yeni kazanılanları latch'e ekle + kalıcılaştır (append-only; asla çıkarma).
  useEffect(() => {
    if (!slug) return
    setLatch((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const [id, isDone] of Object.entries(current)) {
        if (isDone && !next.has(id)) {
          next.add(id)
          changed = true
        }
      }
      if (!changed) return prev
      try {
        localStorage.setItem(latchKey(slug), JSON.stringify([...next]))
      } catch {
        /* storage engelli — latch bu oturumda bellek içi çalışır */
      }
      return next
    })
  }, [slug, current])

  // Nihai done: API henüz yüklenmediyse null (yükleniyor durumu korunur);
  // yüklendiğinde anlık gerçek ∪ latch (kazanılmış olan hep true kalır).
  const done = useMemo<AchievementDoneMap | null>(() => {
    if (!rawDone) return null
    const merged: AchievementDoneMap = { ...current }
    for (const id of latch) merged[id] = true
    return merged
  }, [rawDone, current, latch])

  return { done, failed, refreshing, refresh }
}
