"use client"

import type { DesktopWidgetInstance } from "./widgets/registry"

/**
 * Sentroy OS masaüstü tercihleri — istemci senkron katmanı (SUNUCU TEK KAYNAK,
 * localStorage OFFLINE CACHE + optimistic). Duvar kâğıdı / dock sırası / dock
 * pin-hidden / masaüstü widget'ları per-user-per-company DB'de saklanır
 * (bkz. /api/companies/[slug]/os-preferences). Bu dosya SAF yardımcıdır:
 *
 *  - Aktif slug (write-through hedefi) — sentroy-os company değişince set eder.
 *  - `queuePrefsPatch(slug, patch)` — 800ms DEBOUNCED, per-slug PUT (şirketler
 *    izole; A'nın patch'i asla B'ye gitmez).
 *  - `fetchOsPrefs(slug)` — mount hydrate GET (aynı tick'teki çoklu çağrıyı
 *    dedup eder: widget-store.load + useOsPrefsSync tek istek paylaşır).
 *  - Per-slug localStorage cache oku/yaz (son-aktif-şirket cache'i) + eski
 *    GLOBAL zustand-persist anahtarlarını bir kereye mahsus migration okuma.
 *
 * React yok, store importu yok → store'lar buradan write-through helper'ı
 * import eder (tek yön; döngü yok). Hydrate hook'u use-os-prefs-sync.ts'de.
 */

export interface OsPrefsPatch {
  wallpaper?: string
  dockOrder?: string[]
  dockPinned?: string[]
  dockHidden?: string[]
  widgets?: DesktopWidgetInstance[]
}

/** Sunucudan dönen tercih dokümanı (tümü opsiyonel — yoksa istemci varsayılanı). */
export type OsPrefsDoc = OsPrefsPatch

const DEBOUNCE_MS = 800

// ── Aktif slug ────────────────────────────────────────────────────────────
let activeSlug: string | null = null
/** Write-through hedefi. sentroy-os aktif şirket çözülünce/değişince çağırır. */
export function setPrefsSlug(slug: string | null): void {
  activeSlug = slug
}
export function getPrefsSlug(): string | null {
  return activeSlug
}

// ── Debounced PUT (per-slug) ────────────────────────────────────────────────
interface Pending {
  patch: OsPrefsPatch
  timer: ReturnType<typeof setTimeout> | null
}
const pendingBySlug = new Map<string, Pending>()

async function flush(slug: string): Promise<void> {
  const p = pendingBySlug.get(slug)
  if (!p) return
  pendingBySlug.delete(slug)
  const body = p.patch
  if (Object.keys(body).length === 0) return
  try {
    await fetch(`/api/companies/${slug}/os-preferences`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    })
  } catch {
    /* offline — localStorage cache korunur; sonraki mutasyon tekrar dener */
  }
}

/**
 * Sunucuya yansıtılacak partial patch'i kuyruğa al (800ms debounce). Aynı
 * slug'a gelen ardışık patch'ler MERGE edilir; tek PUT atılır.
 */
export function queuePrefsPatch(slug: string, patch: OsPrefsPatch): void {
  if (!slug) return
  const prev = pendingBySlug.get(slug)
  const merged: OsPrefsPatch = { ...(prev?.patch ?? {}), ...patch }
  if (prev?.timer) clearTimeout(prev.timer)
  const timer = setTimeout(() => void flush(slug), DEBOUNCE_MS)
  pendingBySlug.set(slug, { patch: merged, timer })
}

/** Bekleyen tüm patch'leri hemen gönder (şirket değişimi / sayfa kapanışı). */
export function flushAllPrefs(): void {
  for (const slug of [...pendingBySlug.keys()]) {
    const p = pendingBySlug.get(slug)
    if (p?.timer) clearTimeout(p.timer)
    void flush(slug)
  }
}

// ── Hydrate GET (dedup) ─────────────────────────────────────────────────────
const inflightGet = new Map<string, Promise<OsPrefsDoc>>()

export function fetchOsPrefs(slug: string): Promise<OsPrefsDoc> {
  const existing = inflightGet.get(slug)
  if (existing) return existing
  const p = (async (): Promise<OsPrefsDoc> => {
    try {
      const res = await fetch(`/api/companies/${slug}/os-preferences`, {
        cache: "no-store",
      })
      if (!res.ok) return {}
      const json = (await res.json()) as { data?: OsPrefsDoc } | null
      return (json?.data ?? {}) as OsPrefsDoc
    } catch {
      return {}
    } finally {
      inflightGet.delete(slug)
    }
  })()
  inflightGet.set(slug, p)
  return p
}

