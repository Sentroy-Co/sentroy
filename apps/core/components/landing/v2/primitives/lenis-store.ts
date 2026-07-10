"use client"

// Lenis singleton — shell (landing-v2.tsx) instance'ı kaydeder; GlassNav ve
// DockNav aynı instance üzerinden SMOOTH programatik scroll yapar. Lenis
// yokken (reduced-motion'da hiç kurulmaz) native smooth scroll'a düşer.

import type Lenis from "lenis"

let lenis: Lenis | null = null

export function setLenis(instance: Lenis | null): void {
  lenis = instance
}

/** Sabit üst nav'ın kapladığı alan — hedefin üstünde bırakılacak boşluk (px). */
const SCROLL_OFFSET = -84

export function scrollToId(id: string): void {
  const el = document.getElementById(id)
  if (!el) return
  if (lenis) {
    lenis.scrollTo(el, {
      offset: SCROLL_OFFSET,
      duration: 1.4,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    })
    return
  }
  // Fallback (reduced-motion / Lenis kurulmadan önce): native smooth.
  const top = el.getBoundingClientRect().top + window.scrollY + SCROLL_OFFSET
  window.scrollTo({ top, behavior: "smooth" })
}

export function scrollToTop(): void {
  if (lenis) {
    lenis.scrollTo(0, { duration: 1.2 })
    return
  }
  window.scrollTo({ top: 0, behavior: "smooth" })
}

/**
 * Pinned bir sahnenin İÇİNDEKİ scrub konumuna scroll — fraction, sahnenin
 * (sectionHeight - viewportHeight) scrub uzunluğuna orandır (0-1). Dock'un
 * ürün tıklaması bununla ürünün segmentine/merkez anına iner; kısa (poster)
 * section'larda scrub uzunluğu ≤0 olduğundan doğal olarak sahne başına düşer.
 */
export function scrollToSceneFraction(id: string, fraction: number): void {
  const el = document.getElementById(id)
  if (!el) return
  const rect = el.getBoundingClientRect()
  const sectionTop = rect.top + window.scrollY
  const scrubLength = Math.max(0, el.offsetHeight - window.innerHeight)
  const target = sectionTop + scrubLength * Math.min(1, Math.max(0, fraction))
  if (lenis) {
    lenis.scrollTo(target, {
      duration: 1.5,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    })
    return
  }
  window.scrollTo({ top: target, behavior: "smooth" })
}
