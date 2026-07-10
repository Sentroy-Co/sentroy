"use client"

import { useCallback, useEffect } from "react"
import { useShallow } from "zustand/react/shallow"
import { cn } from "@workspace/ui/lib/utils"
import {
  useDjStore,
  type DeckId,
  DECK_ACCENTS,
  getDeckIdsFromLayout,
} from "@/lib/dj-store"
import {
  setDeckEq,
  setDeckFilter,
  setDeckFx,
  setDeckPan,
  setDeckVolume,
  setMixerMasterGain,
  setMasterLimiter,
  getDeckMeterDb,
} from "@/lib/audio-engine"
import { resetMixer } from "@/lib/dj-actions"
import type { DjDeckFxType } from "@workspace/db/models/studio-project-data"
import { Knob } from "./knob"
import { VerticalFader } from "./vertical-fader"
import { VuMeter } from "./vu-meter"

/**
 * Pioneer DJM-900 inspired mixer — orta sütun.
 *
 * Top:    Master gain + limiter knob'ları + Reset
 * Mid:    Dinamik kanal stripleri (her deck için 1) — Trim, 3 EQ knob,
 *         Color (filter), FX type + wet, Vertical channel fader
 *
 * Crossfader + Auto-mix paneli footer'a taşındı (CrossfaderPanel +
 * AutoMixPanel).
 */

const FX_TYPES: { value: DjDeckFxType; label: string }[] = [
  { value: "none", label: "Off" },
  { value: "echo", label: "Echo" },
  { value: "reverb", label: "Verb" },
  { value: "phaser", label: "Phase" },
  { value: "bitcrusher", label: "Crush" },
  { value: "filterSweep", label: "Sweep" },
]

export function DJMMixer({ mixerId }: { mixerId: string }) {
  const tree = useDjStore((s) => s.tree)
  const patchTree = useDjStore((s) => s.patchTree)
  const setMixerMasterGainStore = useDjStore((s) => s.setMixerMasterGain)
  const renameMixer = useDjStore((s) => s.renameMixer)

  // Bu mixer'ın state'ini bul. mixer null ise (henüz hydrate olmadı veya
  // remove edildi) panel boş döner.
  const mixer = tree.mixers.find((m) => m.id === mixerId)
  const master = mixer?.master ?? tree.master

  // Master tree → engine sync. Per-mixer: setMixerMasterGain(mixerId, gain).
  // Limiter ceiling default mixer için root-level legacy API; multi-mixer
  // her mixer'ın kendi limiter'ı, ama UI o detayı şu an exposesiz tutuyor.
  useEffect(() => {
    setMixerMasterGain(mixerId, master.gain)
  }, [mixerId, master.gain])
  useEffect(() => {
    setMasterLimiter(master.limiterCeiling)
  }, [master.limiterCeiling])

  const setMasterGainTree = useCallback(
    (val: number) => {
      setMixerMasterGainStore(mixerId, val)
    },
    [mixerId, setMixerMasterGainStore],
  )
  const setMasterCeiling = useCallback(
    (val: number) => {
      patchTree((t) => ({
        ...t,
        mixers: t.mixers.map((m) =>
          m.id === mixerId
            ? { ...m, master: { ...m.master, limiterCeiling: val } }
            : m,
        ),
        // Legacy mirror — sadece default mixer ise tree.master'ı da güncelle
        master:
          t.mixers[0]?.id === mixerId
            ? { ...t.master, limiterCeiling: val }
            : t.master,
      }))
    },
    [mixerId, patchTree],
  )

  return (
    <div className="flex w-fit shrink-0 flex-col gap-3 rounded-xl border border-neutral-800 bg-gradient-to-b from-neutral-900 to-neutral-950 p-3 shadow-2xl">
      {/* ─── Mixer name (editable) ─── */}
      {mixer && (
        <input
          value={mixer.name}
          onChange={(e) => renameMixer(mixerId, e.target.value)}
          className="w-full rounded border border-neutral-800 bg-neutral-950/60 px-2 py-0.5 text-center text-xs font-bold tracking-widest text-neutral-300 outline-none transition focus:border-amber-500/60 focus:text-amber-300"
          maxLength={60}
          aria-label="Mixer name"
        />
      )}
      {/* ─── Master section + Reset ─── */}
      <div className="flex items-end justify-between gap-3 border-b border-neutral-800 pb-3">
        <div className="flex items-end gap-4">
          <Knob
            label="Master"
            value={master.gain}
            min={0}
            max={2}
            step={0.01}
            defaultValue={1}
            onChange={setMasterGainTree}
            accentColor="#fafafa"
            size={48}
            formatValue={(v) =>
              `${(20 * Math.log10(v || 0.0001)).toFixed(1)}dB`
            }
          />
          <Knob
            label="Limit"
            value={master.limiterCeiling}
            min={-3}
            max={0}
            step={0.1}
            defaultValue={-0.5}
            onChange={setMasterCeiling}
            accentColor="#f59e0b"
            size={36}
            formatValue={(v) => `${v.toFixed(1)}dB`}
          />
        </div>
        <button
          type="button"
          onClick={resetMixer}
          className="self-end rounded border border-amber-600/60 bg-amber-600/10 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-amber-400 transition hover:border-amber-500 hover:bg-amber-600/20 hover:text-amber-300"
          title="Mixer reset — EQ/filter/pitch/FX/crossfader all neutral"
        >
          Reset
        </button>
      </div>

      {/* ─── Channel strips — dinamik (her deck için 1 strip) ─── */}
      {/* Crossfader + auto-mix kontrol paneli footer'a taşındı. */}
      <ChannelStripsRow />
    </div>
  )
}

