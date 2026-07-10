"use client"

// ParallaxWallpaper — aurora renk yolculuğu (jüri kuralı: hue/filter animasyonu
// DEĞİL; önceden hazırlanmış gradient katmanlarının yalnız OPACITY crossfade'i).
// Global scroll progress'e göre 4 faz: gece mavisi (boot) → indigo (build) →
// cyan/emerald (operate) → amber gün doğumu (create→final).

import { motion, useScroll, useTransform } from "framer-motion"

const EDGE_EPSILON = 0.0001

const LAYERS: {
  id: string
  bg: string
  range: [number, number, number, number]
}[] = [
  {
    id: "night",
    bg: "radial-gradient(120% 90% at 50% 0%, #0b1226 0%, #05070f 55%, #030409 100%)",
    range: [0, EDGE_EPSILON, 0.22, 0.34],
  },
  {
    id: "build",
    bg: "radial-gradient(110% 90% at 30% 10%, #131a3a 0%, #0a0d1f 55%, #05060f 100%)",
    range: [0.2, 0.32, 0.46, 0.56],
  },
  {
    id: "operate",
    bg: "radial-gradient(115% 95% at 70% 5%, #06222e 0%, #071521 55%, #04070d 100%)",
    range: [0.44, 0.56, 0.68, 0.78],
  },
  {
    id: "dawn",
    bg: "radial-gradient(120% 100% at 50% 100%, #2b1a08 0%, #120b12 50%, #05060c 100%)",
    range: [0.66, 0.8, 1 - EDGE_EPSILON, 1],
  },
]

export function ParallaxWallpaper() {
  const { scrollYProgress } = useScroll()

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      {LAYERS.map((l) => (
        <Layer
          key={l.id}
          bg={l.bg}
          range={l.range}
          progress={scrollYProgress}
        />
      ))}
      {/* Statik film grain (%2.5) — cam yüzeylerde banding kırar; animasyonsuz. */}
      <div
        className="absolute inset-0 opacity-[0.025] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  )
}

function Layer({
  bg,
  range,
  progress,
}: {
  bg: string
  range: [number, number, number, number]
  progress: ReturnType<typeof useScroll>["scrollYProgress"]
}) {
  const [a, b, c, d] = range
  // Kenar fazlar tam görünür kalsın diye giriş/çıkış rampaları.
  const opacity = useTransform(
    progress,
    [a, b, c, d],
    [a === 0 ? 1 : 0, 1, 1, d === 1 ? 1 : 0]
  )
  return (
    <motion.div
      className="absolute inset-0"
      style={{ opacity, background: bg }}
    />
  )
}
