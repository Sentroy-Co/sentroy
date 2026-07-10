"use client"

import { useCallback, useRef, useState } from "react"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Pioneer-style rotary knob.
 *
 * Drag: vertical (DJ convention — yukarı artar). Sensitivity = (max-min)/200px
 * per full sweep. Double-click resets to defaultValue.
 *
 * Visual: silver/chrome ring with indicator line — rotated based on value's
 * position in [min,max] mapped to [-135°..+135°] (270° sweep).
 */

export interface KnobProps {
  value: number
  min?: number
  max?: number
  step?: number
  /** Double-click resets here. */
  defaultValue?: number
  /** Hız (px/full-range). Default 200. */
  sensitivity?: number
  onChange(val: number): void
  onCommit?(val: number): void
  disabled?: boolean
  size?: number
  /** Üst etiket — "LOW", "MID" gibi. */
  label?: string
  /** Alt readout — value → string. Default 2 decimal. */
  formatValue?(val: number): string
  /** Indicator + ring rengi (LED accent). */
  accentColor?: string
  className?: string
  "aria-label"?: string
}

export function Knob({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  defaultValue,
  sensitivity = 200,
  onChange,
  onCommit,
  disabled = false,
  size = 44,
  label,
  formatValue,
  accentColor,
  className,
  "aria-label": ariaLabel,
}: KnobProps) {
  const ref = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ y0: number; v0: number } | null>(null)
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

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return
      e.preventDefault()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
      dragRef.current = { y0: e.clientY, v0: value }
      setDragging(true)
    },
    [disabled, value],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return
      const dy = dragRef.current.y0 - e.clientY // yukarı = pozitif
      // Shift = ince ayar (5x daha hassas)
      const sens = e.shiftKey ? sensitivity * 5 : sensitivity
      const raw = dragRef.current.v0 + (dy / sens) * (max - min)
      const next = clamp(snap(raw))
      if (next !== value) onChange(next)
    },
    [sensitivity, max, min, clamp, snap, onChange, value],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
      dragRef.current = null
      setDragging(false)
      onCommit?.(value)
    },
    [onCommit, value],
  )

  const handleDoubleClick = useCallback(() => {
    if (disabled || defaultValue === undefined) return
    const v = clamp(defaultValue)
    onChange(v)
    onCommit?.(v)
  }, [disabled, defaultValue, clamp, onChange, onCommit])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return
      const big = (max - min) / 10
      let next = value
      switch (e.key) {
        case "ArrowUp":
        case "ArrowRight":
          next = value + step
          break
        case "ArrowDown":
        case "ArrowLeft":
          next = value - step
          break
        case "PageUp":
          next = value + big
          break
        case "PageDown":
          next = value - big
          break
        case "Home":
          next = min
          break
        case "End":
          next = max
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

  // Value → angle. Min=-135° (7 saat), Max=+135° (5 saat). 270° toplam.
  const pct = max === min ? 0.5 : (clamp(value) - min) / (max - min)
  const angle = -135 + pct * 270

  const accent = accentColor ?? "#fafafa"
  const ringAccent = dragging
    ? accent
    : `color-mix(in srgb, ${accent} 40%, transparent)`

  const formatted = formatValue
    ? formatValue(value)
    : step >= 1
      ? value.toFixed(0)
      : value.toFixed(2)

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      {label && (
        <div className="text-[8px] font-bold uppercase tracking-widest text-neutral-500">
          {label}
        </div>
      )}
      <div
        ref={ref}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel ?? label ?? "Knob"}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        title={`${formatted}${defaultValue !== undefined ? " · double-click reset" : ""}`}
        className={cn(
          "relative shrink-0 select-none touch-none rounded-full transition-shadow",
          "bg-gradient-to-br from-neutral-700 via-neutral-800 to-neutral-950",
          "ring-1 ring-black/60 shadow-[0_2px_4px_rgba(0,0,0,0.6),inset_0_1px_2px_rgba(255,255,255,0.1)]",
          disabled
            ? "cursor-not-allowed opacity-40"
            : "cursor-ns-resize hover:ring-2",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
        )}
        style={{
          width: size,
          height: size,
          ["--ring-color" as string]: ringAccent,
        }}
      >
        {/* Outer ring marker (270° arc) */}
        <svg
          className="pointer-events-none absolute inset-0"
          viewBox="0 0 100 100"
        >
          <path
            d="M 26 84 A 38 38 0 1 1 74 84"
            fill="none"
            stroke="rgba(0,0,0,0.5)"
            strokeWidth="3"
          />
          <path
            d="M 26 84 A 38 38 0 1 1 74 84"
            fill="none"
            stroke={accent}
            strokeWidth="3"
            strokeDasharray="180"
            strokeDashoffset={180 - pct * 180}
            opacity="0.7"
          />
        </svg>
        {/* Indicator line — value angle'a göre döner */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          <div
            className="absolute left-1/2 top-1.5 -translate-x-1/2 rounded-full"
            style={{
              width: 2,
              height: size * 0.3,
              background: accent,
              boxShadow: `0 0 4px ${accent}`,
            }}
          />
        </div>
        {/* Center dot */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-300"
        />
      </div>
      <div className="font-mono text-[8px] tabular-nums leading-tight text-neutral-600">
        {formatted}
      </div>
    </div>
  )
}
