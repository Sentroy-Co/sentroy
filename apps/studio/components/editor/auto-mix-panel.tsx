"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDataTransferHorizontalIcon,
  PlayIcon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"
import {
  useDjStore,
  type DeckId,
  DECK_ACCENTS,
  getDeckIdsFromLayout,
} from "@/lib/dj-store"
import {
  cancelAutoMix,
  executeAutoMix,
  getAutoMixState,
} from "@/lib/dj-actions"

/**
 * Footer'a yerleşik kompakt auto-mix kontrolü. Pioneer DJM-V10
 * "Beat FX" + auto-mix paneli benzeri — yatay tek satır:
 *
 *   [⇄ Auto-mix]  From [A][B][C][D] → To [A][B][C][D]
 *                 Fade [───●──] 16s  [T] [B]  [▶ Start]
 *
 * Daha önce DJMMixer panelinde dikey olarak duruyordu; footer'a alındı
 * çünkü mixer paneli zaten dolu + kullanıcı geçişi her zaman görebilir
 * (deck dışında bir alan).
 */
export function AutoMixPanel() {
  const tree = useDjStore((s) => s.tree)
  const patchTree = useDjStore((s) => s.patchTree)
  const [autoMixTick, setAutoMixTick] = useState(0)
  const [autoMixFrom, setAutoMixFrom] = useState<DeckId>("A")
  const [autoMixTo, setAutoMixTo] = useState<DeckId>("B")

  // Progress tick (100ms) — getAutoMixState() pure, RAF benzeri refresh
  useEffect(() => {
    const id = setInterval(() => setAutoMixTick((n) => n + 1), 100)
    return () => clearInterval(id)
  }, [])
  void autoMixTick

  const autoMix = getAutoMixState()
  const cfg = tree.crossfader.autoMix

  const setCfg = useCallback(
    (patch: Partial<typeof cfg>) => {
      patchTree((t) => ({
        ...t,
        crossfader: {
          ...t.crossfader,
          autoMix: { ...t.crossfader.autoMix, ...patch },
        },
      }))
    },
    [patchTree, cfg],
  )

  const trigger = useCallback(async () => {
    if (autoMixFrom === autoMixTo) {
      toast.error("From and To deck must differ")
      return
    }
    if (!tree.decks[autoMixFrom].loadedMediaId) {
      toast.error(`Deck ${autoMixFrom} empty — load a track first`)
      return
    }
    if (!tree.decks[autoMixTo].loadedMediaId) {
      toast.error(`Deck ${autoMixTo} empty — load a track first`)
      return
    }
    await executeAutoMix({ fromDeck: autoMixFrom, toDeck: autoMixTo })
  }, [autoMixFrom, autoMixTo, tree.decks])

  const allIds = useMemo(() => getDeckIdsFromLayout(tree.layout), [tree.layout])
  const loadedDecks = useMemo(
    () => allIds.filter((d) => tree.decks[d]?.loadedMediaId !== null),
    [allIds, tree.decks],
  )

  return (
    <div className="flex h-9 items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3">
      {/* Section label */}
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
        <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} size={10} />
        Auto-mix
      </div>

      {/* From / To deck picker */}
      <DeckPickerInline
        value={autoMixFrom}
        onChange={setAutoMixFrom}
        loaded={loadedDecks}
        all={allIds}
        disabled={autoMix.active}
      />
      <span className="text-neutral-600">→</span>
      <DeckPickerInline
        value={autoMixTo}
        onChange={setAutoMixTo}
        loaded={loadedDecks}
        all={allIds}
        disabled={autoMix.active}
      />

      {/* Fade slider */}
      <div className="flex items-center gap-1.5">
        <input
          type="range"
          min={4}
          max={32}
          step={1}
          value={cfg.fadeSeconds}
          onChange={(e) =>
            setCfg({ fadeSeconds: Number(e.target.value) })
          }
          disabled={autoMix.active}
          className="h-1 w-24 cursor-pointer accent-emerald-500 disabled:opacity-40"
          title="Fade duration (seconds)"
        />
        <span className="w-7 font-mono text-[10px] text-neutral-400">
          {cfg.fadeSeconds}s
        </span>
      </div>

      {/* Tempo match + beat sync toggles */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setCfg({ tempoMatch: !cfg.tempoMatch })}
          disabled={autoMix.active}
          className={cn(
            "rounded px-1.5 py-0.5 text-[9px] font-bold transition disabled:opacity-40",
            cfg.tempoMatch
              ? "bg-emerald-600/40 text-emerald-200"
              : "border border-neutral-800 text-neutral-500",
          )}
          title="Tempo match — outgoing & incoming meet at mid BPM"
        >
          T
        </button>
        <button
          type="button"
          onClick={() => setCfg({ beatSync: !cfg.beatSync })}
          disabled={autoMix.active}
          className={cn(
            "rounded px-1.5 py-0.5 text-[9px] font-bold transition disabled:opacity-40",
            cfg.beatSync
              ? "bg-emerald-600/40 text-emerald-200"
              : "border border-neutral-800 text-neutral-500",
          )}
          title="Beat sync — align on downbeats (planned)"
        >
          B
        </button>
      </div>

      {/* Start / Cancel */}
      {autoMix.active ? (
        <button
          type="button"
          onClick={cancelAutoMix}
          className="flex h-7 items-center gap-1.5 rounded bg-red-600/80 px-3 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-red-600"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={12} />
          Cancel ({Math.round(autoMix.progress * 100)}%)
        </button>
      ) : (
        <button
          type="button"
          onClick={trigger}
          className="flex h-7 items-center gap-1.5 rounded bg-gradient-to-r from-pink-600 to-cyan-600 px-3 text-[10px] font-bold uppercase tracking-widest text-white hover:from-pink-500 hover:to-cyan-500"
        >
          <HugeiconsIcon icon={PlayIcon} size={12} />
          Start
        </button>
      )}
    </div>
  )
}

/**
 * Kompakt 4-deck pill picker — auto-mix from/to seçimi.
 * Yüklü olmayan deck'ler grileştirilir (tıklanabilir ama UI ipucu).
 */
function DeckPickerInline({
  value,
  onChange,
  loaded,
  all,
  disabled,
}: {
  value: DeckId
  onChange(next: DeckId): void
  loaded: DeckId[]
  all: DeckId[]
  disabled?: boolean
}) {
  return (
    <div className="flex overflow-hidden rounded border border-neutral-800">
      {all.map((id) => {
        const active = id === value
        const isLoaded = loaded.includes(id)
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            disabled={disabled}
            className={cn(
              "h-7 w-6 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-40",
              active
                ? "text-white"
                : isLoaded
                  ? "bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                  : "bg-neutral-950 text-neutral-700 hover:bg-neutral-900",
            )}
            style={active ? { backgroundColor: DECK_ACCENTS[id].hex } : undefined}
            title={isLoaded ? `Deck ${id} (loaded)` : `Deck ${id} (empty)`}
          >
            {id}
          </button>
        )
      })}
    </div>
  )
}
