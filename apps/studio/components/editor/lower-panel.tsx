"use client"

import { useEffect, useMemo, useRef } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  AudioWaveIcon,
  MagicWand01Icon,
  PulseIcon,
} from "@hugeicons/core-free-icons"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@workspace/ui/components/tabs"
import { cn } from "@workspace/ui/lib/utils"
import { useShallow } from "zustand/react/shallow"
import {
  useDjStore,
  DECK_ACCENTS,
  getDeckIdsFromLayout,
  type DeckId,
} from "@/lib/dj-store"
import { setMasterFx } from "@/lib/audio-engine"
import { beginBeatRepeat, endBeatRepeat } from "@/lib/dj-actions"
import { Knob } from "./pioneer/knob"

/**
 * Decks ile footer arasında 3-tab alt panel:
 *   - Master FX     — Pioneer DJM-900 tarzı master out FX slot
 *   - Beat Repeat   — (Batch 3) loop roll ¼/½/1/2/4 beat pad'leri
 *   - Overview      — (Batch 4) 4 deck mini timeline yan yana
 *
 * Şu an sadece Master FX aktif; diğer iki sekme placeholder ile döşeli
 * (kullanıcı planı görüyor, gelmeyen feature'ları boş bırakmıyoruz).
 */

const MASTER_FX_OPTIONS: { value: string; label: string; desc: string }[] = [
  { value: "none", label: "Bypass", desc: "Master FX off" },
  { value: "echo", label: "Echo", desc: "PingPong delay 8n" },
  { value: "reverb", label: "Reverb", desc: "Hall decay 2.5s" },
  { value: "phaser", label: "Phaser", desc: "0.5 Hz, 3 octave sweep" },
  { value: "bitcrusher", label: "BitCrush", desc: "4-bit reduction" },
  { value: "filterSweep", label: "Filter Sweep", desc: "AutoFilter LFO" },
]

