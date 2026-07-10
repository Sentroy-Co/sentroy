"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ReloadIcon } from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import type { MusicianClip } from "@workspace/db/models/studio-project-data"
import { ProSlider } from "../controls"

/**
 * Clip trim content — InspectorPanel sekmesi. Kaynak audio'nun tam
 * waveform'u + sürüklenebilir "playable window" overlay'i.
 *
 * Window drag modu:
 *   - Body → offset değişir, duration aynı (window'u kaydır)
 *   - Sol kenar → trim start (offset + duration zıt)
 *   - Sağ kenar → trim end (duration)
 *
 * Apply tuşuna basana kadar değişiklikler lokal draft. İptal: tab'ı
 * kapatmak (kaydetmeden iptal). Reset → full source.
 */
export function ClipTrimContent({
  clip,
  peaks,
  sourceDuration,
  onCommit,
}: {
  clip: MusicianClip | null
  peaks: Float32Array | null
  sourceDuration: number
  onCommit(patch: { offset: number; duration: number }): void
}) {
  const [draftOffset, setDraftOffset] = useState(0)
  const [draftDuration, setDraftDuration] = useState(0)
  const lastClipIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!clip) return
    // Yeni clip seçildiyse draft sıfırla; aynı clip içinde dış mutasyon
    // (örn. undo) gelirse de güncelle.
    if (lastClipIdRef.current !== clip.id) {
      lastClipIdRef.current = clip.id
      setDraftOffset(clip.offset)
      setDraftDuration(clip.duration)
    }
  }, [clip])

  if (!clip) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-neutral-500">
        Clip gone — close this tab
      </div>
    )
  }
  if (sourceDuration <= 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-neutral-500">
        Loading source audio…
      </div>
    )
  }

  const dirty =
    Math.abs(draftOffset - clip.offset) > 0.001 ||
    Math.abs(draftDuration - clip.duration) > 0.001

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-800 px-4 py-2">
        <div className="flex items-center gap-3 font-mono text-[10px] text-neutral-400">
          <span>
            <span className="text-neutral-500">Source:</span>{" "}
            {fmt(sourceDuration)}
          </span>
          <span>
            <span className="text-neutral-500">Offset:</span>{" "}
            {fmt(draftOffset)}
          </span>
          <span>
            <span className="text-neutral-500">Length:</span>{" "}
            {fmt(draftDuration)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraftOffset(0)
              setDraftDuration(sourceDuration)
            }}
            className="h-7 gap-1 text-[10px]"
            title="Reset to full source"
          >
            <HugeiconsIcon icon={ReloadIcon} size={10} />
            Reset
          </Button>
          <Button
            size="sm"
            disabled={!dirty}
            onClick={() =>
              onCommit({ offset: draftOffset, duration: draftDuration })
            }
            className="h-7 bg-primary px-3 text-[10px] text-primary-foreground hover:bg-primary/80 disabled:opacity-40"
          >
            Apply
          </Button>
        </div>
      </div>

      {/* Source waveform with draggable window */}
      <div className="min-h-0 flex-1 overflow-hidden p-4">
        <SourceWindowEditor
          color="#ec4899"
          peaks={peaks}
          sourceDuration={sourceDuration}
          offset={draftOffset}
          duration={draftDuration}
          onOffsetChange={setDraftOffset}
          onDurationChange={setDraftDuration}
        />
      </div>

      {/* Numeric controls — fine-tune offset / duration */}
      <div className="grid shrink-0 grid-cols-2 gap-6 border-t border-neutral-800 bg-neutral-900/40 px-4 py-3">
        <ProSlider
          label="Source offset"
          value={draftOffset}
          onChange={(v) =>
            setDraftOffset(
              Math.max(0, Math.min(sourceDuration - draftDuration, v)),
            )
          }
          min={0}
          max={Math.max(0.01, sourceDuration - draftDuration)}
          step={0.01}
          defaultValue={0}
          formatValue={fmt}
          accentColor="#ec4899"
        />
        <ProSlider
          label="Clip duration"
          value={draftDuration}
          onChange={(v) =>
            setDraftDuration(
              Math.max(0.1, Math.min(sourceDuration - draftOffset, v)),
            )
          }
          min={0.1}
          max={Math.max(0.1, sourceDuration - draftOffset)}
          step={0.01}
          defaultValue={sourceDuration}
          formatValue={fmt}
          accentColor="#06b6d4"
        />
      </div>
    </div>
  )
}

