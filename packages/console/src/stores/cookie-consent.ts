import { create } from "zustand"
import { persist } from "zustand/middleware"

export type CookieCategory = "necessary" | "analytics" | "marketing"

export interface CookieConsent {
  necessary: true
  analytics: boolean
  marketing: boolean
  updatedAt: number
}

interface CookieConsentStore {
  /** `null` until user makes a decision (banner should show). */
  consent: CookieConsent | null
  /** Settings dialog open state. */
  preferencesOpen: boolean
  acceptAll: () => void
  rejectAll: () => void
  save: (partial: { analytics: boolean; marketing: boolean }) => void
  openPreferences: () => void
  closePreferences: () => void
  reset: () => void
}

const now = () => Date.now()

export const useCookieConsent = create<CookieConsentStore>()(
  persist(
    (set) => ({
      consent: null,
      preferencesOpen: false,
      acceptAll: () =>
        set({
          consent: {
            necessary: true,
            analytics: true,
            marketing: true,
            updatedAt: now(),
          },
          preferencesOpen: false,
        }),
      rejectAll: () =>
        set({
          consent: {
            necessary: true,
            analytics: false,
            marketing: false,
            updatedAt: now(),
          },
          preferencesOpen: false,
        }),
      save: ({ analytics, marketing }) =>
        set({
          consent: {
            necessary: true,
            analytics,
            marketing,
            updatedAt: now(),
          },
          preferencesOpen: false,
        }),
      openPreferences: () => set({ preferencesOpen: true }),
      closePreferences: () => set({ preferencesOpen: false }),
      reset: () => set({ consent: null, preferencesOpen: false }),
    }),
    {
      name: "sentroy-cookie-consent",
      partialize: (state) => ({ consent: state.consent }),
    },
  ),
)
