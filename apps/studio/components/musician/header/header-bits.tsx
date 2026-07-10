"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Menu01Icon,
  ArrowLeft01Icon,
  FolderLibraryIcon,
  Download01Icon,
  Cancel01Icon,
  Settings01Icon,
  EyeIcon,
  Clock01Icon,
  ArrowReloadHorizontalIcon,
  CloudUploadIcon,
} from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

/**
 * Sentroy Studio — musician editor header bileşenleri.
 *
 * BandLab paterni: sol üstte hamburger menu (shadcn DropdownMenu + Sub) →
 * proje işlemleri / görüntü / ayarlar / çıkış. Title ortada inline-editable,
 * yanında "saved" durumu küçük circle ile. BPM digital LCD font + popover
 * (tap tempo + key/scale).
 *
 * UI feedback için tüm icon-only butonlar Tooltip ile sarmalı — `title`
 * prop'u browser-native tooltip değil, custom Tooltip kullan.
 */

// ─── EditableTitle ────────────────────────────────────────────────────────

export function EditableTitle({
  value,
  onChange,
}: {
  value: string
  onChange(next: string): void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setDraft(value)
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 0)
    }
  }, [editing, value])

  const commit = useCallback(() => {
    const next = draft.trim()
    if (next && next !== value && next.length <= 100) onChange(next)
    setEditing(false)
  }, [draft, value, onChange])

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            commit()
          } else if (e.key === "Escape") {
            e.preventDefault()
            setEditing(false)
          }
        }}
        maxLength={100}
        className="w-64 rounded border border-neutral-700 bg-neutral-950 px-2 py-0.5 text-center text-sm font-medium text-neutral-100 outline-none focus:border-primary"
      />
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded px-2 py-0.5 text-sm font-medium text-neutral-100 transition hover:bg-neutral-800/60"
          >
            {value}
          </button>
        }
      />
      <TooltipContent>Click to rename project</TooltipContent>
    </Tooltip>
  )
}

// ─── SavedDot ─────────────────────────────────────────────────────────────

export function SavedDot({
  status,
}: {
  status: "idle" | "dirty" | "saving" | "saved" | "error"
}) {
  const meta = {
    idle: { color: "bg-neutral-600", label: "Up to date" },
    dirty: { color: "bg-yellow-500", label: "Unsaved changes" },
    saving: {
      color: "bg-blue-400 animate-pulse",
      label: "Saving…",
    },
    saved: { color: "bg-emerald-500", label: "Saved" },
    error: { color: "bg-red-500", label: "Save error" },
  } as const
  const e = meta[status]
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "inline-block h-2 w-2 cursor-default rounded-full",
              e.color,
            )}
          />
        }
      />
      <TooltipContent>{e.label}</TooltipContent>
    </Tooltip>
  )
}

// ─── HamburgerMenu — BandLab-style left dropdown (shadcn DropdownMenu) ───

export interface HamburgerMenuActions {
  onSave(): void
  onExport(): void
  onLibraryToggle(): void
  onSnapToggle(): void
  onMarkersToggle(): void
  onMetronomeToggle(): void
  onAutoCrossfadeToggle(): void
  onAutomationModeToggle(): void
  dashboardHref: string
  libraryOpen: boolean
  snapEnabled: boolean
  metronomeEnabled: boolean
  autoCrossfade: boolean
  automationMode: boolean
  // Local-first cloud sync — kapalıyken kayıtlar yalnız bu cihazda (IndexedDB);
  // açılırken projede kullanılan lokal dosyalar cloud'a yüklenip referanslar
  // migrate edilir + tree sunucuya kaydedilir.
  cloudSync: boolean
  syncing: boolean
  onCloudSyncToggle(): void
  /** Projede kullanılan, henüz cloud'a yüklenmemiş lokal dosya sayısı. */
  localFileCount: number
  onUploadLocalFiles(): void
  // History — toolbar'dan buraya taşındı (undo/redo + rollback listesi).
  canUndo: boolean
  canRedo: boolean
  onUndo(): void
  onRedo(): void
  /** En eski→en yeni sırayla history entry'leri. */
  history: { label: string; ts: number }[]
  /** history[realIdx]'e rollback. */
  onRollback(realIdx: number): void
}

