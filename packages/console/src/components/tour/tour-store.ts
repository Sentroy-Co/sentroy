import { create } from "zustand"

/**
 * Paylaşılan hafif custom tur motoru (react-joyride React 19'da findDOMNode
 * kaldırıldığı için react-floater ile PATLAR → kendi spotlight primitive'imizi
 * yazdık). core (Sentroy OS), mail ve storage app'leri ortak kullanır.
 *
 * Adımlar SUNUMDAN bağımsız: çağıran app i18n metnini çözüp `start(steps)` ile
 * verir (title/body düz string). Overlay hedefi runtime'da çözer:
 * targetSelector → querySelector, region → hesaplanan rect (DOM'a dokunulamayan
 * alanlar için, ör. OS dock), ikisi de yoksa ORTALI kart (modal adım).
 */

export interface TourStep {
  title: string
  body: string
  /** Spotlight'lanacak elementin CSS seçicisi. */
  targetSelector?: string
  /** DOM'a dokunulamayan alanlar için hesaplanan bölge (ör. OS dock). */
  region?: "dock"
  /** Kart yerleşimi — auto (boşluğa göre) varsayılan. */
  placement?: "auto" | "top" | "bottom" | "center"
  /** Adımda ek CTA ("Show me") — tıklanınca çalışır + tur kapanır. */
  action?: { label: string; run: () => void }
}

interface TourState {
  steps: TourStep[]
  index: number
  active: boolean
  start: (steps: TourStep[]) => void
  next: () => void
  prev: () => void
  goTo: (index: number) => void
  stop: () => void
}

export const useTourStore = create<TourState>((set, get) => ({
  steps: [],
  index: 0,
  active: false,
  start: (steps) => {
    if (!steps.length) return
    set({ steps, index: 0, active: true })
  },
  next: () => {
    const { index, steps } = get()
    if (index >= steps.length - 1) {
      set({ active: false })
      return
    }
    set({ index: index + 1 })
  },
  prev: () => set((s) => ({ index: Math.max(0, s.index - 1) })),
  goTo: (index) =>
    set((s) => ({ index: Math.max(0, Math.min(index, s.steps.length - 1)) })),
  stop: () => set({ active: false }),
}))
