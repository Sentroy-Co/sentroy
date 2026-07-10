import { create } from "zustand"
import {
  getPrefsSlug,
  queuePrefsPatch,
  writeDockOrderCache,
} from "./os-prefs-sync"

/**
 * Dock ikon sırası — kullanıcı sürükleyince güncellenir. Kalıcılık SUNUCUDA
 * (per-user-per-company); localStorage per-slug offline cache. Hydrate
 * `setState` ile (bkz. useOsPrefsSync); `setOrder` kullanıcı mutasyonu →
 * cache + debounced PUT.
 */
interface DockOrderState {
  order: string[]
  setOrder: (order: string[]) => void
}

export const useDockOrderStore = create<DockOrderState>()((set) => ({
  order: [],
  setOrder: (order) => {
    set({ order })
    const slug = getPrefsSlug()
    if (slug) {
      writeDockOrderCache(slug, order)
      queuePrefsPatch(slug, { dockOrder: order })
    }
  },
}))
