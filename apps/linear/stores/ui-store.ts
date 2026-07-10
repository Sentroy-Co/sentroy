import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

export type DashboardView = "list" | "kanban"

/** Command palette'te "son seçilen" kart önizlemesi için hafif kayıt. */
export type RecentCard = {
  id: string
  identifier: string
  title: string
  color: string
}

type UiState = {
  sidebarCollapsed: boolean
  /** Masaüstünde sidebar tamamen gizli (collapse'tan farklı: DOM dışı). */
  sidebarHidden: boolean
  /** Mobile-only slide-over drawer; masaüstünde kullanılmaz. */
  mobileSidebarOpen: boolean
  commandPaletteOpen: boolean
  shortcutsHelpOpen: boolean
  dashboardView: DashboardView
  /**
   * Inbox okunmuşluk: `${userId}::${issueId}` → en son GÖRÜLEN state id.
   * Bir talep, mevcut durumu kayıtlı görülenden farklıysa (ya da hiç
   * görülmemişse) "okunmamış" sayılır. Kullanıcı bazında ayrışır (paylaşılan
   * tarayıcıda kullanıcılar karışmasın).
   */
  seenInboxStates: Record<string, string>
  /** Command palette geçmişi: son arama terimleri (en yeni başta). */
  recentSearches: string[]
  /** Command palette geçmişi: aratılıp seçilen son kartlar. */
  recentCards: RecentCard[]
  /** "Tamam" zili çalsın mı? (success-bell). Varsayılan açık. */
  soundEnabled: boolean
  /**
   * Masaüstü (OS) bildirimleri açık mı? Opt-in: varsayılan kapalı; kullanıcı
   * açtığında Notification izni istenir (kullanıcı jesti gerektirir).
   */
  desktopNotificationsEnabled: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (v: boolean) => void
  setSidebarHidden: (v: boolean) => void
  toggleSidebarHidden: () => void
  setMobileSidebar: (v: boolean) => void
  toggleMobileSidebar: () => void
  setCommandPalette: (v: boolean) => void
  setShortcutsHelp: (v: boolean) => void
  setDashboardView: (v: DashboardView) => void
  /** Bir talebi mevcut durumunda "görüldü" işaretle (okunmamışı temizler). */
  markInboxSeen: (userId: string, issueId: string, stateId: string) => void
  addRecentSearch: (term: string) => void
  addRecentCard: (card: RecentCard) => void
  clearRecentSearches: () => void
  clearRecentCards: () => void
  setSoundEnabled: (v: boolean) => void
  setDesktopNotificationsEnabled: (v: boolean) => void
}

const MAX_RECENT_SEARCHES = 8
const MAX_RECENT_CARDS = 10

export function inboxSeenKey(userId: string, issueId: string): string {
  return `${userId}::${issueId}`
}

const isBrowser = typeof window !== "undefined"

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      sidebarHidden: false,
      mobileSidebarOpen: false,
      commandPaletteOpen: false,
      shortcutsHelpOpen: false,
      dashboardView: "list",
      seenInboxStates: {},
      recentSearches: [],
      recentCards: [],
      soundEnabled: true,
      desktopNotificationsEnabled: false,
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setSidebarHidden: (v) => set({ sidebarHidden: v }),
      toggleSidebarHidden: () =>
        set((s) => ({ sidebarHidden: !s.sidebarHidden })),
      setMobileSidebar: (v) => set({ mobileSidebarOpen: v }),
      toggleMobileSidebar: () =>
        set((s) => ({ mobileSidebarOpen: !s.mobileSidebarOpen })),
      setCommandPalette: (v) => set({ commandPaletteOpen: v }),
      setShortcutsHelp: (v) => set({ shortcutsHelpOpen: v }),
      setDashboardView: (v) => set({ dashboardView: v }),
      markInboxSeen: (userId, issueId, stateId) =>
        set((s) => ({
          seenInboxStates: {
            ...s.seenInboxStates,
            [inboxSeenKey(userId, issueId)]: stateId,
          },
        })),
      addRecentSearch: (term) =>
        set((s) => {
          const t = term.trim()
          if (t.length < 2) return s
          const next = [
            t,
            ...s.recentSearches.filter(
              (x) => x.toLowerCase() !== t.toLowerCase()
            ),
          ].slice(0, MAX_RECENT_SEARCHES)
          return { recentSearches: next }
        }),
      addRecentCard: (card) =>
        set((s) => ({
          recentCards: [
            card,
            ...s.recentCards.filter((c) => c.id !== card.id),
          ].slice(0, MAX_RECENT_CARDS),
        })),
      clearRecentSearches: () => set({ recentSearches: [] }),
      clearRecentCards: () => set({ recentCards: [] }),
      setSoundEnabled: (v) => set({ soundEnabled: v }),
      setDesktopNotificationsEnabled: (v) =>
        set({ desktopNotificationsEnabled: v }),
    }),
    {
      name: "linear-lite:ui",
      storage: createJSONStorage(() =>
        isBrowser ? localStorage : (undefined as unknown as Storage)
      ),
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        sidebarHidden: s.sidebarHidden,
        dashboardView: s.dashboardView,
        seenInboxStates: s.seenInboxStates,
        recentSearches: s.recentSearches,
        recentCards: s.recentCards,
        soundEnabled: s.soundEnabled,
        desktopNotificationsEnabled: s.desktopNotificationsEnabled,
      }),
    }
  )
)
