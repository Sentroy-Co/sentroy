import { create } from "zustand"
import { DEFAULT_WALLPAPER } from "./wallpapers"
import {
  getPrefsSlug,
  queuePrefsPatch,
  writeWallpaperCache,
} from "./os-prefs-sync"

/**
 * Seçili masaüstü duvar kâğıdı. Kalıcılık artık SUNUCUDA (per-user-per-company,
 * bkz. os-prefs-sync + useOsPrefsSync); localStorage yalnız per-slug offline
 * cache. Bu store DB'den hydrate edilir (useWallpaperStore.setState — action
 * DEĞİL, echo/write-through tetiklemez); `setWallpaper` kullanıcı mutasyonudur
 * → cache'e anında yazar + debounced sunucuya PUT eder.
 *
 * `pickerOpen` kalıcı DEĞİL (runtime): masaüstü sağ-tık "Change wallpaper",
 * menü-bar WallpaperPicker popover'ını programatik açar.
 */
interface WallpaperState {
  wallpaperId: string
  setWallpaper: (id: string) => void
  pickerOpen: boolean
  setPickerOpen: (open: boolean) => void
}

export const useWallpaperStore = create<WallpaperState>()((set) => ({
  wallpaperId: DEFAULT_WALLPAPER,
  setWallpaper: (id) => {
    set({ wallpaperId: id })
    const slug = getPrefsSlug()
    if (slug) {
      writeWallpaperCache(slug, id)
      queuePrefsPatch(slug, { wallpaper: id })
    }
  },
  pickerOpen: false,
  setPickerOpen: (open) => set({ pickerOpen: open }),
}))
