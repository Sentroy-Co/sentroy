"use client"

import { create } from "zustand"

/**
 * Kaydedilen set'ler önce LOKAL tutulur (bellekte blob + objectURL) — kullanıcı
 * indirir ya da isterse buluta yükler. Blob persist edilemez (proje JSON'una
 * gitmez); bu store yalnız oturum-içi in-memory. Buluta yüklenince cloud
 * recording'e (tree.recordings) taşınır ve local'den düşer.
 */
export interface LocalRecording {
  id: string
  blob: Blob
  /** Blob objectURL — preview + download. */
  url: string
  label: string
  durationSec: number
  mimeType: string
  extension: string
  recordedAt: string
  /** Bulut yükleme yüzdesi (0-100); null = yüklenmiyor. */
  uploadPct: number | null
}

interface LocalRecordingsState {
  items: LocalRecording[]
  add(rec: Omit<LocalRecording, "id" | "url" | "uploadPct">): string
  remove(id: string): void
  setUploadPct(id: string, pct: number | null): void
}

export const useLocalRecordings = create<LocalRecordingsState>((set, get) => ({
  items: [],
  add(rec) {
    const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const url = URL.createObjectURL(rec.blob)
    set((s) => ({ items: [{ id, url, uploadPct: null, ...rec }, ...s.items] }))
    return id
  },
  remove(id) {
    const it = get().items.find((r) => r.id === id)
    if (it) {
      try {
        URL.revokeObjectURL(it.url)
      } catch {
        /* noop */
      }
    }
    set((s) => ({ items: s.items.filter((r) => r.id !== id) }))
  },
  setUploadPct(id, pct) {
    set((s) => ({
      items: s.items.map((r) => (r.id === id ? { ...r, uploadPct: pct } : r)),
    }))
  },
}))
