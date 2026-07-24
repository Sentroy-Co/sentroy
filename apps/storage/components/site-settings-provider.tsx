"use client"

import { createContext, useContext, useEffect, useState } from "react"

/**
 * Storage app site settings — admin tarafından admin panel'de değiştirilen,
 * frontend'in bilmesi gereken global değerler. Şu an sadece tek-dosya
 * upload limit; gelecekte storage-related diğer publik config eklenecek.
 *
 * Provider /api/site-settings'i bir kez fetch eder + Context ile çocuklara
 * yayar. Layout-level mount → tüm storage sayfaları aynı değeri görür.
 */

export interface SiteSettings {
  maxUploadBytes: number
}

const DEFAULT_SETTINGS: SiteSettings = {
  maxUploadBytes: 524288000, // 500 MB fallback (admin override etmediyse)
}

const SiteSettingsContext = createContext<SiteSettings>(DEFAULT_SETTINGS)

export function SiteSettingsProvider({
  initial,
  children,
}: {
  /** Server-side fetched initial — SSR + hydration tutarlılığı için. */
  initial?: SiteSettings
  children: React.ReactNode
}) {
  const [settings, setSettings] = useState<SiteSettings>(
    initial ?? DEFAULT_SETTINGS,
  )

  // Initial verilmediyse client'tan fetch et (fallback path).
  useEffect(() => {
    if (initial) return
    let cancelled = false
    fetch("/api/site-settings")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        if (j?.data?.maxUploadBytes) {
          setSettings({ maxUploadBytes: j.data.maxUploadBytes as number })
        }
      })
      .catch(() => {
        /* default'a düş */
      })
    return () => {
      cancelled = true
    }
  }, [initial])

  return (
    <SiteSettingsContext.Provider value={settings}>
      {children}
    </SiteSettingsContext.Provider>
  )
}

export function useSiteSettings(): SiteSettings {
  return useContext(SiteSettingsContext)
}

export function useMaxUploadBytes(): number {
  return useContext(SiteSettingsContext).maxUploadBytes
}
