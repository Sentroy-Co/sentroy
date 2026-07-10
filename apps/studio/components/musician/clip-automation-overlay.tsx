"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import type { MusicianClip } from "@workspace/db/models/studio-project-data"

/**
 * Clip içi volume automation çizgisi — ClipBlock'un waveform katmanı
 * üzerine SVG overlay olarak render edilir.
 *
 * UX:
 *   - Boş clip (no gainPoints) → orta yükseklikte düz çizgi (clip.gain),
 *     hover'da yarı saydam görünür; click → ilk noktayı ekler ve 2.
 *     noktayı duration sonuna koyar (line aktif olur)
 *   - Line üzerinde click → ara nokta ekle
 *   - Point drag → x = clip-relative time, y = gain (0..1.5)
 *   - Point double-click → sil; tek nokta kalırsa otomatik temizle
 *
 * Pointer event'ler ClipBlock'un drag handler'larıyla çakışmasın diye
 * `stopPropagation()` çağrılır.
 */
export function ClipAutomationOverlay({
  clip,
  pxPerSec,
  width,
  accentColor,
  onChange,
}: {
  clip: MusicianClip
  pxPerSec: number
  width: number
  accentColor: string
  onChange(points: Array<{ time: number; value: number }>): void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  // pointer drag state — hangi nokta sürükleniyor
  const dragRef = useRef<{ idx: number } | null>(null)
  const [hovering, setHovering] = useState(false)

  const points = useMemo(() => {
    const raw = clip.gainPoints ?? []
    return [...raw].sort((a, b) => a.time - b.time)
  }, [clip.gainPoints])

  const hasEnvelope = points.length >= 2
  // SVG viewport: width = px, height = clip block height (100% of parent).
  // y axis: top = max gain (1.5), bottom = 0 gain. Default clip.gain visual
  // baseline center = ~0.85 (track default). Map: y = (1 - value/MAX) * 100
  const MAX_GAIN = 1.5
  const valueToY = useCallback(
    (v: number) => (1 - Math.max(0, Math.min(MAX_GAIN, v)) / MAX_GAIN) * 100,
    [],
  )
  const yToValue = useCallback(
    (yPct: number) =>
      Math.max(0, Math.min(MAX_GAIN, (1 - yPct / 100) * MAX_GAIN)),
    [],
  )

  // Default flat line (no envelope) — clip.gain seviyesinde tek noktada
  const defaultY = valueToY(clip.gain)

  // SVG koordinatından clip-relative time ve gain hesapla
  const eventToPoint = useCallback(
    (e: React.PointerEvent<SVGElement> | React.MouseEvent<SVGElement>) => {
      const svg = svgRef.current
      if (!svg) return null
      const rect = svg.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return null
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const time =
        clip.duration > 0
          ? Math.max(0, Math.min(clip.duration, (x / rect.width) * clip.duration))
          : 0
      const value = yToValue((y / rect.height) * 100)
      return { time, value }
    },
    [clip.duration, yToValue],
  )

  // Line üzerinde tıklama → yeni nokta ekle
  const handleLineClick = useCallback(
    (e: React.MouseEvent<SVGElement>) => {
      e.stopPropagation()
      const p = eventToPoint(e)
      if (!p) return
      if (!hasEnvelope) {
        // Boş envelope — flat line'a 2 nokta ekle (clip baş + son), sonra
        // ortada tıklanan noktayı insert et
        const next = [
          { time: 0, value: clip.gain },
          p,
          { time: clip.duration, value: clip.gain },
        ].sort((a, b) => a.time - b.time)
        onChange(next)
      } else {
        const next = [...points, p].sort((a, b) => a.time - b.time)
        onChange(next)
      }
    },
    [eventToPoint, hasEnvelope, points, clip.gain, clip.duration, onChange],
  )

  // Point drag
  const handlePointDown = useCallback(
    (idx: number) => (e: React.PointerEvent<SVGCircleElement>) => {
      if (e.button !== 0) return
      e.stopPropagation()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {}
      dragRef.current = { idx }
    },
    [],
  )
  const handlePointMove = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      const drag = dragRef.current
      if (!drag) return
      e.stopPropagation()
      const p = eventToPoint(e)
      if (!p) return
      // İlk ve son nokta time sabit kalsın (clamp); kullanıcı sadece value
      // değiştirebilir — yoksa envelope clip dışına kayar.
      const next = [...points]
      const isEndpoint = drag.idx === 0 || drag.idx === points.length - 1
      const cur = next[drag.idx]
      if (cur) {
        next[drag.idx] = {
          time: isEndpoint ? cur.time : p.time,
          value: p.value,
        }
      }
      next.sort((a, b) => a.time - b.time)
      onChange(next)
    },
    [eventToPoint, points, onChange],
  )
  const handlePointUp = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {}
      dragRef.current = null
    },
    [],
  )
  const handlePointDouble = useCallback(
    (idx: number) => (e: React.MouseEvent<SVGCircleElement>) => {
      e.stopPropagation()
      // Tek nokta veya 2 nokta kalırsa flat'e dön (envelope'u tamamen sil)
      if (points.length <= 2) {
        onChange([])
        return
      }
      const next = points.filter((_, i) => i !== idx)
      onChange(next)
    },
    [points, onChange],
  )

  // SVG path — line connecting all points
  const linePath = useMemo(() => {
    if (!hasEnvelope) return ""
    const segs = points.map((p, i) => {
      const x = clip.duration > 0 ? (p.time / clip.duration) * width : 0
      const y = (valueToY(p.value) / 100) * 100 // viewBox 0..100 height %
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    return segs.join(" ")
  }, [points, hasEnvelope, clip.duration, width, valueToY])

  return (
    <svg
      ref={svgRef}
      className="pointer-events-auto absolute inset-0 z-20 h-full w-full"
      preserveAspectRatio="none"
      viewBox={`0 0 ${width} 100`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={handleLineClick}
      onPointerDown={(e) => e.stopPropagation()}
      style={{ cursor: hasEnvelope || hovering ? "crosshair" : "default" }}
    >
      {/* Flat baseline (no envelope) — hover'da yarı saydam görünür ki
          kullanıcı "buraya tıklayıp otomasyon ekleyebilirim" anlasın */}
      {!hasEnvelope && hovering && (
        <line
          x1={0}
          y1={defaultY}
          x2={width}
          y2={defaultY}
          stroke={accentColor}
          strokeWidth={1}
          strokeDasharray="3 3"
          opacity={0.55}
          pointerEvents="none"
        />
      )}
      {/* Envelope dolgu — line altı yarı saydam */}
      {hasEnvelope && (
        <>
          <path
            d={`${linePath} L ${width} 100 L 0 100 Z`}
            fill={accentColor}
            fillOpacity={0.08}
            pointerEvents="none"
          />
          <path
            d={linePath}
            fill="none"
            stroke={accentColor}
            strokeWidth={1.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.95}
            pointerEvents="none"
          />
          {/* Points — kullanıcı drag/dbl-click ile değiştirir */}
          {points.map((p, i) => {
            const x =
              clip.duration > 0 ? (p.time / clip.duration) * width : 0
            const y = valueToY(p.value)
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={3}
                fill={accentColor}
                stroke="#0a0a0a"
                strokeWidth={1}
                style={{ cursor: "ns-resize" }}
                onPointerDown={handlePointDown(i)}
                onPointerMove={handlePointMove}
                onPointerUp={handlePointUp}
                onPointerCancel={handlePointUp}
                onDoubleClick={handlePointDouble(i)}
                onClick={(e) => e.stopPropagation()}
              >
                <title>
                  {`t=${p.time.toFixed(2)}s · gain=${p.value.toFixed(2)}× — double-click to remove`}
                </title>
              </circle>
            )
          })}
        </>
      )}
    </svg>
  )
}