// ── Per-slug localStorage cache ─────────────────────────────────────────────
const WP_PREFIX = "sentroy-os-wallpaper:"
const DO_PREFIX = "sentroy-os-dock-order:"
const DP_PREFIX = "sentroy-os-dock-pins:"

function hasWindow(): boolean {
  return typeof window !== "undefined"
}

export function readWallpaperCache(slug: string): string | undefined {
  if (!hasWindow()) return undefined
  try {
    return localStorage.getItem(WP_PREFIX + slug) ?? undefined
  } catch {
    return undefined
  }
}
export function writeWallpaperCache(slug: string, id: string): void {
  if (!hasWindow()) return
  try {
    localStorage.setItem(WP_PREFIX + slug, id)
  } catch {
    /* quota — sessiz */
  }
}

export function readDockOrderCache(slug: string): string[] | undefined {
  if (!hasWindow()) return undefined
  try {
    const raw = localStorage.getItem(DO_PREFIX + slug)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : undefined
  } catch {
    return undefined
  }
}
export function writeDockOrderCache(slug: string, order: string[]): void {
  if (!hasWindow()) return
  try {
    localStorage.setItem(DO_PREFIX + slug, JSON.stringify(order))
  } catch {
    /* quota — sessiz */
  }
}

export interface DockPinsCache {
  pinned: string[]
  hidden: string[]
}
export function readDockPinsCache(slug: string): DockPinsCache | undefined {
  if (!hasWindow()) return undefined
  try {
    const raw = localStorage.getItem(DP_PREFIX + slug)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { pinned?: unknown; hidden?: unknown }
    const pinned = Array.isArray(parsed?.pinned)
      ? parsed.pinned.filter((x): x is string => typeof x === "string")
      : []
    const hidden = Array.isArray(parsed?.hidden)
      ? parsed.hidden.filter((x): x is string => typeof x === "string")
      : []
    return { pinned, hidden }
  } catch {
    return undefined
  }
}
export function writeDockPinsCache(slug: string, pins: DockPinsCache): void {
  if (!hasWindow()) return
  try {
    localStorage.setItem(DP_PREFIX + slug, JSON.stringify(pins))
  } catch {
    /* quota — sessiz */
  }
}

// ── Eski GLOBAL zustand-persist anahtarları (bir kereye mahsus migration) ────
const LEGACY_WP = "sentroy-os-wallpaper"
const LEGACY_DO = "sentroy-os-dock-order"
const LEGACY_DP = "sentroy-os-dock-pins"

/** zustand persist zarfı: `{"state":{...},"version":0}`. state'i çıkar. */
function legacyState(key: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { state?: unknown }
    return parsed && typeof parsed.state === "object"
      ? (parsed.state as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export interface LegacyPrefs {
  wallpaper?: string
  dockOrder?: string[]
  dockPinned?: string[]
  dockHidden?: string[]
}

let legacyConsumed = false
/**
 * Eski GLOBAL (şirket-öncesi) tercihleri BİR KEZ oku ve anahtarları temizle.
 * İlk açılan şirkete migration için kullanılır; sonraki şirketler bu değeri
 * MİRAS ALMAZ (global anahtar tüketildi). Zaten senkronlanmış (server dolu)
 * kullanıcıda çağrılsa bile zararsız (yalnız temizler).
 */
export function consumeLegacyPrefs(): LegacyPrefs | null {
  if (legacyConsumed || !hasWindow()) return null
  legacyConsumed = true
  const out: LegacyPrefs = {}
  const wp = legacyState(LEGACY_WP)
  if (wp && typeof wp.wallpaperId === "string") out.wallpaper = wp.wallpaperId
  const dordr = legacyState(LEGACY_DO)
  if (dordr && Array.isArray(dordr.order)) {
    out.dockOrder = (dordr.order as unknown[]).filter(
      (x): x is string => typeof x === "string",
    )
  }
  const dp = legacyState(LEGACY_DP)
  if (dp) {
    if (Array.isArray(dp.pinned)) {
      out.dockPinned = (dp.pinned as unknown[]).filter(
        (x): x is string => typeof x === "string",
      )
    }
    if (Array.isArray(dp.hidden)) {
      out.dockHidden = (dp.hidden as unknown[]).filter(
        (x): x is string => typeof x === "string",
      )
    }
  }
  try {
    localStorage.removeItem(LEGACY_WP)
    localStorage.removeItem(LEGACY_DO)
    localStorage.removeItem(LEGACY_DP)
  } catch {
    /* sessiz */
  }
  return Object.keys(out).length ? out : null
}
