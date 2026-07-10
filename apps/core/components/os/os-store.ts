import { create } from "zustand"
import type { AppDescriptor } from "@workspace/console/components/layout/app-launcher"

/**
 * Sentroy OS — pencere yöneticisi. Her açık uygulama bir pencere (OsWindow):
 * konum/boyut, z-index (focus sırası), minimize/maximize durumu taşır.
 * - Başlangıçta hiç pencere yok → masaüstü (wallpaper), hiçbir iframe yüklenmez.
 * - Bir app açılınca pencere eklenir + iframe yüklenir (loaded=true), öne gelir.
 * - Aktif olmayan + IDLE_MS'ten uzun süredir dokunulmamış pencere "suspend"
 *   edilir (loaded=false → iframe unmount). Pencere kalır; focus'lanınca yeniden
 *   yüklenir (macOS tarzı yükleme animasyonuyla).
 */

export const IDLE_MS = 5 * 60 * 1000 // 5 dk

const DEFAULT_W = 980
const DEFAULT_H = 640

/** Bu app'ler MAXIMIZE yerine yüzen (floating) pencerede açılır (macOS Notes gibi). */
const FLOATING_APPS = new Set(["notes", "achievements"])
const FLOATING_W = 960
const FLOATING_H = 680

export interface OsWindow {
  appId: string
  loaded: boolean
  lastActiveAt: number
  z: number
  minimized: boolean
  maximized: boolean
  /** macOS-Spaces tam ekran — pencere kendi "space"inde tüm ekranı kaplar
   *  (dock + menü bar üstünde), ana masaüstünden ayrı tutulur. */
  fullscreen: boolean
  x: number
  y: number
  w: number
  h: number
}

interface OsState {
  windows: OsWindow[]
  activeId: string | null
  zTop: number
  /** Gösterilen tam ekran space'in appId'si; null = ana masaüstü (Spaces). */
  activeSpace: string | null
  /** Show-desktop (masaüstüne tıklama) ile gizlenen pencere id'leri — tekrar
   *  tıklamada tam olarak bunlar geri getirilir (manuel minimize'lar korunur). */
  desktopHiddenIds: string[]
  /** Dinamik app'ler (örn. açılan tool pencereleri) — WindowManager bunlardan
   *  da descriptor çözer. Kalıcı değil; runtime. */
  dynamicApps: Record<string, AppDescriptor>
  /** macOS System Settings tarzı pencere (Profile/Settings/Billing). */
  settingsOpen: boolean
  settingsCategory: string
  /** Aç ya da zaten açıksa öne getir + restore (gerekirse yeniden yükle).
   *  Bilinmeyen bir app için descriptor verilirse dynamicApps'e kaydedilir. */
  openApp: (appId: string, descriptor?: AppDescriptor) => void
  focusWindow: (appId: string) => void
  closeWindow: (appId: string) => void
  minimizeWindow: (appId: string) => void
  toggleMaximize: (appId: string) => void
  /** Yeşil buton — tam ekran space'ine gir/çık (macOS). */
  toggleFullscreen: (appId: string) => void
  setGeometry: (appId: string, geo: { x: number; y: number; w: number; h: number }) => void
  /** Şirket değişince tüm pencereleri kapat. */
  reset: () => void
  /** Masaüstü boş alana tıklama — görünür pencere varsa hepsini gizle (remember),
   *  hepsi gizliyse hatırlananları geri getir (macOS show-desktop). */
  toggleShowDesktop: () => void
  /** Idle süpürme — aktif olmayan eski pencereleri suspend et, aktifi taze tut. */
  sweepIdle: () => void
  /** Settings penceresini aç (opsiyonel kategori deep-link). */
  openSettings: (category?: string) => void
  closeSettings: () => void
}

/** Aktif pencere kapanınca/minimize olunca öne gelecek pencereyi seç. */
function topVisibleId(windows: OsWindow[]): string | null {
  const visible = windows.filter((w) => !w.minimized)
  if (visible.length === 0) return null
  return visible.reduce((a, b) => (b.z > a.z ? b : a)).appId
}