export function LowerPanel() {
  const masterEffects = useDjStore((s) => s.tree.master.effects)
  const patchTree = useDjStore((s) => s.patchTree)

  // Tek master FX slot — array'in [0]'ı; yoksa "none" varsayılan
  const masterFx = masterEffects[0] ?? {
    id: "master-fx-0",
    type: "none",
    enabled: true,
    wet: 0.3,
    params: {},
  }

  // Tree → engine sync (type + wet değişimleri audio engine'e itilir)
  useEffect(() => {
    setMasterFx(
      masterFx.enabled ? masterFx.type : "none",
      masterFx.wet,
    )
  }, [masterFx.type, masterFx.wet, masterFx.enabled])

  const updateMasterFx = (patch: Partial<typeof masterFx>) => {
    patchTree((tree) => {
      const next = { ...masterFx, ...patch }
      const others = tree.master.effects.slice(1)
      return {
        ...tree,
        master: { ...tree.master, effects: [next, ...others] },
      }
    })
  }

  return (
    <div className="shrink-0 border-t border-neutral-800 bg-neutral-950/60">
      <Tabs defaultValue="master-fx" className="flex flex-col">
        <TabsList className="rounded-none border-b border-neutral-800 bg-transparent px-3 py-0">
          <TabsTrigger
            value="master-fx"
            className="gap-1.5 data-[state=active]:bg-neutral-900 data-[state=active]:text-pink-400"
          >
            <HugeiconsIcon icon={MagicWand01Icon} size={12} />
            Master FX
          </TabsTrigger>
          <TabsTrigger
            value="beat-repeat"
            className="gap-1.5 data-[state=active]:bg-neutral-900 data-[state=active]:text-emerald-300"
          >
            <HugeiconsIcon icon={PulseIcon} size={12} />
            Beat Repeat
          </TabsTrigger>
          <TabsTrigger
            value="overview"
            className="gap-1.5 data-[state=active]:bg-neutral-900 data-[state=active]:text-cyan-300"
          >
            <HugeiconsIcon icon={AudioWaveIcon} size={12} />
            Overview
          </TabsTrigger>
        </TabsList>

        <TabsContent value="master-fx" className="m-0 px-4 py-2">
          <div className="flex items-center gap-4">
            {/* FX type — pill row */}
            <div className="flex items-center gap-1">
              {MASTER_FX_OPTIONS.map((opt) => {
                const active = opt.value === masterFx.type
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      updateMasterFx({ type: opt.value, enabled: true })
                    }
                    className={cn(
                      "rounded-md border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest transition",
                      active
                        ? "border-pink-500 bg-pink-500/20 text-pink-300"
                        : "border-neutral-800 bg-neutral-900 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300",
                    )}
                    title={opt.desc}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>

            {/* Wet knob */}
            <div className="ms-auto flex items-center gap-3">
              <Knob
                label="Wet"
                value={masterFx.wet}
                min={0}
                max={1}
                step={0.01}
                defaultValue={0.3}
                onChange={(v) => updateMasterFx({ wet: v })}
                accentColor="#ec4899"
                size={42}
                formatValue={(v) => `${Math.round(v * 100)}%`}
              />

              {/* Bypass switch */}
              <button
                type="button"
                onClick={() => updateMasterFx({ enabled: !masterFx.enabled })}
                disabled={masterFx.type === "none"}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition disabled:cursor-not-allowed disabled:opacity-30",
                  masterFx.enabled
                    ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-300"
                    : "border-neutral-800 bg-neutral-900 text-neutral-500",
                )}
                title={masterFx.enabled ? "Active — click to disable" : "Off — click to enable"}
              >
                {masterFx.enabled ? "On" : "Off"}
              </button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="beat-repeat" className="m-0 px-4 py-2">
          <BeatRepeatRow />
        </TabsContent>
        <TabsContent value="overview" className="m-0 px-4 py-2">
          <MultiDeckOverview />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Beat Repeat / Loop Roll ────────────────────────────────────────────

const BEAT_LENGTHS: { value: number; label: string }[] = [
  { value: 0.25, label: "¼" },
  { value: 0.5, label: "½" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 4, label: "4" },
  { value: 8, label: "8" },
  { value: 16, label: "16" },
]

function BeatRepeatRow() {
  const ids = useDjStore(useShallow((s) => getDeckIdsFromLayout(s.tree.layout)))
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
      {ids.map((id) => (
        <DeckBeatRepeat key={id} deckId={id} />
      ))}
    </div>
  )
}

function DeckBeatRepeat({ deckId }: { deckId: DeckId }) {
  const deck = useDjStore((s) => s.tree.decks[deckId])
  const runtime = useDjStore((s) => s.transport[deckId])
  const palette = DECK_ACCENTS[deckId]
  const ready = runtime.loaded && deck.bpm !== null
  return (
    <>
      <div className="flex items-center gap-2">
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded font-mono text-[10px] font-bold text-white"
          style={{ backgroundColor: palette.hex }}
        >
          {deckId}
        </span>
        <span className="font-mono text-[10px] text-neutral-500">
          {deck.bpm ? `${Math.round(deck.bpm * (1 + deck.pitch))} BPM` : "—"}
        </span>
      </div>
      <div className="flex items-stretch gap-1.5">
        {BEAT_LENGTHS.map((b) => (
          <BeatRepeatPad
            key={b.value}
            deckId={deckId}
            beats={b.value}
            label={b.label}
            accent={palette.hex}
            disabled={!ready}
          />
        ))}
      </div>
    </>
  )
}

// ─── Multi-deck waveform overview ───────────────────────────────────────

/**
 * 4 deck'in mini timeline'larını yan yana gösterir. Peak envelope SVG
 * polyline (WaveSurfer exportPeaks → store paylaşımı). Playhead her
 * deck için ayrı bir rAF loop ile direkt DOM transform update edilir
 * (React render dışı, 60fps 4 deck × ucuz).
 *
 * Beat grid (deck.bpm + beatgridOffset varsa) sade tick mark'ları
 * arka planda gösterilir.
 */
function MultiDeckOverview() {
  const ids = useDjStore(useShallow((s) => getDeckIdsFromLayout(s.tree.layout)))
  return (
    <div className="grid grid-cols-1 gap-1.5">
      {ids.map((id) => (
        <DeckOverviewRow key={id} deckId={id} />
      ))}
    </div>
  )
}

function DeckOverviewRow({ deckId }: { deckId: DeckId }) {
  const runtime = useDjStore((s) => s.transport[deckId])
  const palette = DECK_ACCENTS[deckId]
  const playheadRef = useRef<HTMLDivElement>(null)

  // Playhead position — store.getState() ile direkt oku, render bypass
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const rt = useDjStore.getState().transport[deckId]
      const el = playheadRef.current
      if (el && rt.duration > 0) {
        const pct = (rt.position / rt.duration) * 100
        el.style.left = `${Math.max(0, Math.min(100, pct))}%`
        el.style.opacity = rt.isPlaying ? "1" : "0.6"
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [deckId])

  const pathD = useMemo(
    () => peaksToPath(runtime.peaks),
    [runtime.peaks],
  )

  return (
    <div className="flex items-center gap-2">
      {/* Deck label */}
      <div
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded font-mono text-[10px] font-bold text-white"
        style={{ backgroundColor: palette.hex }}
      >
        {deckId}
      </div>

      {/* Waveform timeline */}
      <div className="relative h-9 flex-1 overflow-hidden rounded bg-neutral-950 ring-1 ring-neutral-800">
        {runtime.peaks ? (
          <svg
            className="absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
            viewBox="0 0 1000 100"
          >
            <path d={pathD} fill={palette.hex + "60"} />
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center text-[9px] text-neutral-700">
            {runtime.loaded ? "loading peaks…" : "empty"}
          </div>
        )}

        {/* Playhead (DOM ref, rAF bypass) */}
        {runtime.loaded && (
          <div
            ref={playheadRef}
            className="pointer-events-none absolute top-0 h-full w-0.5"
            style={{
              background: palette.hex,
              boxShadow: `0 0 6px ${palette.hex}`,
              transform: "translateX(-1px)",
              left: "0%",
              willChange: "left",
            }}
          />
        )}
      </div>

      {/* Time tabular */}
      <div className="w-20 shrink-0 text-right font-mono text-[10px] text-neutral-500">
        {runtime.loaded
          ? `${fmtMM(runtime.position)} / ${fmtMM(runtime.duration)}`
          : "—"}
      </div>
    </div>
  )
}

function peaksToPath(peaks: number[] | null): string {
  if (!peaks || peaks.length === 0) return ""
  // SVG path: top envelope (i=0..N) + bottom envelope (reversed) + close.
  // ViewBox 0..1000 horizontal, 0..100 vertical (center @ 50).
  const N = peaks.length
  const top: string[] = []
  const bottom: string[] = []
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * 1000
    const p = Math.max(-1, Math.min(1, peaks[i] ?? 0))
    const yTop = 50 - Math.abs(p) * 48
    const yBot = 50 + Math.abs(p) * 48
    top.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${yTop.toFixed(1)}`)
    bottom.unshift(`L${x.toFixed(1)},${yBot.toFixed(1)}`)
  }
  return [...top, ...bottom, "Z"].join(" ")
}

function fmtMM(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00"
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, "0")}`
}

function BeatRepeatPad({
  deckId,
  beats,
  label,
  accent,
  disabled,
}: {
  deckId: DeckId
  beats: number
  label: string
  accent: string
  disabled: boolean
}) {
  const handleDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {}
    beginBeatRepeat(deckId, beats)
  }
  const handleUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
    endBeatRepeat(deckId)
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      className={cn(
        "group relative h-9 flex-1 select-none touch-none rounded-md border text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-30",
        "border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-neutral-700",
        "active:scale-95 active:border-transparent active:text-white",
      )}
      style={{
        ["--accent" as string]: accent,
      }}
      title={`${label} beat${beats !== 1 ? "s" : ""} loop — hold to engage`}
    >
      <span className="relative z-10">{label}</span>
      <span
        className="pointer-events-none absolute inset-0 rounded-md opacity-0 transition group-active:opacity-100"
        style={{
          background: `radial-gradient(circle at center, ${accent} 0%, ${accent}80 60%, transparent 100%)`,
          boxShadow: `0 0 16px ${accent}`,
        }}
      />
    </button>
  )
}
