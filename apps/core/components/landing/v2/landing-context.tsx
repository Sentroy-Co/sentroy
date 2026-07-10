"use client"

// Landing v2 anlatı durumu — dock "koleksiyon" mekaniğinin tek kaynağı.
//
// - `lit`: beat'i tamamlanmış ürün id'leri. Dock ikonları sönük (desatüre) başlar,
//   sahnesi oynadıkça kalıcı olarak "yanar" (jüri graft'ı: keynote-scrub koleksiyonu).
// - `activeProductId`: o an odaktaki ürün — dock scroll-spy vurgusu.
// - `sweep()`: dock üzerinde soldan sağa tek fisheye dalgası tetikler (boot'ta
//   kendini tanıtma + finalde 12. ikon kutlaması). DockNav sweepSignal'ı dinler.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

interface LandingV2State {
  lit: ReadonlySet<string>
  light: (id: string) => void
  /** Çift yönlü koleksiyon: yukarı scroll'da beat eşiğinin altına inen ürün söner. */
  unlight: (id: string) => void
  activeProductId: string | null
  setActiveProduct: (id: string | null) => void
  sweepSignal: number
  sweep: () => void
  /**
   * Dock gizli mi — boot sekansı sürer: pencere ekranı doldurup yüzen ikonlar
   * dock pozisyonlarına inene dek dock görünmez (BootStage full modda sürer;
   * poster/mobil hiç dokunmaz → dock varsayılan görünür).
   */
  dockHidden: boolean
  setDockHidden: (hidden: boolean) => void
}

const Ctx = createContext<LandingV2State | null>(null)

export function LandingV2Provider({ children }: { children: ReactNode }) {
  const [lit, setLit] = useState<ReadonlySet<string>>(() => new Set())
  const [activeProductId, setActiveProduct] = useState<string | null>(null)
  const [sweepSignal, setSweepSignal] = useState(0)
  const [dockHidden, setDockHidden] = useState(false)

  const light = useCallback((id: string) => {
    setLit((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const unlight = useCallback((id: string) => {
    setLit((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const sweep = useCallback(() => setSweepSignal((n) => n + 1), [])

  const value = useMemo(
    () => ({
      lit,
      light,
      unlight,
      activeProductId,
      setActiveProduct,
      sweepSignal,
      sweep,
      dockHidden,
      setDockHidden,
    }),
    [lit, light, unlight, activeProductId, sweepSignal, sweep, dockHidden],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLandingV2(): LandingV2State {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useLandingV2, LandingV2Provider içinde kullanılmalı.")
  return ctx
}
