"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { DiscIcon } from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"
import { useShallow } from "zustand/react/shallow"
import {
  useDjStore,
  type DeckId,
  DECK_ACCENTS,
  getDeckIdsFromLayout,
} from "@/lib/dj-store"

/**
 * Now-playing strip — header'ın altına yapışık 4 sütun (Deck A | B | C | D).
 * Her sütun: deck rengi nokta + track label + zaman + mini progress bar.
 * Boş slot ise "— empty —" gösterilir.
 */
export function NowPlayingStrip() {
  const ids = useDjStore(useShallow((s) => getDeckIdsFromLayout(s.tree.layout)))
  return (
    <div className="flex shrink-0 items-stretch overflow-x-auto border-b border-neutral-800 bg-neutral-900/60 text-xs">
      {ids.map((id, i) => (
        <div key={id} className="flex min-w-[260px] flex-1 items-stretch">
          <DeckRow deckId={id} />
          {i < ids.length - 1 && <div className="w-px bg-neutral-800" />}
        </div>
      ))}
    </div>
  )
}

function DeckRow({ deckId }: { deckId: DeckId }) {
  const deck = useDjStore((s) => s.tree.decks[deckId])
  const runtime = useDjStore((s) => s.transport[deckId])

  const palette = DECK_ACCENTS[deckId]
  const accent = palette.text
  const accentBg = palette.bg
  // Tailwind dynamic gradient yok; inline style ile per-deck linear gradient.

  const playPct =
    runtime.duration > 0 ? (runtime.position / runtime.duration) * 100 : 0
  const effectiveBpm = deck.bpm ? deck.bpm * (1 + deck.pitch) : null

  return (
    <div className="relative flex flex-1 items-center gap-3 px-4 py-2">
      <div className="flex shrink-0 items-center gap-1.5">
        <span
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-bold text-white",
            accentBg,
          )}
        >
          {deckId}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <HugeiconsIcon
            icon={DiscIcon}
            size={12}
            className={cn(
              "shrink-0 transition",
              runtime.isPlaying ? accent : "text-neutral-600",
              runtime.isPlaying && "animate-spin",
            )}
            style={runtime.isPlaying ? { animationDuration: "3s" } : undefined}
          />
          <span
            className={cn(
              "truncate text-sm font-medium",
              deck.loadedMediaId ? "text-neutral-100" : "text-neutral-600",
            )}
          >
            {deck.loadedLabel ?? "— empty —"}
          </span>
        </div>
        {/* Mini progress bar */}
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-neutral-800">
          {deck.loadedMediaId && (
            <div
              className="h-full transition-[width] duration-100"
              style={{
                width: `${playPct}%`,
                background: `linear-gradient(to right, ${palette.hex}, ${palette.wave})`,
              }}
            />
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 font-mono text-[11px] tabular-nums">
        <span className="text-neutral-400">
          {fmtTime(runtime.position)} / {fmtTime(runtime.duration)}
        </span>
        {effectiveBpm && (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium",
              accentBg,
              "text-white",
            )}
          >
            {effectiveBpm.toFixed(1)}
          </span>
        )}
      </div>
    </div>
  )
}

function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00"
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, "0")}`
}
