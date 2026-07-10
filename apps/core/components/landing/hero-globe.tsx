"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Globe, { type GlobeMethods } from "react-globe.gl"
import { useTheme } from "next-themes"

/** Rastgele yurumus patikalar — baslangicta dunya yuzeyinde duz, sonra yukselir. */
const N_PATHS = 10
const MAX_POINTS_PER_LINE = 10000
const MAX_STEP_DEG = 1
const MAX_STEP_ALT = 0.015
const RISE_DELAY_MS = 6000
const RISE_TRANSITION_MS = 4000

type PathPoint = [number, number, number] // [lat, lng, alt]
type Path = PathPoint[]

function generatePaths(): Path[] {
  return Array.from({ length: N_PATHS }, () => {
    let lat = (Math.random() - 0.5) * 90
    let lng = (Math.random() - 0.5) * 360
    let alt = 0
    const steps = Math.round(Math.random() * MAX_POINTS_PER_LINE)
    const points: Path = [[lat, lng, alt]]
    for (let i = 0; i < steps; i++) {
      lat += (Math.random() * 2 - 1) * MAX_STEP_DEG
      lng += (Math.random() * 2 - 1) * MAX_STEP_DEG
      alt += (Math.random() * 2 - 1) * MAX_STEP_ALT
      alt = Math.max(0, alt)
      points.push([lat, lng, alt])
    }
    return points
  })
}

export default function HeroGlobe() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme !== "light"
  const globeRef = useRef<GlobeMethods | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 750, h: 750 })
  const [rise, setRise] = useState(false)

  // Patikalari bir kere uret (client'ta mount sonrasi)
  const paths = useMemo<Path[]>(() => generatePaths(), [])

  // 6s sonra paths dunyadan yukselir
  useEffect(() => {
    const t = setTimeout(() => setRise(true), RISE_DELAY_MS)
    return () => clearTimeout(t)
  }, [])

  // Responsive sizing
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const rect = entry.contentRect
        const s = Math.min(rect.width, rect.height)
        setSize({ w: s, h: s })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Globe configuration — rotation + initial POV
  useEffect(() => {
    const g = globeRef.current
    if (!g) return
    const controls = g.controls() as unknown as {
      autoRotate: boolean
      autoRotateSpeed: number
      enableZoom: boolean
    }
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.6
    controls.enableZoom = false
    g.pointOfView({ lat: 20, lng: 20, altitude: 2.3 }, 0)
  }, [])

  // Tema-duyarli renkler — theme dark ise daha parlak primary tonlari
  const pathColor = useMemo(() => {
    const a = isDark ? "rgba(234,179,8,0.75)" : "rgba(161,98,7,0.75)"
    const b = isDark ? "rgba(253,224,71,0.55)" : "rgba(202,138,4,0.55)"
    return () => [a, b]
  }, [isDark])

  return (
    <div
      ref={containerRef}
      className="relative hidden aspect-square w-full lg:block"
    >
      {/* Soft glow backdrop */}
      <div className="absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-primary/20 via-transparent to-transparent blur-3xl" />
      <div className="flex size-full items-center justify-center">
        <Globe
          ref={globeRef}
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/earth-dark.jpg"
          bumpImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png"
          // atmosphereColor={isDark ? "#eab308" : "#ca8a04"}
          atmosphereAltitude={0.18}
          pathsData={paths}
          // pathColor={pathColor}
          pathColor={() => ['rgba(0,0,255,0.6)', 'rgba(255,0,0,0.6)']}
          pathDashLength={0.01}
          pathDashGap={0.004}
          pathDashAnimateTime={100000}
          pathPointAlt={rise ? (pnt: PathPoint) => pnt[2] : undefined}
          pathTransitionDuration={rise ? RISE_TRANSITION_MS : undefined}
        />
      </div>
    </div>
  )
}
