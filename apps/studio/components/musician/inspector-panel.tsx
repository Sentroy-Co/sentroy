"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Cancel01Icon,
  EqualSignIcon,
  ScissorIcon,
} from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"
import type {
  MusicianClip,
  MusicianEffect,
  MusicianTrack,
} from "@workspace/db/models/studio-project-data"
import { FxChainContent } from "./inspector-tabs/fx-chain-content"
import { ClipTrimContent } from "./inspector-tabs/clip-trim-content"
import { SpectrumContent } from "./inspector-tabs/spectrum-content"

/**
 * Sentroy Studio — alttan açılan in-flow "Inspector" panel. Library
 * sidebar'ın yatay versiyonu: editör akışının içinde, modal değil.
 *
 * Multi-tab — birden çok efekt/trim editörü aynı anda açık kalabilir,
 * kullanıcı tıkla → değiştir, × ile kapat. Tab order korunur.
 *
 * Tab tipleri:
 *   - { type: "fx", trackId } — track FX chain editor
 *   - { type: "trim", trackId, clipId } — clip trim editor
 *
 * Future: { type: "automation" }, { type: "meter" }, { type: "spectrum" }
 *
 * State sahibi MusicianEditor; bu component sadece görüntü + tab kontrol
 * (open/close/select). İçerik per-tab `*-content.tsx` dosyalarında.
 */

export type InspectorTab =
  | { type: "fx"; trackId: string }
  | { type: "trim"; trackId: string; clipId: string }
  | { type: "spectrum" }

export function tabKey(tab: InspectorTab): string {
  if (tab.type === "fx") return `fx-${tab.trackId}`
  if (tab.type === "trim") return `trim-${tab.trackId}-${tab.clipId}`
  return `spectrum`
}

const PANEL_HEIGHT_MIN = 180
const PANEL_HEIGHT_DEFAULT = 320
const PANEL_HEIGHT_MAX_RATIO = 0.7
const STORAGE_KEY = "studio-inspector-height"

