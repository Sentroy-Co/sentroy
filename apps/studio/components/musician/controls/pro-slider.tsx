"use client"

import { useCallback, useRef, useState } from "react"
import { cn } from "@workspace/ui/lib/utils"

/**
 * FL Studio plugin tarzı horizontal slider.
 *
 * Tek SVG ile çizilmiş — input[type=range] yerine native pointer events:
 *   - Inset rail (içeride gölgeli dar zemin)
 *   - Active fill (sol kenardan değer pozisyonuna kadar parlak gradient)
 *   - Thumb (3D gradient + border, hover'da glow)
 *   - Tick marks (opsiyonel — bipolar slider'da merkez işaretli)
 *
 * Drag: yatay; Shift basılı → 5× hassas.
 * Wheel: ±step (Shift: küçük adım).
 * Double-click: defaultValue.
 */
export function ProSlider({
  value,
  onChange,
  min,
  max,
  step = 0.01,
  defaultValue,
  bipolar = false,
  label,
  formatValue,
  accentColor,
  disabled = false,
  showValue = true,
  className,
  thickness = "md",
}: {
  value: number
  onChange(next: number): void
  min: number
  max: number
  step?: number
  defaultValue?: number
  bipolar?: boolean
  label?: string
  formatValue?(v: number): string
  accentColor?: string
  disabled?: boolean
  showValue?: boolean
  className?: string
  thickness?: "sm" | "md" | "lg"
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startVal: number } | null>(null)
  const [hovering, setHovering] = useState(false)

  const clamp = useCallback(
    (v: number) => Math.max(min, Math.min(max, v)),
    [min, max],
  )

  const valueAtClientX = useCallback(
    (clientX: number): number => {
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0) return value
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      return min + pct * (max - min)
    },
    [min, max, value],
  )

  const handleDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || e.button !== 0) return
      e.stopPropagation()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {}
      // Tıklanan noktaya jump et + drag başlat
      const v = valueAtClientX(e.clientX)
      onChange(clamp(v))
      dragRef.current = { startX: e.clientX, startVal: v }
    },
    [disabled, valueAtClientX, onChange, clamp],
  )

  const handleMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag) return
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0) return
      const sensitivity = e.shiftKey ? 5 : 1
      const dx = (e.clientX - drag.startX) / sensitivity
      const range = max - min
      const newVal = drag.startVal + (dx / rect.width) * range
      onChange(clamp(newVal))
    },
    [onChange, clamp, min, max],
  )

  const handleUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
    dragRef.current = null
  }, [])

  const handleDouble = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled) return
      e.stopPropagation()
      if (typeof defaultValue === "number") onChange(defaultValue)
    },
    [disabled, defaultValue, onChange],
  )

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (disabled) return
      e.preventDefault()
      e.stopPropagation()
      const dir = e.deltaY < 0 ? 1 : -1
      const inc = e.shiftKey ? step : step * 5
      onChange(clamp(value + dir * inc))
    },
    [disabled, value, step, onChange, clamp],
  )

  const norm = (value - min) / (max - min || 1)
  const railHeight = thickness === "sm" ? 4 : thickness === "lg" ? 10 : 6
  const thumbSize = thickness === "sm" ? 12 : thickness === "lg" ? 18 : 14
  const accent = accentColor ?? "var(--color-primary, #ec4899)"

  // Bipolar: 0 noktası norm = 0.5, active fill 50%'den value yönüne
  const activeFromPct = bipolar ? 50 : 0
  const activeToPct = norm * 100
  const fillLeft = Math.min(activeFromPct, activeToPct)
  const fillRight = Math.max(activeFromPct, activeToPct)

  const displayValue = formatValue
    ? formatValue(value)
    : bipolar
      ? value === 0
        ? "C"
        : `${value > 0 ? "+" : ""}${value.toFixed(2)}`
      : value.toFixed(2)

  return (
    <div
      className={cn("flex flex-col gap-1", className)}
      onClick={(e) => e.stopPropagation()}
    >
      {(label || showValue) && (
        <div className="flex items-center justify-between gap-2">
          {label && (
            <span className="select-none text-[9px] font-medium uppercase tracking-widest text-neutral-500">
              {label}
            </span>
          )}
          {showValue && (
            <span className="select-none font-mono text-[10px] text-neutral-300 tabular-nums">
              {displayValue}
            </span>
          )}
        </div>
      )}
      <div
        ref={trackRef}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onDoubleClick={handleDouble}
        onWheel={handleWheel}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={cn(
          "relative w-full touch-none select-none",
          disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
        )}
        style={{ height: thumbSize + 4 }}
      >
        {/* Rail (inset) */}
        <div
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full bg-neutral-900"
          style={{
            height: railHeight,
            boxShadow:
              "inset 0 1px 2px rgba(0,0,0,0.7), inset 0 -1px 0 rgba(255,255,255,0.04)",
          }}
        />
        {/* Bipolar center tick */}
        {bipolar && (
          <div
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-neutral-600"
            style={{ left: "50%", width: 1, height: railHeight + 6 }}
          />
        )}
        {/* Active fill */}
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-full"
          style={{
            height: railHeight,
            left: `${fillLeft}%`,
            width: `${fillRight - fillLeft}%`,
            background: `linear-gradient(180deg, ${accent}f0 0%, ${accent}b0 100%)`,
            boxShadow: hovering
              ? `0 0 6px ${accent}80, inset 0 1px 0 rgba(255,255,255,0.18)`
              : `inset 0 1px 0 rgba(255,255,255,0.18)`,
            transition: "box-shadow 120ms",
          }}
        />
        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-neutral-700"
          style={{
            left: `${norm * 100}%`,
            width: thumbSize,
            height: thumbSize,
            background:
              "radial-gradient(circle at 35% 30%, #525252 0%, #1f1f1f 70%, #0a0a0a 100%)",
            boxShadow: hovering
              ? `0 0 0 2px ${accent}40, 0 2px 4px rgba(0,0,0,0.6)`
              : "0 1px 3px rgba(0,0,0,0.6)",
            transition: "box-shadow 120ms",
          }}
        >
          {/* Thumb top highlight stripe */}
          <div
            className="absolute inset-x-1 top-1 rounded-full opacity-50"
            style={{
              height: 1,
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)",
            }}
          />
        </div>
      </div>
    </div>
  )
}
