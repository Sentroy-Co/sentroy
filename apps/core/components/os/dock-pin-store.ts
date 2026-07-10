import { create } from "zustand"
import {
  getPrefsSlug,
  queuePrefsPatch,
  writeDockPinsCache,
} from "./os-prefs-sync"

/**
 * Dock durumu (kalıcılık SUNUCUDA — per-user-per-company; localStorage per-slug
 * offline cache):
 * - `pinned`: dock'a sabitlenen araç/platform id'leri — örn. "tool:pdf-merge",
 *   "platform:youtube". Kapalıyken de dock'ta listelenir.
 * - `hidden`: dock'tan kaldırılan ürün/sistem app id'leri (mail, storage, meet,
 *   notes, store, …). Varsayılan dock'ta görünen bu app'ler `hidden`'a eklenince
 *   dock'tan çıkar; Launchpad'den ("apps") her zaman erişilir ve geri eklenir.
 *   Launchpad'in kendisi asla gizlenemez (geri-ekleme kapısı).
 *
 * Hydrate `setState` ile (bkz. useOsPrefsSync — echo tetiklemez); aşağıdaki
 * action'lar kullanıcı mutasyonu → set sonrası cache + debounced PUT (her
 * ikisi de: pinned + hidden birlikte).
 */
interface DockPinState {
  pinned: string[]
  hidden: string[]
  toggle: (id: string) => void
  pin: (id: string) => void
  unpin: (id: string) => void
  hide: (id: string) => void
  show: (id: string) => void
  toggleHidden: (id: string) => void
}

export const useDockPinStore = create<DockPinState>()((set, get) => {
  const persistPins = () => {
    const slug = getPrefsSlug()
    if (!slug) return
    const { pinned, hidden } = get()
    writeDockPinsCache(slug, { pinned, hidden })
    queuePrefsPatch(slug, { dockPinned: pinned, dockHidden: hidden })
  }
  return {
    pinned: [],
    hidden: [],
    toggle: (id) => {
      set((s) => ({
        pinned: s.pinned.includes(id) ? s.pinned.filter((x) => x !== id) : [...s.pinned, id],
      }))
      persistPins()
    },
    pin: (id) => {
      set((s) => (s.pinned.includes(id) ? s : { pinned: [...s.pinned, id] }))
      persistPins()
    },
    unpin: (id) => {
      set((s) => ({ pinned: s.pinned.filter((x) => x !== id) }))
      persistPins()
    },
    hide: (id) => {
      set((s) => (s.hidden.includes(id) ? s : { hidden: [...s.hidden, id] }))
      persistPins()
    },
    show: (id) => {
      set((s) => ({ hidden: s.hidden.filter((x) => x !== id) }))
      persistPins()
    },
    toggleHidden: (id) => {
      set((s) => ({
        hidden: s.hidden.includes(id) ? s.hidden.filter((x) => x !== id) : [...s.hidden, id],
      }))
      persistPins()
    },
  }
})