export function InspectorPanel({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  // FX content props
  tracks,
  companySlug,
  onMutateTrackEffects,
  // Trim content props
  trimClipPeaks,
  trimClipSourceDuration,
  onMutateClip,
  onRequestSourceDecode,
}: {
  tabs: InspectorTab[]
  activeTabId: string | null
  onSelectTab(id: string): void
  onCloseTab(id: string): void
  // FX
  tracks: MusicianTrack[]
  companySlug: string
  onMutateTrackEffects(trackId: string, next: MusicianEffect[]): void
  // Trim — caller mediaId-bazlı cache'den peak + duration sağlar
  trimClipPeaks(mediaId: string): Float32Array | null
  trimClipSourceDuration(mediaId: string): number
  onMutateClip(
    trackId: string,
    clipId: string,
    patch: Partial<MusicianClip>,
  ): void
  onRequestSourceDecode(mediaId: string): void
}) {
  const [height, setHeight] = useState<number>(() => {
    if (typeof window === "undefined") return PANEL_HEIGHT_DEFAULT
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const n = raw ? parseInt(raw, 10) : NaN
    return Number.isFinite(n) && n > 0 ? n : PANEL_HEIGHT_DEFAULT
  })

  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(
    null,
  )

  const handleResizeDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {}
      resizeRef.current = { startY: e.clientY, startHeight: height }
    },
    [height],
  )

  const handleResizeMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = resizeRef.current
      if (!drag) return
      // Üst kenardan yukarı drag = panel genişler
      const next = drag.startHeight - (e.clientY - drag.startY)
      const max = Math.floor(window.innerHeight * PANEL_HEIGHT_MAX_RATIO)
      const clamped = Math.max(PANEL_HEIGHT_MIN, Math.min(max, next))
      setHeight(clamped)
    },
    [],
  )

  const handleResizeUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {}
      if (resizeRef.current) {
        try {
          window.localStorage.setItem(STORAGE_KEY, String(height))
        } catch {}
      }
      resizeRef.current = null
    },
    [height],
  )

  const activeTab = useMemo(
    () => tabs.find((t) => tabKey(t) === activeTabId) ?? null,
    [tabs, activeTabId],
  )

  // Panel kapalı (hiç tab yok) → hiç render etme (alan boş kalır)
  const open = tabs.length > 0
  useEffect(() => {
    // No-op — animasyon CSS ile
  }, [open])

  if (!open) return null

  return (
    <aside
      className="flex shrink-0 flex-col overflow-hidden border-t border-neutral-800 bg-neutral-950"
      style={{ height }}
    >
      {/* Üst kenar — resize handle */}
      <div
        onPointerDown={handleResizeDown}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeUp}
        onPointerCancel={handleResizeUp}
        className="group/resize relative h-1 shrink-0 cursor-row-resize bg-neutral-800 transition hover:bg-primary/50"
        title="Drag to resize"
      >
        <div className="absolute inset-x-0 -top-1.5 -bottom-1.5" />
      </div>

      {/* Tab bar */}
      <div className="flex h-9 shrink-0 items-center gap-px overflow-x-auto border-b border-neutral-800 bg-neutral-900/40 px-1">
        {tabs.map((tab) => {
          const id = tabKey(tab)
          const isActive = id === activeTabId
          return (
            <TabChip
              key={id}
              tab={tab}
              tracks={tracks}
              isActive={isActive}
              onSelect={() => onSelectTab(id)}
              onClose={() => onCloseTab(id)}
            />
          )
        })}
      </div>

      {/* Active tab content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab?.type === "fx" && (
          <FxChainContent
            track={tracks.find((t) => t.id === activeTab.trackId) ?? null}
            availableTracks={tracks}
            companySlug={companySlug}
            onMutateEffects={(next) =>
              onMutateTrackEffects(activeTab.trackId, next)
            }
          />
        )}
        {activeTab?.type === "trim" && (
          <ClipTrimTabContentWrapper
            tab={activeTab}
            tracks={tracks}
            getPeaks={trimClipPeaks}
            getSourceDuration={trimClipSourceDuration}
            onRequestSourceDecode={onRequestSourceDecode}
            onMutateClip={onMutateClip}
          />
        )}
        {activeTab?.type === "spectrum" && <SpectrumContent />}
      </div>
    </aside>
  )
}

// ─── TabChip — tab bar chip with type icon + label ───────────────────────

function TabChip({
  tab,
  tracks,
  isActive,
  onSelect,
  onClose,
}: {
  tab: InspectorTab
  tracks: MusicianTrack[]
  isActive: boolean
  onSelect(): void
  onClose(): void
}) {
  let label = ""
  let icon = EqualSignIcon
  let color = "#a855f7"
  if (tab.type === "fx") {
    const track = tracks.find((t) => t.id === tab.trackId)
    color = track?.color ?? color
    label = track ? `FX: ${track.name}` : "FX: (gone)"
    icon = EqualSignIcon
  } else if (tab.type === "trim") {
    const track = tracks.find((t) => t.id === tab.trackId)
    color = track?.color ?? color
    const clip = track?.clips.find((c) => c.id === tab.clipId)
    label = `Trim: ${clip?.label ?? "(clip)"}`
    icon = ScissorIcon
  } else {
    // spectrum
    label = "Spectrum"
    icon = EqualSignIcon
    color = "#06b6d4"
  }
  return (
    <div
      onClick={onSelect}
      className={cn(
        "group/tab flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-t border border-b-0 px-2 text-[10px] transition",
        isActive
          ? "border-neutral-700 bg-neutral-950 text-neutral-100"
          : "border-transparent bg-neutral-900/40 text-neutral-400 hover:text-neutral-200",
      )}
      style={{
        borderTopColor: isActive ? color : undefined,
        borderTopWidth: isActive ? 2 : 1,
      }}
    >
      <HugeiconsIcon icon={icon} size={10} style={{ color }} />
      <span className="max-w-[160px] truncate font-medium">{label}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="flex h-3.5 w-3.5 items-center justify-center rounded text-neutral-500 transition hover:bg-neutral-800 hover:text-red-400"
        title="Close tab"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={8} />
      </button>
    </div>
  )
}

// ─── Trim wrapper — peaks/source duration lookup + lazy decode trigger ───

function ClipTrimTabContentWrapper({
  tab,
  tracks,
  getPeaks,
  getSourceDuration,
  onRequestSourceDecode,
  onMutateClip,
}: {
  tab: Extract<InspectorTab, { type: "trim" }>
  tracks: MusicianTrack[]
  getPeaks(mediaId: string): Float32Array | null
  getSourceDuration(mediaId: string): number
  onRequestSourceDecode(mediaId: string): void
  onMutateClip(
    trackId: string,
    clipId: string,
    patch: Partial<MusicianClip>,
  ): void
}) {
  const track = tracks.find((t) => t.id === tab.trackId)
  const clip = track?.clips.find((c) => c.id === tab.clipId) ?? null
  const peaks = clip ? getPeaks(clip.mediaId) : null
  const sourceDuration = clip ? getSourceDuration(clip.mediaId) : 0

  // Tab açılıp source henüz decode edilmediyse tetikle
  useEffect(() => {
    if (clip && sourceDuration === 0) {
      onRequestSourceDecode(clip.mediaId)
    }
  }, [clip, sourceDuration, onRequestSourceDecode])

  return (
    <ClipTrimContent
      clip={clip}
      peaks={peaks}
      sourceDuration={sourceDuration}
      onCommit={(patch) => {
        if (clip) onMutateClip(tab.trackId, tab.clipId, patch)
      }}
    />
  )
}
