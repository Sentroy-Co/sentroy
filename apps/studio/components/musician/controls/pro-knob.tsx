"use client"

import { useCallback, useRef } from "react"
import { cn } from "@workspace/ui/lib/utils"

/**
 * DJ / FL Studio plugin tarzı rotary knob.
 *
 * Mod:
 *   - bipolar: -1..+1 ortalı (pan, ±dB gain)
 *   - unipolar: 0..1 (wet, mix, percentage)
 *
 * Drag: dikey + yatay birleşik (her ikisinde sensitivite ayarlı);
 * Shift basılıyken 5× hassas (ince ayar).
 * Double-click → defaultValue'ye reset.
 * Wheel: ±step adım.
 *
 * Görsel katmanlar (SVG):
 *   1. Outer arc track (gri rail) — 270° sweep
 *   2. Active arc fill — current value'ye kadar (bipolar'da 0'dan iki yönlü)
 *   3. Inner knob disc — radial gradient (3D depth)
 *   4. Tick marks (opsiyonel)
 *   5. Rotating indicator chevron
 *   6. Center dot
 */
export function ProKnob({
  value,
  onChange,
  min,
  max,
  step = 0.01,
  defaultValue,
  bipolar = false,
  size = 48,
  label,
  formatValue,
  accentColor,
  disabled = false,
  showValue = true,
  className,
}: {
  value: number
  onChange(next: number): void
  min: number
  max: number
  step?: number
  defaultValue?: number
  bipolar?: boolean
  size?: number
  label?: string
  formatValue?(v: number): string
  accentColor?: string
  disabled?: boolean
  showValue?: boolean
  className?: string
}) {
  const dragRef = useRef<{
    startX: number
    startY: number
    startVal: number
    shift: boolean
  } | null>(null)

  const clamp = useCallback(
    (v: number) => Math.max(min, Math.min(max, v)),
    [min, max],
  )

  const handleDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || e.button !== 0) return
      e.stopPropagation()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {}
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startVal: value,
        shift: e.shiftKey,
      }
    },
    [disabled, value],
  )

  const handleMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag) return
      const dx = e.clientX - drag.startX
      const dy = drag.startY - e.clientY
      // 120px hareket = tam range; shift ile 5× hassas
      const sensitivity = (e.shiftKey || drag.shift) ? 600 : 120
      const range = max - min
      const delta = ((dx + dy) / sensitivity) * range
      onChange(clamp(drag.startVal + delta))
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

  // 0..1 normalized
  const norm = (value - min) / (max - min || 1)
  // Knob 270° açı: -135° (sol alt) → +135° (sağ alt). 12 saat yukarı.
  const angle = -135 + norm * 270

  // SVG geometri — viewBox 100x100 referans, size ile scale
  const cx = 50
  const cy = 50
  const outerR = 44
  const innerR = 28
  const tickR = 47

  // Arc path generator — 270° sweep, start angle -225° (sol alt köşe)
  const arcPath = useCallback(
    (startDeg: number, endDeg: number, radius: number) => {
      const toRad = (d: number) => ((d - 90) * Math.PI) / 180
      const sx = cx + radius * Math.cos(toRad(startDeg))
      const sy = cy + radius * Math.sin(toRad(startDeg))
      const ex = cx + radius * Math.cos(toRad(endDeg))
      const ey = cy + radius * Math.sin(toRad(endDeg))
      const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0
      const sweep = endDeg > startDeg ? 1 : 0
      return `M ${sx} ${sy} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${ex} ${ey}`
    },
    [],
  )

  // Active arc — bipolar: 0'dan iki yöne; unipolar: -135'ten value açısına
  const activeStart = bipolar ? -135 + 0.5 * 270 : -135
  const activeEnd = angle
  const accent = accentColor ?? "var(--color-primary, #ec4899)"

  const displayValue = formatValue
    ? formatValue(value)
    : bipolar
      ? value === 0
        ? "C"
        : `${value > 0 ? "+" : ""}${value.toFixed(2)}`
      : value.toFixed(2)

  return (
    <div className={cn("flex flex-col items-center gap-1.5", className)}>
      {label && (
        <div className="select-none text-[9px] font-medium uppercase tracking-widest text-neutral-500">
          {label}
        </div>
      )}
      <div
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onDoubleClick={handleDouble}
        onWheel={handleWheel}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative shrink-0 touch-none select-none",
          disabled ? "cursor-not-allowed opacity-40" : "cursor-ns-resize",
        )}
        style={{ width: size, height: size }}
        title={`${label ? label + ": " : ""}${displayValue}`}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          className="overflow-visible"
        >
          <defs>
            <radialGradient id={`knob-grad-${size}`} cx="35%" cy="30%">
              <stop offset="0%" stopColor="#3f3f46" />
              <stop offset="60%" stopColor="#18181b" />
              <stop offset="100%" stopColor="#09090b" />
            </radialGradient>
            <linearGradient id={`knob-rim-${size}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#52525b" />
              <stop offset="100%" stopColor="#27272a" />
            </linearGradient>
          </defs>
          {/* Outer rail track (gri) — 270° sweep */}
          <path
            d={arcPath(-135, 135, outerR - 2)}
            fill="none"
            stroke="#27272a"
            strokeWidth={3}
            strokeLinecap="round"
          />
          {/* Active arc fill */}
          <path
            d={arcPath(activeStart, activeEnd, outerR - 2)}
            fill="none"
            stroke={accent}
            strokeWidth={3}
            strokeLinecap="round"
            opacity={0.95}
          />
          {/* Tick marks every 22.5° (12 tick) */}
          {Array.from({ length: 12 }, (_, i) => {
            const a = -135 + (i * 270) / 11
            const rad = ((a - 90) * Math.PI) / 180
            return (
              <line
                key={i}
                x1={cx + tickR * Math.cos(rad)}
                y1={cy + tickR * Math.sin(rad)}
                x2={cx + (tickR - 2) * Math.cos(rad)}
                y2={cy + (tickR - 2) * Math.sin(rad)}
                stroke="#3f3f46"
                strokeWidth={0.8}
              />
            )
          })}
          {/* Knob disc rim (border) */}
          <circle
            cx={cx}
            cy={cy}
            r={innerR + 4}
            fill={`url(#knob-rim-${size})`}
          />
          {/* Knob disc body (gradient) */}
          <circle
            cx={cx}
            cy={cy}
            r={innerR}
            fill={`url(#knob-grad-${size})`}
          />
          {/* Indicator group — rotated */}
          <g transform={`rotate(${angle} ${cx} ${cy})`}>
            <line
              x1={cx}
              y1={cy - innerR + 4}
              x2={cx}
              y2={cy - innerR + 14}
              stroke={accent}
              strokeWidth={2.2}
              strokeLinecap="round"
            />
            <circle
              cx={cx}
              cy={cy - innerR + 16}
              r={1.8}
              fill={accent}
            />
          </g>
          {/* Center cap */}
          <circle cx={cx} cy={cy} r={2.5} fill="#52525b" />
        </svg>
      </div>
      {showValue && (
        <div className="select-none font-mono text-[10px] text-neutral-300 tabular-nums">
          {displayValue}
        </div>
      )}
    </div>
  )
}
