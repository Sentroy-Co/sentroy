"use client"

import { useEffect, useRef } from "react"
import { DEFAULT_WALLPAPER } from "./wallpapers"
import { useWallpaperStore } from "./wallpaper-store"
import { useDockOrderStore } from "./dock-order-store"
import { useDockPinStore } from "./dock-pin-store"
import { useDesktopWidgets } from "./widgets/widget-store"
import {
  consumeLegacyPrefs,
  fetchOsPrefs,
  flushAllPrefs,
  getPrefsSlug,
  queuePrefsPatch,
  readDockOrderCache,
  readDockPinsCache,
  readWallpaperCache,
  setPrefsSlug,
  writeDockOrderCache,
  writeDockPinsCache,
  writeWallpaperCache,
  type LegacyPrefs,
  type OsPrefsDoc,
  type OsPrefsPatch,
} from "./os-prefs-sync"

/**
 * Sentroy OS masaüstü tercihleri — hydrate + write-through orkestrasyonu.
 * sentroy-os aktif slug ile TEK KEZ mount eder. Sunucu tek kaynaktır;
 * localStorage per-slug offline cache + optimistic.
 *
 * Şirket değişince (slug):
 *   1) setPrefsSlug(slug) — write-through hedefi.
 *   2) Optimistic: BU şirketin per-slug cache'ini ANINDA setState — önceki
 *      şirketin tercihi asla görünmez (cache yoksa varsayılana resetlenir).
 *   3) Dedup GET → reconcile: sunucu değeri authoritative; sunucuda eksik alan
 *      için cache/legacy → migration PUT (bir kez sunucuya yaz).
 *
 * Store setState'leri action DEĞİL (echo/write-through tetiklemez).
 */

// ── Echo'suz hydrate (setState + cache yaz) ─────────────────────────────────
function hydrateWallpaper(slug: string, id: string): void {
  writeWallpaperCache(slug, id)
  useWallpaperStore.setState({ wallpaperId: id })
}
function hydrateDockOrder(slug: string, order: string[]): void {
  writeDockOrderCache(slug, order)
  useDockOrderStore.setState({ order })
}
function hydrateDockPins(slug: string, pinned: string[], hidden: string[]): void {
  writeDockPinsCache(slug, { pinned, hidden })
  useDockPinStore.setState({ pinned, hidden })
}

/** Optimistic: yalnız per-slug cache (yoksa varsayılan) — yanlış şirket bleed'i yok. */
function hydrateFromCache(slug: string): void {
  useWallpaperStore.setState({
    wallpaperId: readWallpaperCache(slug) ?? DEFAULT_WALLPAPER,
  })
  useDockOrderStore.setState({ order: readDockOrderCache(slug) ?? [] })
  const dp = readDockPinsCache(slug)
  useDockPinStore.setState({ pinned: dp?.pinned ?? [], hidden: dp?.hidden ?? [] })
  // Widget'lar: widget-layer/menu-bar-pill load() zaten per-slug cache/seed'i gösterir.
}

/** Sunucu dokümanıyla reconcile + eksik alanlar için migration patch üret. */
function reconcile(
  slug: string,
  doc: OsPrefsDoc,
  availableAppIds: string[],
): void {
  const migrate: OsPrefsPatch = {}
  // Eski GLOBAL tercihler yalnız bir alan sunucuda EKSİKSE, BİR KEZ tüketilir.
  let legacy: LegacyPrefs | null | undefined
  const getLegacy = (): LegacyPrefs | null => {
    if (legacy === undefined) legacy = consumeLegacyPrefs()
    return legacy
  }

  // Wallpaper
  if (typeof doc.wallpaper === "string") {
    hydrateWallpaper(slug, doc.wallpaper)
  } else {
    const cached = readWallpaperCache(slug) ?? getLegacy()?.wallpaper
    if (cached) {
      hydrateWallpaper(slug, cached)
      migrate.wallpaper = cached
    }
  }

  // Dock sırası
  if (Array.isArray(doc.dockOrder)) {
    hydrateDockOrder(slug, doc.dockOrder)
  } else {
    const cached = readDockOrderCache(slug) ?? getLegacy()?.dockOrder
    if (cached && cached.length) {
      hydrateDockOrder(slug, cached)
      migrate.dockOrder = cached
    }
  }

  // Dock pin/hidden (birlikte)
  if (Array.isArray(doc.dockPinned) || Array.isArray(doc.dockHidden)) {
    hydrateDockPins(slug, doc.dockPinned ?? [], doc.dockHidden ?? [])
  } else {
    const cached = readDockPinsCache(slug)
    const lg = getLegacy()
    const pinned = cached?.pinned ?? lg?.dockPinned ?? []
    const hidden = cached?.hidden ?? lg?.dockHidden ?? []
    if (pinned.length || hidden.length) {
      hydrateDockPins(slug, pinned, hidden)
      migrate.dockPinned = pinned
      migrate.dockHidden = hidden
    }
  }

  // Widget'lar — widget-store otoriter reconcile (sunucu boşsa seed/local → migrate).
  const { widgets, needMigrate } = useDesktopWidgets
    .getState()
    .syncFromServer(
      slug,
      Array.isArray(doc.widgets) ? doc.widgets : undefined,
      availableAppIds,
    )
  if (needMigrate) migrate.widgets = widgets

  // Tek migration PUT (debounced; sonraki kullanıcı mutasyonlarıyla merge olur).
  if (Object.keys(migrate).length) queuePrefsPatch(slug, migrate)
}

export function useOsPrefsSync(
  slug: string | null,
  availableAppIds: string[],
): void {
  // Seed fallback'i için en güncel app listesi (effect'i re-trigger etmeden).
  const appIdsRef = useRef(availableAppIds)
  appIdsRef.current = availableAppIds

  useEffect(() => {
    if (!slug) {
      setPrefsSlug(null)
      return
    }
    setPrefsSlug(slug)
    hydrateFromCache(slug)

    let cancelled = false
    void (async () => {
      const doc = await fetchOsPrefs(slug)
      // Bu arada başka şirkete geçildiyse uygulama (stale reconcile'ı önle).
      if (cancelled || getPrefsSlug() !== slug) return
      reconcile(slug, doc, appIdsRef.current)
    })()

    return () => {
      cancelled = true
      // Şirket değişimi — eski slug'ın bekleyen patch'ini kaybetme.
      flushAllPrefs()
    }
  }, [slug])

  // Sayfa kapanışında bekleyen patch'leri gönder (keepalive fetch).
  useEffect(() => {
    const onUnload = () => flushAllPrefs()
    window.addEventListener("beforeunload", onUnload)
    return () => window.removeEventListener("beforeunload", onUnload)
  }, [])
}
