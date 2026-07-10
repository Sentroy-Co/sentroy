"use client"

import { useEffect } from "react"
import Lenis from "lenis"
import "lenis/dist/lenis.css"

/**
 * Yavaşlatılmış (smooth) scroll — yalnızca anasayfada mount edilir (2 tam-ekran
 * section: hero + footer). CSS scroll-snap KULLANILMAZ: snap + Lenis kombinasyonu
 * "pat diye" sert geçişe yol açıyordu. Bunun yerine düşük lerp ile akışkan,
 * yavaş serbest scroll + scroll göstergesinden uzun süreli yumuşak glide.
 */
let lenisInstance: Lenis | null = null

/** Bir id'ye yavaş ve yumuşak kaydır (Lenis varsa onunla, yoksa native). */
export function scrollToId(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  if (lenisInstance) lenisInstance.scrollTo(el, { duration: 2.2 })
  else el.scrollIntoView({ behavior: "smooth" })
}

export function SmoothScroll() {
  useEffect(() => {
    const lenis = new Lenis({ lerp: 0.06, wheelMultiplier: 0.85 })
    lenisInstance = lenis
    let rafId = 0
    const raf = (time: number) => {
      lenis.raf(time)
      rafId = requestAnimationFrame(raf)
    }
    rafId = requestAnimationFrame(raf)

    return () => {
      cancelAnimationFrame(rafId)
      lenis.destroy()
      lenisInstance = null
    }
  }, [])

  return null
}
