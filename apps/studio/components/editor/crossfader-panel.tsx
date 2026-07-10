"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import { cn } from "@workspace/ui/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  useDjStore,
  DECK_ACCENTS,
  getDeckIdsFromLayout,
  type DeckId,
} from "@/lib/dj-store"
import {
  setMixerCrossfader,
  type CrossfaderCurve,
} from "@/lib/audio-engine"
import { getAutoMixState } from "@/lib/dj-actions"

/**
 * Footer'a yerleşik kompakt crossfader paneli. Daha önce DJMMixer
 * altında dikey bir blok olarak duruyordu; yatay tek satıra alındı:
 *
 *   [A] [────────●────────] [B]   CTR  [Lin][Smooth][Cut]
 *
 * Auto-mix çalışırken disabled. Crossfader engine'in setCrossfader
 * ile direkt sync; A↔B davranışı (C+,D+ ise "Thru").
 */

const CURVES: { value: CrossfaderCurve; label: string }[] = [
  { value: "linear", label: "Lin" },
  { value: "smooth", label: "Smooth" },
  { value: "sharp", label: "Cut" },
]

/**
 * Belirli bir mixer'a bağlı crossfader panel. Çağıran mixerId verir;
 * panel sadece o mixer'ın state'ini okur + günceller. Eski tek-mixer
 * default'u için `<CrossfaderPanel />` kullanan caller'lar
 * `<CrossfaderPanel mixerId="mixer-default" />` ile değişti.
 */
