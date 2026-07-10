import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Platform } from "./platform"

/**
 * İndirme geçmişi — localStorage'da 1 SAAT tutulur (worker'daki dosya TTL'i ile
 * eşleşir; süresi geçen kayıtlar düşer, çünkü `token` ile indirme linki de
 * 1 saat sonra sunucuda silinir). Login yok → tamamen client-side.
 */
export interface HistoryItem {
  id: string
  url: string
  platform: Platform
  title: string
  thumbnail: string | null
  kind: "video" | "audio" | "thumbnail" | "image" | "carousel" | "profile"
  quality: string
  filename: string
  token: string
  at: number
}

export const HISTORY_TTL_MS = 60 * 60 * 1000 // 1 saat

interface DownloadState {
  history: HistoryItem[]
  hydrated: boolean
  setHydrated: () => void
  addToHistory: (item: Omit<HistoryItem, "id" | "at">) => void
  removeFromHistory: (id: string) => void
  pruneExpired: () => void
  clearHistory: () => void
  /** Süresi geçmemiş kayıtlar (UI için). */
  activeHistory: () => HistoryItem[]
}

function fresh(items: HistoryItem[]): HistoryItem[] {
  const now = Date.now()
  return items.filter((h) => now - h.at < HISTORY_TTL_MS)
}

export const useDownloadStore = create<DownloadState>()(
  persist(
    (set, get) => ({
      history: [],
      hydrated: false,
      setHydrated: () => set({ hydrated: true }),
      addToHistory: (item) =>
        set((s) => ({
          history: [
            {
              ...item,
              id:
                typeof crypto !== "undefined" && crypto.randomUUID
                  ? crypto.randomUUID()
                  : String(Date.now() + Math.round(performance.now())),
              at: Date.now(),
            },
            ...fresh(s.history),
          ].slice(0, 24),
        })),
      removeFromHistory: (id) =>
        set((s) => ({ history: s.history.filter((h) => h.id !== id) })),
      pruneExpired: () => set((s) => ({ history: fresh(s.history) })),
      clearHistory: () => set({ history: [] }),
      activeHistory: () => fresh(get().history),
    }),
    {
      name: "sentroy-dl-history",
      version: 1,
      onRehydrateStorage: () => (state) => {
        state?.pruneExpired()
        state?.setHydrated()
      },
    },
  ),
)
