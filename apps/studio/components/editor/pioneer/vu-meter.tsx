"use client"

import { useEffect, useRef } from "react"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Vertical segmented VU meter (Pioneer DJM tarzı). Engine'den 30fps
 * dBFS okur, segment LED'lere map eder. React state YOK — direkt DOM
 * mutation (60fps stresine girilmez).
 *
 * Caller: `<VuMeter getDb={getMasterMeterDb} segments={12} />`
 *
 * Segment renkleri: alt yeşil (-60..-12) / orta sarı (-12..-3) / üst
 * kırmızı (-3..0+). Threshold üstü clipping uyarısı.
 */
export function VuMeter({
  getDb,
  segments = 14,
  width = 6,
  segmentGap = 1,
  segmentHeight = 4,
  className,
  title,
}: {
  getDb(): number
  segments?: number
  width?: number
  segmentGap?: number
  segmentHeight?: number
  className?: string
  title?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let lastUpdate = 0
    const tick = (now: number) => {
      // ~30fps throttle — 60fps eye-strain + CPU
      if (now - lastUpdate > 33) {
        lastUpdate = now
        const db = getDb()
        // dBFS → segment count: -60dB = 0 segment, 0dB = max segments
        const norm = Math.max(0, Math.min(1, (db + 60) / 60))
        const lit = Math.round(norm * segments)
        const children = containerRef.current?.children
        if (children) {
          for (let i = 0; i < children.length; i++) {
            const seg = children[i] as HTMLElement
            const litFromBottom = segments - i // top = index 0
            const isLit = litFromBottom <= lit
            seg.style.opacity = isLit ? "1" : "0.18"
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [getDb, segments])

  // Segments — top (loud) red → middle yellow → bottom green
  const segmentColors: string[] = []
  for (let i = 0; i < segments; i++) {
    const ratio = i / (segments - 1) // 0 (top) .. 1 (bottom)
    if (ratio < 0.15) segmentColors.push("#ef4444")       // red
    else if (ratio < 0.35) segmentColors.push("#eab308")  // yellow
    else segmentColors.push("#22c55e")                    // green
  }

  return (
    <div
      ref={containerRef}
      className={cn("flex flex-col", className)}
      style={{ width, gap: segmentGap }}
      title={title}
      aria-label={title ?? "VU meter"}
    >
      {segmentColors.map((color, i) => (
        <div
          key={i}
          style={{
            height: segmentHeight,
            backgroundColor: color,
            opacity: 0.18,
            borderRadius: 1,
            transition: "opacity 60ms linear",
          }}
        />
      ))}
    </div>
  )
}