/**
 * 4+ kanal striplerini layout'tan dinamik render eder. Grid sütun sayısı
 * deck sayısına eşit; çok deck'le mixer paneli yatay yüksekliği korur.
 */
function ChannelStripsRow() {
  const ids = useDjStore(useShallow((s) => getDeckIdsFromLayout(s.tree.layout)))
  return (
    <div
      className="grid gap-2"
      style={{
        // Her channel strip için sabit min-width — kart sayısı arttıkça
        // mixer genişler (sıkışmaz). Kullanıcı yatay scroll'la görür.
        gridTemplateColumns: `repeat(${Math.max(ids.length, 1)}, minmax(80px, 1fr))`,
      }}
    >
      {ids.map((id) => (
        <ChannelStrip key={id} deckId={id} />
      ))}
    </div>
  )
}

function ChannelStrip({ deckId }: { deckId: DeckId }) {
  const deck = useDjStore((s) => s.tree.decks[deckId])
  const patchTree = useDjStore((s) => s.patchTree)

  const accent = DECK_ACCENTS[deckId].hex

  // Tree → engine sync (EQ, filter, FX, volume)
  useEffect(() => {
    setDeckEq(deckId, deck.eq)
  }, [deck.eq, deckId])
  useEffect(() => {
    setDeckFilter(deckId, deck.filter.cutoff, deck.filter.resonance)
  }, [deck.filter.cutoff, deck.filter.resonance, deckId])
  useEffect(() => {
    const fx = deck.fx ?? { type: "none" as const, wet: 0.3 }
    setDeckFx(deckId, fx.type, fx.wet)
  }, [deck.fx?.type, deck.fx?.wet, deckId, deck.fx])
  useEffect(() => {
    setDeckVolume(deckId, deck.gain)
  }, [deck.gain, deckId])
  useEffect(() => {
    setDeckPan(deckId, deck.pan ?? 0)
  }, [deck.pan, deckId])

  const setEq = useCallback(
    (band: "low" | "mid" | "high", val: number) => {
      patchTree((t) => ({
        ...t,
        decks: {
          ...t.decks,
          [deckId]: { ...t.decks[deckId], eq: { ...t.decks[deckId].eq, [band]: val } },
        },
      }))
    },
    [deckId, patchTree],
  )

  const setFilterCutoff = useCallback(
    (val: number) => {
      patchTree((t) => ({
        ...t,
        decks: {
          ...t.decks,
          [deckId]: { ...t.decks[deckId], filter: { ...t.decks[deckId].filter, cutoff: val } },
        },
      }))
    },
    [deckId, patchTree],
  )

  const setVolume = useCallback(
    (val: number) => {
      patchTree((t) => ({
        ...t,
        decks: {
          ...t.decks,
          [deckId]: { ...t.decks[deckId], gain: val },
        },
      }))
    },
    [deckId, patchTree],
  )

  const setPan = useCallback(
    (val: number) => {
      patchTree((t) => ({
        ...t,
        decks: {
          ...t.decks,
          [deckId]: { ...t.decks[deckId], pan: val },
        },
      }))
    },
    [deckId, patchTree],
  )

  const setFxType = useCallback(
    (type: DjDeckFxType) => {
      patchTree((t) => ({
        ...t,
        decks: {
          ...t.decks,
          [deckId]: { ...t.decks[deckId], fx: { type, wet: t.decks[deckId].fx?.wet ?? 0.3 } },
        },
      }))
    },
    [deckId, patchTree],
  )

  const setFxWet = useCallback(
    (wet: number) => {
      patchTree((t) => ({
        ...t,
        decks: {
          ...t.decks,
          [deckId]: {
            ...t.decks[deckId],
            fx: { type: t.decks[deckId].fx?.type ?? "none", wet },
          },
        },
      }))
    },
    [deckId, patchTree],
  )

  const fx = deck.fx ?? { type: "none" as const, wet: 0.3 }

  return (
    <div
      className="flex flex-col items-center gap-2 rounded-lg border border-neutral-800 bg-black/40 p-2"
      style={{ borderColor: `color-mix(in srgb, ${accent} 30%, #404040)` }}
    >
      {/* Channel label */}
      <div
        className="text-[10px] font-bold tracking-widest"
        style={{ color: accent }}
      >
        CH {deckId}
      </div>

      {/* EQ stack (HI/MID/LO knobs) */}
      <div className="flex flex-col items-center gap-2">
        <Knob
          label="Hi"
          value={deck.eq.high}
          min={-1}
          max={1}
          step={0.01}
          defaultValue={0}
          onChange={(v) => setEq("high", v)}
          accentColor={accent}
          size={36}
          formatValue={(v) => (v === 0 ? "0" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(0)}`)}
        />
        <Knob
          label="Mid"
          value={deck.eq.mid}
          min={-1}
          max={1}
          step={0.01}
          defaultValue={0}
          onChange={(v) => setEq("mid", v)}
          accentColor={accent}
          size={36}
          formatValue={(v) => (v === 0 ? "0" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(0)}`)}
        />
        <Knob
          label="Lo"
          value={deck.eq.low}
          min={-1}
          max={1}
          step={0.01}
          defaultValue={0}
          onChange={(v) => setEq("low", v)}
          accentColor={accent}
          size={36}
          formatValue={(v) => (v === 0 ? "0" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(0)}`)}
        />
      </div>

      {/* Color/filter (HP/LP combined) */}
      <Knob
        label="Color"
        value={deck.filter.cutoff}
        min={-1}
        max={1}
        step={0.01}
        defaultValue={0}
        onChange={setFilterCutoff}
        accentColor="#f59e0b"
        size={36}
        formatValue={(v) =>
          v === 0 ? "OFF" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(0)}`
        }
      />

      {/* BAL — Stereo balance (L ↔ R) */}
      <Knob
        label="Bal"
        value={deck.pan ?? 0}
        min={-1}
        max={1}
        step={0.01}
        defaultValue={0}
        onChange={setPan}
        accentColor="#a3a3a3"
        size={30}
        formatValue={(v) =>
          v === 0
            ? "C"
            : v < 0
              ? `L${Math.abs(v * 100).toFixed(0)}`
              : `R${(v * 100).toFixed(0)}`
        }
      />

      {/* FX */}
      <div className="w-full">
        <select
          value={fx.type}
          onChange={(e) => setFxType(e.target.value as DjDeckFxType)}
          className={cn(
            "h-6 w-full rounded border bg-neutral-900 text-[9px] font-bold uppercase tracking-widest transition",
            fx.type !== "none"
              ? "border-emerald-500 text-emerald-400"
              : "border-neutral-800 text-neutral-500",
          )}
        >
          {FX_TYPES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={fx.wet}
          onChange={(e) => setFxWet(Number(e.target.value))}
          disabled={fx.type === "none"}
          className="mt-1 h-1 w-full cursor-pointer accent-emerald-500 disabled:opacity-30"
        />
      </div>

      {/* Channel fader + VU meter — yan yana (Pioneer DJM standard) */}
      <div className="flex items-stretch gap-1.5 self-center">
        <VerticalFader
          value={deck.gain}
          min={0}
          max={1}
          step={0.01}
          defaultValue={0.85}
          onChange={setVolume}
          capColor={accent}
          height={120}
          aria-label={`Deck ${deckId} channel fader`}
        />
        <VuMeter
          getDb={() => getDeckMeterDb(deckId)}
          segments={14}
          width={4}
          segmentGap={1}
          segmentHeight={6}
          title={`Deck ${deckId} level`}
        />
      </div>
    </div>
  )
}


