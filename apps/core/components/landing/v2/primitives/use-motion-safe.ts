"use client"

// Birleşik hareket kapısı — jüri kuralı: pin/scrub/fallback kararı her sahnede
// ayrı ayrı DEĞİL, tek merkezden verilir.
//
//   const { full, reducedMotion, isMobile } = useMotionSafe()
//   full === true  → pinned-scrub koreografisi
//   full === false → sahnenin "poster" hali (statik/kompakt kart; fade-in serbest)
//
// `full` yalnız client'ta true olabilir (SSR'da false) — hydration uyumsuzluğu
// olmaması için sahneler poster halini SSR default olarak render etmelidir.

import { useEffect, useState } from "react"

const MOBILE_QUERY = "(max-width: 1023px)" // < lg
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)"

export function useMotionSafe(): {
  full: boolean
  reducedMotion: boolean
  isMobile: boolean
} {
  const [state, setState] = useState({ reducedMotion: false, isMobile: false, ready: false })

  useEffect(() => {
    const mqMobile = window.matchMedia(MOBILE_QUERY)
    const mqReduced = window.matchMedia(REDUCED_QUERY)
    const update = () =>
      setState({ reducedMotion: mqReduced.matches, isMobile: mqMobile.matches, ready: true })
    update()
    mqMobile.addEventListener("change", update)
    mqReduced.addEventListener("change", update)
    return () => {
      mqMobile.removeEventListener("change", update)
      mqReduced.removeEventListener("change", update)
    }
  }, [])

  return {
    full: state.ready && !state.reducedMotion && !state.isMobile,
    reducedMotion: state.reducedMotion,
    isMobile: state.isMobile,
  }
}
