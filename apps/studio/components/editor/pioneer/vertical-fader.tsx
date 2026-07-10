"use client"

import { useCallback, useRef, useState } from "react"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Vertical fader — Pioneer DJM kanal volume + crossfader (kullanım: rotated 90° de
 * mümkün ama vertical default). Pointer Y/height ratio = value.
 *
 * Tutamak (cap) çizgili Pioneer fader görünümlü.
 */

export interface VerticalFaderProps {
  value: number
  min?: number
  max?: number
  step?: number
  defaultValue?: number
  onChange(val: number): void
  onCommit?(val: number): void
  disabled?: boolean
  /** Toplam yükseklik — track + cap. Default 140. */
  height?: number
  /** Cap rengi (LED accent). */
  capColor?: string
  label?: string
  className?: string
  "aria-label"?: string
}

export function VerticalFader({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  defaultValue,
  onChange,
  onCommit,
  disabled = false,
  height = 140,
  capColor = "#fafafa",
  label,
  className,
  "aria-label": ariaLabel,
}: VerticalFaderProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const clamp = useCallback(
    (v: number) => Math.max(min, Math.min(max, v)),
    [min, max],
  )
  const snap = useCallback(
    (v: number) => {
      const stepped = step > 0 ? Math.round(v / step) * step : v
      const precision = step >= 1 ? 0 : Math.max(0, Math.ceil(-Math.log10(step)))
      return Number(stepped.toFixed(precision))
    },
    [step],
  )

  const computeValueFromY = useCallback(
    (clientY: number): number => {
      const el = ref.current
      if (!el) return value
      const rect = el.getBoundingClientRect()
      // Üst = max (1), alt = min (0)
      const pct = 1 - (clientY - rect.top) / rect.height
      const raw = min + Math.max(0, Math.min(1, pct)) * (max - min)
      return clamp(snap(raw))
    },
    [value, min, max, clamp, snap],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return
      e.preventDefault()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {}
      setDragging(true)
      const next = computeValueFromY(e.clientY)
      if (next !== value) onChange(next)
    },
    [disabled, computeValueFromY, onChange, value],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return
      const next = computeValueFromY(e.clientY)
      if (next !== value) onChange(next)
    },
    [dragging, computeValueFromY, onChange, value],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return
      setDragging(false)
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {}
      onCommit?.(computeValueFromY(e.clientY))
    },
    [dragging, computeValueFromY, onCommit],
  )

  const handleDoubleClick = useCallback(() => {
    if (disabled || defaultValue === undefined) return
    onChange(clamp(defaultValue))
    onCommit?.(clamp(defaultValue))
  }, [disabled, defaultValue, clamp, onChange, onCommit])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return
      const big = (max - min) / 10
      let next = value
      switch (e.key) {
        case "ArrowUp":
          next = value + step
          break
        case "ArrowDown":
          next = value - step
          break
        case "PageUp":
          next = value + big
          break
        case "PageDown":
          next = value - big
          break
        case "Home":
          next = max
          break // Top
        case "End":
          next = min
          break
        default:
          return
      }
      e.preventDefault()
      const clamped = clamp(snap(next))
      if (clamped !== value) {
        onChange(clamped)
        onCommit?.(clamped)
      }
    },
    [disabled, value, step, min, max, clamp, snap, onChange, onCommit],
  )

  const pct = max === min ? 0 : (clamp(value) - min) / (max - min)
  // Cap pozisyonu: 0=alt, 1=üst
  const capBottomPct = pct * 100

  return (
    <div className={cn("flex flex-col items-center gap-1.5", className)}>
      {label && (
        <div className="text-[8px] font-bold uppercase tracking-widest text-neutral-500">
          {label}
        </div>
      )}
      <div
        ref={ref}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel ?? label ?? "Fader"}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-orientation="vertical"
        aria-disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          "relative w-6 select-none touch-none",
          disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
        )}
        style={{ height }}
      >
        {/* Track — dikey ince oluk. Card bg (neutral-900) ile uyumsuz
            kalmasın diye black/80 + ince neutral ring; üst/alt tick'ler. */}
        <div className="absolute left-1/2 top-0 h-full w-1.5 -translate-x-1/2 rounded-full bg-black/80 shadow-[inset_0_0_4px_rgba(0,0,0,0.9)] ring-1 ring-neutral-700/50" />
        {/* Center notch — 0 noktasında ince beyaz çizgi (Pioneer reference) */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 -translate-y-1/2 bg-neutral-500/60" />
        {/* Cap — gerçek Pioneer fader knob'u */}
        <div
          className={cn(
            "absolute left-1/2 z-10 h-5 w-6 -translate-x-1/2 rounded-sm transition-shadow",
            dragging && "shadow-lg",
          )}
          style={{
            bottom: `calc(${capBottomPct}% - 10px)`,
            background: `linear-gradient(180deg, ${capColor}, color-mix(in srgb, ${capColor} 60%, black))`,
            boxShadow: `0 1px 3px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.3)`,
          }}
        >
          {/* Cap çizgileri (Pioneer texture) */}
          <div className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-black/40" />
          <div className="absolute inset-x-1 top-1/2 mt-1 h-px bg-black/40" />
          <div className="absolute inset-x-1 top-1/2 -mt-1 h-px bg-black/40" />
        </div>
      </div>
    </div>
  )
}