export function CrossfaderPanel({ mixerId }: { mixerId: string }) {
  const mixer = useDjStore(
    useShallow((s) => {
      const m = s.tree.mixers.find((m) => m.id === mixerId)
      if (!m) return null
      return {
        position: m.crossfader.position,
        curve: m.crossfader.curve,
        aDeck: m.crossfader.aDeck,
        bDeck: m.crossfader.bDeck,
      }
    }),
  )
  const patchMixerCrossfader = useDjStore((s) => s.patchMixerCrossfader)
  const autoMix = getAutoMixState()

  // Tree → engine sync (position, curve, aDeck/bDeck assign) — per mixer.
  // Deps primitive — useShallow obj ref edge case'i için (object dep her
  // render'da yeni reference olursa loop tetikler; primitive değerler eq
  // value-based, güvenli).
  useEffect(() => {
    if (!mixer) return
    setMixerCrossfader(mixerId, {
      position: mixer.position,
      curve: mixer.curve,
      aDeck: mixer.aDeck,
      bDeck: mixer.bDeck,
    })
  }, [mixerId, mixer?.position, mixer?.curve, mixer?.aDeck, mixer?.bDeck])

  const setPosition = useCallback(
    (val: number) => patchMixerCrossfader(mixerId, { position: val }),
    [mixerId, patchMixerCrossfader],
  )
  const setCurveValue = useCallback(
    (next: CrossfaderCurve) =>
      patchMixerCrossfader(mixerId, { curve: next }),
    [mixerId, patchMixerCrossfader],
  )
  const setSideAssign = useCallback(
    (side: "aDeck" | "bDeck", deckId: DeckId) =>
      patchMixerCrossfader(mixerId, { [side]: deckId }),
    [mixerId, patchMixerCrossfader],
  )

  const layout = useDjStore(useShallow((s) => s.tree.layout))
  const allDeckIds = useMemo(() => getDeckIdsFromLayout(layout), [layout])

  if (!mixer) {
    // Mixer henüz hydrate olmadıysa (remove edildi vs.) panel gizlenir.
    return null
  }
  const { position, curve, aDeck, bDeck } = mixer
  const aPalette = DECK_ACCENTS[aDeck]
  const bPalette = DECK_ACCENTS[bDeck]

  const disabled = autoMix.active

  return (
    <div className="flex h-9 items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3">
      {/* A side assign picker */}
      <SideAssignChip
        side="aDeck"
        value={aDeck}
        allDeckIds={allDeckIds}
        position={position}
        activeWhenPositive={false}
        accent={aPalette.hex}
        onPick={(d) => setSideAssign("aDeck", d)}
        disabled={disabled}
      />

      {/* Slider */}
      <input
        type="range"
        min={-100}
        max={100}
        step={1}
        value={Math.round(position * 100)}
        onChange={(e) => setPosition(Number(e.target.value) / 100)}
        disabled={disabled}
        aria-label="Crossfader"
        title={`Crossfader (${aDeck} ↔ ${bDeck})`}
        className={cn(
          "h-2 w-40 cursor-pointer appearance-none rounded-full bg-neutral-950 outline-none ring-1 ring-black/40",
          "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:rounded-md [&::-webkit-slider-thumb]:bg-gradient-to-b [&::-webkit-slider-thumb]:from-neutral-300 [&::-webkit-slider-thumb]:to-neutral-500 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-grab",
          "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:rounded-md [&::-moz-range-thumb]:bg-neutral-400 [&::-moz-range-thumb]:border-0",
          disabled && "cursor-not-allowed opacity-40",
        )}
      />

      {/* B side assign picker */}
      <SideAssignChip
        side="bDeck"
        value={bDeck}
        allDeckIds={allDeckIds}
        position={position}
        activeWhenPositive={true}
        accent={bPalette.hex}
        onPick={(d) => setSideAssign("bDeck", d)}
        disabled={disabled}
      />

      {/* Center button + curve switch */}
      <button
        type="button"
        onClick={() => setPosition(0)}
        disabled={disabled}
        className="rounded border border-neutral-800 px-1.5 py-0.5 text-[9px] font-bold text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-40"
        title="Center crossfader"
      >
        CTR
      </button>
      <div className="flex overflow-hidden rounded border border-neutral-800">
        {CURVES.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setCurveValue(c.value)}
            className={cn(
              "px-2 py-0.5 text-[9px] font-bold transition",
              curve === c.value
                ? "bg-neutral-700 text-neutral-100"
                : "text-neutral-500 hover:bg-neutral-800",
            )}
            title={`Crossfader curve — ${c.label}`}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Crossfader slider'ının A/B kenarındaki kompakt deck-assign picker.
 * Tıklayınca popover'da tüm deck'ler listelenir; seçim crossfader state'ine
 * yazılır + audio engine'e push edilir.
 */
function SideAssignChip({
  side,
  value,
  allDeckIds,
  position,
  activeWhenPositive,
  accent,
  onPick,
  disabled,
}: {
  side: "aDeck" | "bDeck"
  value: DeckId
  allDeckIds: DeckId[]
  position: number
  activeWhenPositive: boolean
  accent: string
  onPick(deckId: DeckId): void
  disabled?: boolean
}) {
  const active = activeWhenPositive ? position > 0.05 : position < -0.05
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "flex h-7 min-w-[24px] items-center justify-center rounded font-mono text-[10px] font-bold uppercase tracking-widest transition disabled:cursor-not-allowed disabled:opacity-40",
              active ? "text-white" : "border border-neutral-800 text-neutral-500 hover:text-neutral-200",
            )}
            style={active ? { backgroundColor: accent } : undefined}
            title={`${side === "aDeck" ? "A" : "B"} side: Deck ${value} (click to reassign)`}
          />
        }
      >
        {value}
      </PopoverTrigger>
      <PopoverContent className="w-32 p-1.5" align={side === "aDeck" ? "start" : "end"}>
        <div className="mb-1 text-[9px] uppercase tracking-widest text-neutral-500">
          {side === "aDeck" ? "A side" : "B side"}
        </div>
        <div className="grid grid-cols-4 gap-1">
          {allDeckIds.map((id) => {
            const isActive = id === value
            return (
              <button
                key={id}
                type="button"
                onClick={() => onPick(id)}
                className={cn(
                  "h-7 rounded text-[10px] font-bold transition",
                  isActive
                    ? "text-white"
                    : "border border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-neutral-800",
                )}
                style={isActive ? { backgroundColor: DECK_ACCENTS[id].hex } : undefined}
              >
                {id}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