export const useOsStore = create<OsState>((set) => ({
  windows: [],
  activeId: null,
  zTop: 1,
  activeSpace: null,
  desktopHiddenIds: [],
  dynamicApps: {},
  settingsOpen: false,
  settingsCategory: "profile",

  openApp: (appId, descriptor) =>
    set((s) => {
      const now = Date.now()
      const z = s.zTop + 1
      const dynamicApps = descriptor ? { ...s.dynamicApps, [appId]: descriptor } : s.dynamicApps
      const existing = s.windows.find((w) => w.appId === appId)
      if (existing) {
        // Spaces: hedef pencere tam ekransa onun space'ine geç; değilse ana
        // masaüstüne dön (fullscreen app'ler kendi space'inde kalır).
        return {
          activeId: appId,
          zTop: z,
          dynamicApps,
          activeSpace: existing.fullscreen ? appId : null,
          windows: s.windows.map((w) =>
            w.appId === appId ? { ...w, loaded: true, minimized: false, lastActiveAt: now, z } : w,
          ),
        }
      }
      const n = s.windows.length
      const floating = FLOATING_APPS.has(appId)
      // Floating app'ler ekranın ortasına yakın, kaskadlı; diğerleri maximize.
      const win: OsWindow = floating
        ? {
            appId,
            loaded: true,
            lastActiveAt: now,
            z,
            minimized: false,
            maximized: false,
            fullscreen: false,
            x: 180 + (n % 5) * 32,
            y: 88 + (n % 5) * 32,
            w: FLOATING_W,
            h: FLOATING_H,
          }
        : {
            appId,
            loaded: true,
            lastActiveAt: now,
            z,
            minimized: false,
            maximized: true, // yeni uygulama daima maximize açılır
            fullscreen: false,
            x: 100 + (n % 5) * 36,
            y: 64 + (n % 5) * 36,
            w: DEFAULT_W,
            h: DEFAULT_H,
          }
      // Yeni pencere ana masaüstünde açılır (fullscreen space'ten gelinse bile).
      return { activeId: appId, zTop: z, dynamicApps, activeSpace: null, windows: [...s.windows, win] }
    }),

  focusWindow: (appId) =>
    set((s) => {
      const now = Date.now()
      const z = s.zTop + 1
      const target = s.windows.find((w) => w.appId === appId)
      return {
        activeId: appId,
        zTop: z,
        // Fullscreen pencereye focus → space'ine geç; değilse ana masaüstü.
        activeSpace: target?.fullscreen ? appId : null,
        windows: s.windows.map((w) =>
          w.appId === appId ? { ...w, loaded: true, minimized: false, lastActiveAt: now, z } : w,
        ),
      }
    }),

  closeWindow: (appId) =>
    set((s) => {
      const windows = s.windows.filter((w) => w.appId !== appId)
      const activeId = s.activeId === appId ? topVisibleId(windows) : s.activeId
      // Kapatılan pencere aktif space ise ana masaüstüne dön.
      const activeSpace = s.activeSpace === appId ? null : s.activeSpace
      return { windows, activeId, activeSpace }
    }),

  minimizeWindow: (appId) =>
    set((s) => {
      // Minimize = space'ten çık (fullscreen bırakılır, ana masaüstüne döner).
      const windows = s.windows.map((w) =>
        w.appId === appId ? { ...w, minimized: true, fullscreen: false } : w,
      )
      const activeId = s.activeId === appId ? topVisibleId(windows) : s.activeId
      const activeSpace = s.activeSpace === appId ? null : s.activeSpace
      return { windows, activeId, activeSpace }
    }),

  toggleMaximize: (appId) =>
    set((s) => {
      const z = s.zTop + 1
      const target = s.windows.find((w) => w.appId === appId)
      // Fullscreen'de başlık çift-tık → space'ten çık, masaüstünde maximize kal.
      if (target?.fullscreen) {
        return {
          activeId: appId,
          zTop: z,
          activeSpace: null,
          windows: s.windows.map((w) =>
            w.appId === appId ? { ...w, fullscreen: false, maximized: true, minimized: false, z, lastActiveAt: Date.now() } : w,
          ),
        }
      }
      return {
        activeId: appId,
        zTop: z,
        windows: s.windows.map((w) =>
          w.appId === appId ? { ...w, maximized: !w.maximized, minimized: false, z, lastActiveAt: Date.now() } : w,
        ),
      }
    }),

  toggleFullscreen: (appId) =>
    set((s) => {
      const z = s.zTop + 1
      const target = s.windows.find((w) => w.appId === appId)
      if (!target) return {}
      const next = !target.fullscreen
      return {
        activeId: appId,
        zTop: z,
        // Gir → o app'in space'i aktif; çık → ana masaüstü.
        activeSpace: next ? appId : null,
        windows: s.windows.map((w) =>
          w.appId === appId
            ? { ...w, fullscreen: next, minimized: false, z, lastActiveAt: Date.now() }
            : w,
        ),
      }
    }),

  setGeometry: (appId, geo) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.appId === appId ? { ...w, ...geo } : w)),
    })),

  reset: () => set({ windows: [], activeId: null, activeSpace: null, desktopHiddenIds: [] }),

  toggleShowDesktop: () =>
    set((s) => {
      const visible = s.windows.filter((w) => !w.minimized)
      if (visible.length > 0) {
        // Gizle: görünür pencereleri minimize et + hatırla.
        return {
          windows: s.windows.map((w) => (w.minimized ? w : { ...w, minimized: true })),
          activeId: null,
          desktopHiddenIds: visible.map((w) => w.appId),
        }
      }
      // Geri getir: yalnız show-desktop ile gizlenenleri restore et.
      if (s.desktopHiddenIds.length === 0) return {}
      const remembered = new Set(s.desktopHiddenIds)
      const now = Date.now()
      const windows = s.windows.map((w) =>
        remembered.has(w.appId)
          ? { ...w, minimized: false, loaded: true, lastActiveAt: now }
          : w,
      )
      return { windows, activeId: topVisibleId(windows), desktopHiddenIds: [] }
    }),

  openSettings: (category) =>
    set((s) => ({ settingsOpen: true, settingsCategory: category ?? s.settingsCategory })),
  closeSettings: () => set({ settingsOpen: false }),

  sweepIdle: () =>
    set((s) => {
      const now = Date.now()
      let changed = false
      const windows = s.windows.map((w) => {
        if (w.appId === s.activeId) {
          if (w.lastActiveAt !== now) {
            changed = true
            return { ...w, lastActiveAt: now }
          }
          return w
        }
        if (w.loaded && now - w.lastActiveAt > IDLE_MS) {
          changed = true
          return { ...w, loaded: false }
        }
        return w
      })
      return changed ? { windows } : {}
    }),
}))