// ─── SourceWindowEditor ──────────────────────────────────────────────────

function SourceWindowEditor({
  color,
  peaks,
  sourceDuration,
  offset,
  duration,
  onOffsetChange,
  onDurationChange,
}: {
  color: string
  peaks: Float32Array | null
  sourceDuration: number
  offset: number
  duration: number
  onOffsetChange(next: number): void
  onDurationChange(next: number): void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      setContainerWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pxPerSec = sourceDuration > 0 ? containerWidth / sourceDuration : 0
  const bars = useMemo(() => {
    if (!peaks || containerWidth === 0) return new Float32Array(0)
    const target = Math.max(40, Math.floor(containerWidth / 3))
    const out = new Float32Array(target)
    const ratio = peaks.length / target
    for (let i = 0; i < target; i++) {
      const start = Math.floor(i * ratio)
      const end = Math.max(start + 1, Math.floor((i + 1) * ratio))
      let max = 0
      for (let j = start; j < end; j++) {
        const v = peaks[j] ?? 0
        if (v > max) max = v
      }
      out[i] = max
    }
    return out
  }, [peaks, containerWidth])

  const windowLeft = offset * pxPerSec
  const windowWidth = Math.max(8, duration * pxPerSec)

  const dragRef = useRef<{
    mode: "body" | "left" | "right"
    startX: number
    startOffset: number
    startDuration: number
  } | null>(null)

  const onDown = useCallback(
    (mode: "body" | "left" | "right") =>
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return
        e.stopPropagation()
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {}
        dragRef.current = {
          mode,
          startX: e.clientX,
          startOffset: offset,
          startDuration: duration,
        }
      },
    [offset, duration],
  )

  const onMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || pxPerSec === 0) return
      const deltaSec = (e.clientX - drag.startX) / pxPerSec
      if (drag.mode === "body") {
        const nextOffset = Math.max(
          0,
          Math.min(
            sourceDuration - drag.startDuration,
            drag.startOffset + deltaSec,
          ),
        )
        onOffsetChange(nextOffset)
      } else if (drag.mode === "left") {
        const wantOffset = drag.startOffset + deltaSec
        const wantDuration = drag.startDuration - deltaSec
        if (wantDuration < 0.1 || wantOffset < 0) return
        onOffsetChange(wantOffset)
        onDurationChange(wantDuration)
      } else if (drag.mode === "right") {
        const wantDuration = Math.max(
          0.1,
          Math.min(
            sourceDuration - drag.startOffset,
            drag.startDuration + deltaSec,
          ),
        )
        onDurationChange(wantDuration)
      }
    },
    [pxPerSec, sourceDuration, onOffsetChange, onDurationChange],
  )

  const onUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
    dragRef.current = null
  }, [])

  // Ruler tick step — source uzunluğuna göre uyumlu: <5s = 0.5s, <30s = 1s,
  // <120s = 5s, üstü 10s. Kullanıcıya neyi kestiğini daha net göstersin.
  const rulerStep =
    sourceDuration <= 5
      ? 0.5
      : sourceDuration <= 30
        ? 1
        : sourceDuration <= 120
          ? 5
          : 10
  const rulerTicks: number[] = []
  for (let s = 0; s <= sourceDuration + 0.001; s += rulerStep) {
    rulerTicks.push(s)
  }
  // Major tick = her 2 tick'te bir label gösterilsin (kalabalık yaratmasın)
  const RULER_HEIGHT = 18
  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-md border border-neutral-800 bg-neutral-900"
      style={{
        boxShadow: "inset 0 1px 3px rgba(0,0,0,0.6)",
      }}
    >
      {/* ─── Timeline ruler — üst kenarda, kaynak süresine göre tick'li ─── */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 border-b border-neutral-800 bg-neutral-950/70 backdrop-blur-sm"
        style={{ height: RULER_HEIGHT }}
      >
        {pxPerSec > 0 &&
          rulerTicks.map((sec, idx) => {
            const x = sec * pxPerSec
            const isMajor = idx % 2 === 0
            return (
              <div
                key={idx}
                className="absolute top-0 h-full"
                style={{ left: x }}
              >
                <div
                  className={cn(
                    "absolute top-0 w-px bg-neutral-700",
                    isMajor ? "h-3" : "h-1.5",
                  )}
                />
                {isMajor && (
                  <div
                    className="absolute top-3 font-mono text-[8px] text-neutral-500"
                    style={{ transform: "translateX(2px)" }}
                  >
                    {fmtRuler(sec)}
                  </div>
                )}
              </div>
            )
          })}
      </div>
      {/* Source waveform — dim, ruler altından başlasın */}
      {bars.length > 0 && (
        <svg
          className="pointer-events-none absolute inset-x-0 h-full w-full"
          style={{ top: RULER_HEIGHT, height: `calc(100% - ${RULER_HEIGHT}px)` }}
          preserveAspectRatio="none"
          viewBox={`0 0 ${bars.length * 3} 100`}
        >
          {Array.from(bars).map((p, i) => {
            const h = Math.max(1.5, p * 90)
            return (
              <rect
                key={i}
                x={i * 3}
                y={50 - h / 2}
                width={2}
                height={h}
                fill="#525252"
                fillOpacity={0.55}
              />
            )
          })}
        </svg>
      )}
      {/* Grid lines — ruler ticks devamı (kullanıcı tam neyi kestiğini görsün) */}
      {pxPerSec > 0 && (
        <svg
          className="pointer-events-none absolute inset-x-0"
          style={{ top: RULER_HEIGHT, height: `calc(100% - ${RULER_HEIGHT}px)`, width: "100%" }}
        >
          {rulerTicks.map((sec, idx) => {
            const x = sec * pxPerSec
            const isMajor = idx % 2 === 0
            return (
              <line
                key={idx}
                x1={x}
                y1={0}
                x2={x}
                y2="100%"
                stroke="#262626"
                strokeWidth={1}
                strokeDasharray={isMajor ? undefined : "2,2"}
                opacity={isMajor ? 0.7 : 0.4}
              />
            )
          })}
        </svg>
      )}
      {/* Playable window overlay */}
      {pxPerSec > 0 && (
        <div
          className="absolute z-10"
          style={{
            left: windowLeft,
            width: windowWidth,
            top: RULER_HEIGHT,
            bottom: 0,
          }}
        >
          <div
            onPointerDown={onDown("body")}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className="absolute inset-0 cursor-grab rounded border-2 active:cursor-grabbing"
            style={{
              borderColor: color,
              background: `${color}1a`,
              boxShadow: `0 0 0 1px ${color}40, 0 0 14px ${color}40`,
            }}
          />
          {/* Edge time labels — start/end absolute time on source */}
          <div
            className="pointer-events-none absolute -top-4 left-0 z-30 rounded bg-neutral-900 px-1 font-mono text-[9px]"
            style={{ color, transform: "translateX(-1px)" }}
          >
            {fmtRuler(offset)}
          </div>
          <div
            className="pointer-events-none absolute -top-4 right-0 z-30 rounded bg-neutral-900 px-1 font-mono text-[9px]"
            style={{ color, transform: "translateX(1px)" }}
          >
            {fmtRuler(offset + duration)}
          </div>
          <div
            onPointerDown={onDown("left")}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize"
            style={{ background: `${color}99` }}
            title="Drag to trim start"
          />
          <div
            onPointerDown={onDown("right")}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize"
            style={{ background: `${color}99` }}
            title="Drag to trim end"
          />
          {bars.length > 0 && (
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              preserveAspectRatio="none"
              viewBox={`0 0 ${bars.length * 3} 100`}
            >
              {Array.from(bars).map((_, i) => {
                const barSec =
                  sourceDuration > 0 ? (i / bars.length) * sourceDuration : 0
                if (barSec < offset || barSec > offset + duration) return null
                const p = bars[i] ?? 0
                const h = Math.max(1.5, p * 90)
                const baseX = (offset / sourceDuration) * (bars.length * 3)
                return (
                  <rect
                    key={i}
                    x={i * 3 - baseX}
                    y={50 - h / 2}
                    width={2}
                    height={h}
                    fill={color}
                    fillOpacity={0.95}
                  />
                )
              })}
            </svg>
          )}
        </div>
      )}
    </div>
  )
}

function fmtRuler(s: number): string {
  if (!Number.isFinite(s)) return "0s"
  if (s < 1) return `${(s * 1000).toFixed(0)}ms`
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`
  const m = Math.floor(s / 60)
  const rem = Math.floor(s % 60)
  return `${m}:${rem.toString().padStart(2, "0")}`
}

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0.00s"
  return `${s.toFixed(2)}s`
}
