"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@workspace/ui/lib/utils"

/**
 * VU meter — DAW-style dikey/yatay seviye barı. Tone.Meter dB değerini
 * polling ile alır (requestAnimationFrame), peak hold + tepe segment LED
 * görünümü ile render eder.
 *
 * Renk segmentleri (alttan üste): green → yellow → red (clipping zone).
 * Threshold: -60 dB → +6 dB, peak hold 1.2 saniye.
 *
 * Caller `read()` callback'i ile her frame dB okur — engine'in
 * getTrackMeterDb/getMasterMeterDb'sini bağlar. Tek bir DAW projesinde
 * 8-32 meter olacağı için her biri kendi RAF'ı (16ms tick ≈ 60fps yeterli).
 */
export function VuMeter({
  read,
  orientation = "vertical",
  width = 6,
  height = 80,
  showPeak = true,
  segments = 24,
  className,
}: {
  read(): number
  orientation?: "vertical" | "horizontal"
  width?: number
  height?: number
  showPeak?: boolean
  segments?: number
  className?: string
}) {
  // -60..+6 dB → 0..1 normalize
  const DB_MIN = -60
  const DB_MAX = 6
  const dbToNorm = (db: number) =>
    Math.max(0, Math.min(1, (db - DB_MIN) / (DB_MAX - DB_MIN)))

  const [level, setLevel] = useState(0)
  const [peak, setPeak] = useState(0)
  const peakHoldRef = useRef<{ value: number; until: number }>({
    value: 0,
    until: 0,
  })

  useEffect(() => {
    let raf = 0
    let lastTick = 0
    const tick = (ts: number) => {
      // Frame throttle — ~60fps yerine ~30fps yeterli (display refresh)
      if (ts - lastTick >= 32) {
        lastTick = ts
        const db = read()
        const n = Number.isFinite(db) ? dbToNorm(db) : 0
        setLevel(n)
        const hold = peakHoldRef.current
        if (n >= hold.value) {
          hold.value = n
          hold.until = ts + 1200
        } else if (ts > hold.until) {
          // Peak yavaşça düşsün (decay)
          hold.value = Math.max(n, hold.value - 0.005)
        }
        setPeak(hold.value)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [read])

  const isVertical = orientation === "vertical"
  // Segment-based render — LED-style. Yeşil 0..0.65, sarı 0.65..0.85, kırmızı .85+
  const segs: { fill: string; isPeak: boolean }[] = []
  const peakSegIdx = Math.floor(peak * segments)
  const levelSegIdx = Math.floor(level * segments)
  for (let i = 0; i < segments; i++) {
    const ratio = i / segments
    let baseColor = "#22c55e"
    if (ratio > 0.85) baseColor = "#ef4444"
    else if (ratio > 0.65) baseColor = "#eab308"
    const active = i < levelSegIdx
    const isPeak = showPeak && i === peakSegIdx && peakSegIdx > 0
    if (active) {
      segs.push({ fill: baseColor, isPeak: false })
    } else if (isPeak) {
      segs.push({ fill: baseColor, isPeak: true })
    } else {
      // Inactive segment — dim background
      segs.push({ fill: "#1f1f1f", isPeak: false })
    }
  }

  if (isVertical) {
    return (
      <div
        className={cn("relative shrink-0 overflow-hidden rounded-sm", className)}
        style={{
          width,
          height,
          background: "#0a0a0a",
          boxShadow: "inset 0 0 0 1px #1f1f1f",
        }}
      >
        <div className="absolute inset-0 flex flex-col-reverse gap-px p-px">
          {segs.map((s, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                background: s.fill,
                opacity: s.isPeak ? 0.9 : 1,
                minHeight: 1,
              }}
            />
          ))}
        </div>
      </div>
    )
  }
  // Horizontal
  return (
    <div
      className={cn("relative shrink-0 overflow-hidden rounded-sm", className)}
      style={{
        width: height,
        height: width,
        background: "#0a0a0a",
        boxShadow: "inset 0 0 0 1px #1f1f1f",
      }}
    >
      <div className="absolute inset-0 flex gap-px p-px">
        {segs.map((s, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              background: s.fill,
              opacity: s.isPeak ? 0.9 : 1,
              minWidth: 1,
            }}
          />
        ))}
      </div>
    </div>
  )
}