/** ts → "5s"/"3m"/"2h"/"1d" (hamburger history entry'leri için). */
function fmtAgoTs(ts: number): string {
  const diff = Math.max(0, Date.now() - ts)
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h`
  return `${Math.floor(diff / 86_400_000)}d`
}

export function HamburgerMenu({
  actions,
}: {
  actions: HamburgerMenuActions
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-300 transition hover:bg-neutral-800 hover:text-neutral-100"
                />
              }
            >
              <HugeiconsIcon icon={Menu01Icon} size={18} />
            </DropdownMenuTrigger>
          }
        />
        <TooltipContent>Menu</TooltipContent>
      </Tooltip>
      <DropdownMenuContent className="w-56" align="start" sideOffset={6}>
        {/* Project sub-menu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <HugeiconsIcon icon={FolderLibraryIcon} size={12} />
            Project
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => actions.onSave()}>
              Save now
              <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
            </DropdownMenuItem>
            {/* Local-first: default kayıt bu cihazda; cloud sync açılınca
                lokal dosyalar yüklenir + tree sunucuya da yazılır. */}
            <DropdownMenuItem
              disabled={actions.syncing}
              onClick={() => actions.onCloudSyncToggle()}
            >
              <HugeiconsIcon icon={CloudUploadIcon} size={11} />
              {actions.syncing
                ? "Syncing to cloud…"
                : actions.cloudSync
                  ? "Cloud sync: on"
                  : "Cloud sync: off"}
              {actions.cloudSync && !actions.syncing && (
                <span className="ml-auto text-emerald-400">✓</span>
              )}
            </DropdownMenuItem>
            {actions.localFileCount > 0 && (
              <DropdownMenuItem
                disabled={actions.syncing}
                onClick={() => actions.onUploadLocalFiles()}
              >
                <HugeiconsIcon icon={CloudUploadIcon} size={11} />
                Upload local files ({actions.localFileCount})
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => actions.onExport()}>
              <HugeiconsIcon icon={Download01Icon} size={11} />
              Export audio…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={
                <Link href={actions.dashboardHref}>
                  <HugeiconsIcon icon={ArrowLeft01Icon} size={11} />
                  Back to dashboard
                </Link>
              }
            />
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* View sub-menu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <HugeiconsIcon icon={EyeIcon} size={12} />
            View
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => actions.onLibraryToggle()}>
              <HugeiconsIcon icon={FolderLibraryIcon} size={11} />
              {actions.libraryOpen ? "Hide Library" : "Show Library"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onAutomationModeToggle()}>
              {actions.automationMode
                ? "Hide automation lanes"
                : "Show automation lanes"}
              {actions.automationMode && (
                <span className="ml-auto text-emerald-400">✓</span>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onSnapToggle()}>
              {actions.snapEnabled ? "Snap: on" : "Snap: off"}
              {actions.snapEnabled && (
                <span className="ml-auto text-emerald-400">✓</span>
              )}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Tools sub-menu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <HugeiconsIcon icon={Settings01Icon} size={12} />
            Tools
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => actions.onMetronomeToggle()}>
              {actions.metronomeEnabled ? "Metronome: on" : "Metronome: off"}
              <DropdownMenuShortcut>K</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onAutoCrossfadeToggle()}>
              {actions.autoCrossfade
                ? "Auto crossfade: on"
                : "Auto crossfade: off"}
              {actions.autoCrossfade && (
                <span className="ml-auto text-emerald-400">✓</span>
              )}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* History sub-menu — toolbar'dan taşındı (undo/redo + rollback). */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <HugeiconsIcon icon={Clock01Icon} size={12} />
            History
            {actions.history.length > 0 && (
              <span className="ml-auto font-mono text-[9px] text-neutral-500">
                {Math.min(99, actions.history.length)}
              </span>
            )}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 w-64 overflow-y-auto">
            <DropdownMenuItem
              disabled={!actions.canUndo}
              onClick={() => actions.onUndo()}
            >
              <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={11} />
              Undo
              <DropdownMenuShortcut>⌘Z</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!actions.canRedo}
              onClick={() => actions.onRedo()}
            >
              <HugeiconsIcon
                icon={ArrowReloadHorizontalIcon}
                size={11}
                className="scale-x-[-1]"
              />
              Redo
              <DropdownMenuShortcut>⌘⇧Z</DropdownMenuShortcut>
            </DropdownMenuItem>
            {actions.history.length > 0 && (
              <>
                <DropdownMenuSeparator />
                {/* Plain div — DropdownMenuLabel (Menu.Group.Label) parent
                    DropdownMenuGroup gerektirir; submenu'de yok → crash. */}
                <div className="px-2 py-1.5 text-[9px] tracking-widest text-neutral-500 uppercase">
                  Recent edits
                </div>
                {[...actions.history]
                  .slice(-12)
                  .reverse()
                  .map((entry, displayIdx) => {
                    const realIdx = actions.history.length - 1 - displayIdx
                    return (
                      <DropdownMenuItem
                        key={`${entry.ts}-${displayIdx}`}
                        onClick={() => actions.onRollback(realIdx)}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {entry.label}
                        </span>
                        <span className="ml-auto shrink-0 font-mono text-[9px] text-neutral-500">
                          {fmtAgoTs(entry.ts)}
                        </span>
                      </DropdownMenuItem>
                    )
                  })}
              </>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            render={
              <Link href={actions.dashboardHref}>
                <HugeiconsIcon icon={ArrowLeft01Icon} size={11} />
                Back to dashboard
              </Link>
            }
          />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── BpmKeyPopover — digital LCD + tap tempo + key/scale picker ──────────

const MUSICAL_KEYS = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const

export function BpmKeyDisplay({
  bpm,
  musicalKey,
  musicalScale,
  onBpmChange,
  onKeyChange,
  onScaleChange,
}: {
  bpm: number
  musicalKey: string | undefined
  musicalScale: "major" | "minor" | undefined
  onBpmChange(next: number): void
  onKeyChange(next: string | undefined): void
  onScaleChange(next: "major" | "minor"): void
}) {
  const [open, setOpen] = useState(false)
  const [draftBpm, setDraftBpm] = useState(bpm.toString())
  const tapTimesRef = useRef<number[]>([])

  useEffect(() => {
    if (open) setDraftBpm(String(bpm))
  }, [open, bpm])

  const commitBpm = useCallback(() => {
    const v = Number(draftBpm)
    if (Number.isFinite(v) && v >= 20 && v <= 300 && v !== bpm) {
      onBpmChange(Math.round(v))
    } else {
      setDraftBpm(String(bpm))
    }
  }, [draftBpm, bpm, onBpmChange])

  const handleTap = useCallback(() => {
    const now = performance.now()
    const taps = tapTimesRef.current
    // 3 saniyeden eski tap'leri at
    while (taps.length > 0 && now - taps[0]! > 3000) {
      taps.shift()
    }
    taps.push(now)
    if (taps.length >= 2) {
      // İki ardışık tap arası ms → BPM (60_000 / avg)
      const intervals: number[] = []
      for (let i = 1; i < taps.length; i++) {
        intervals.push(taps[i]! - taps[i - 1]!)
      }
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
      const tapBpm = Math.round(60_000 / avg)
      if (tapBpm >= 20 && tapBpm <= 300) {
        setDraftBpm(String(tapBpm))
        onBpmChange(tapBpm)
      }
    }
  }, [onBpmChange])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="flex h-8 items-center gap-1 rounded-md border border-neutral-800 bg-neutral-950 px-2 transition hover:border-primary/60"
                />
              }
            >
              <span
                className="tabular-nums text-base font-semibold tracking-wider text-emerald-400"
                style={{
                  fontFamily:
                    "var(--font-display), 'Orbitron', monospace",
                  textShadow:
                    "0 0 6px rgba(52, 211, 153, 0.55), 0 0 14px rgba(52, 211, 153, 0.25)",
                }}
              >
                {bpm}
              </span>
              <span className="text-[8px] font-bold uppercase text-neutral-500">
                BPM
              </span>
              {musicalKey && (
                <>
                  <span className="mx-1 h-3 w-px bg-neutral-800" />
                  <span className="text-[10px] font-semibold text-neutral-200">
                    {musicalKey} {musicalScale === "minor" ? "m" : ""}
                  </span>
                </>
              )}
            </PopoverTrigger>
          }
        />
        <TooltipContent>BPM / key / time signature</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
            Tempo
          </span>
          <span className="text-[9px] text-neutral-500">range 20–300</span>
        </div>
        <div className="flex items-stretch gap-2">
          <input
            type="number"
            min={20}
            max={300}
            value={draftBpm}
            onChange={(e) => setDraftBpm(e.target.value)}
            onBlur={commitBpm}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                commitBpm()
              }
            }}
            className="w-24 rounded border border-neutral-800 bg-neutral-950 px-2 text-center text-2xl font-semibold text-emerald-400 tabular-nums outline-none focus:border-primary"
            style={{
              fontFamily: "var(--font-display), 'Orbitron', monospace",
              textShadow:
                "0 0 6px rgba(52, 211, 153, 0.55), 0 0 14px rgba(52, 211, 153, 0.25)",
            }}
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={handleTap}
                  className="flex-1 rounded border border-neutral-700 bg-neutral-900 text-xs font-bold uppercase tracking-widest text-neutral-200 transition hover:bg-neutral-800 active:bg-neutral-700"
                >
                  Tap
                </button>
              }
            />
            <TooltipContent>Tap rhythm — averages last 8 taps</TooltipContent>
          </Tooltip>
        </div>
        <div className="mt-1 text-[9px] text-neutral-600">
          Tap 2+ times within 3 seconds — average BPM auto-set.
        </div>

        <div className="mt-4 mb-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
          Key
        </div>
        <div className="grid grid-cols-6 gap-1">
          {MUSICAL_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onKeyChange(k)}
              className={cn(
                "rounded border px-1 py-1 text-[10px] font-semibold transition",
                musicalKey === k
                  ? "border-primary/60 bg-primary/20 text-primary"
                  : "border-neutral-800 text-neutral-400 hover:bg-neutral-800",
              )}
            >
              {k}
            </button>
          ))}
        </div>
        {musicalKey && (
          <button
            type="button"
            onClick={() => onKeyChange(undefined)}
            className="mt-1.5 text-[9px] text-neutral-500 hover:text-neutral-300"
          >
            Clear key
          </button>
        )}

        <div className="mt-3 mb-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
          Scale
        </div>
        <div className="grid grid-cols-2 gap-1">
          {(["major", "minor"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onScaleChange(s)}
              className={cn(
                "rounded border px-2 py-1 text-[10px] font-semibold capitalize transition",
                musicalScale === s
                  ? "border-primary/60 bg-primary/20 text-primary"
                  : "border-neutral-800 text-neutral-400 hover:bg-neutral-800",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─── HistoryIconButton — icon-only entry; opens existing HistoryPanel ────

export function HistoryIconButton({
  count,
  onClick,
}: {
  count: number
  onClick(): void
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onClick}
            className="flex h-8 w-8 items-center justify-center rounded text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-200"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={12} />
            <span className="sr-only">History</span>
          </button>
        }
      />
      <TooltipContent>History ({count})</TooltipContent>
    </Tooltip>
  )
}

