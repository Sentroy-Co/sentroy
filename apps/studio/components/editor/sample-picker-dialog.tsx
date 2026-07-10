"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  AudioWaveIcon,
  Upload04Icon,
  PulseIcon,
  CheckmarkSquareIcon,
  SquareIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"
import { useDjStore, type DeckId, DECK_ACCENTS } from "@/lib/dj-store"

/**
 * Studio audio picker — custom UI (SDK MediaManager yerine).
 *
 * Sebep: SDK MediaManager `fileName` (slug) gösteriyor, biz `originalName`
 * istiyoruz. Üstelik bizim listeleme endpoint'imiz BPM cache + duration
 * dahil eden zengin veri döner, MediaManager'ın generic shape'inden çok
 * daha relevant.
 *
 * Özellikler:
 *   - Drag-drop + click-to-upload (üstte zone, progress)
 *   - Search (originalName contains)
 *   - Mode toggle: Load now (single) | Add to queue (multi-select)
 *   - Her satır: originalName · BPM · duration · size
 *   - Confirm butonu queue mode'da; load mode'da tıklayınca anında load
 */

interface StudioAsset {
  mediaId: string
  fileName: string
  originalName: string
  mimeType: string
  size: number
  folder: string
  createdAt: string
  bpm: number | null
  key: string | null
  duration: number | null
}

export function SamplePickerDialog({
  open,
  onOpenChange,
  deck,
  defaultMode = "load",
  companySlug,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  deck: DeckId | null
  defaultMode?: "load" | "queue"
  companySlug: string
}) {
  const loadDeck = useDjStore((s) => s.loadDeck)
  const enqueueToDeck = useDjStore((s) => s.enqueueToDeck)

  const [assets, setAssets] = useState<StudioAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [mode, setMode] = useState<"load" | "queue">(defaultMode)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Open olunca mode'u defaultMode'a reset + selection clear
  useEffect(() => {
    if (open) {
      setMode(defaultMode)
      setSelectedIds(new Set())
      setSearch("")
    }
  }, [open, defaultMode])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/companies/${companySlug}/studio/assets?folder=samples`,
        { credentials: "include" },
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setAssets(json.data ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load samples")
    } finally {
      setLoading(false)
    }
  }, [companySlug])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) =>
        f.type.startsWith("audio/"),
      )
      if (list.length === 0) {
        toast.error("Only audio files accepted")
        return
      }
      setUploading(true)
      setUploadProgress(0)
      try {
        for (let i = 0; i < list.length; i++) {
          const f = list[i]!
          const form = new FormData()
          form.append("file", f)
          form.append("folder", "samples")
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            xhr.open(
              "POST",
              `/api/companies/${companySlug}/studio/assets`,
              true,
            )
            xhr.withCredentials = true
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                const filePct = e.loaded / e.total
                setUploadProgress(((i + filePct) / list.length) * 100)
              }
            }
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) resolve()
              else reject(new Error(xhr.responseText || `HTTP ${xhr.status}`))
            }
            xhr.onerror = () => reject(new Error("Network error"))
            xhr.send(form)
          })
        }
        toast.success(`${list.length} sample${list.length === 1 ? "" : "s"} uploaded`)
        await refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed")
      } finally {
        setUploading(false)
        setUploadProgress(0)
      }
    },
    [companySlug, refresh],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      if (e.dataTransfer.files.length > 0) {
        void uploadFiles(e.dataTransfer.files)
      }
    },
    [uploadFiles],
  )

  const filtered = assets.filter((a) =>
    search.trim() === ""
      ? true
      : a.originalName.toLowerCase().includes(search.toLowerCase().trim()),
  )

  const toggleSelected = (id: string) => {
    setSelectedIds((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const loadSingle = (a: StudioAsset) => {
    if (!deck) return
    loadDeck(deck, {
      mediaId: a.mediaId,
      label: a.originalName,
      bpm: a.bpm,
    })
    toast.success(`Loaded to Deck ${deck}`)
    onOpenChange(false)
  }

  const queueSelected = () => {
    if (!deck) return
    const items = assets.filter((a) => selectedIds.has(a.mediaId))
    if (items.length === 0) return
    for (const a of items) {
      enqueueToDeck(deck, {
        mediaId: a.mediaId,
        label: a.originalName,
        bpm: a.bpm,
        key: a.key,
      })
    }
    toast.success(`Queued ${items.length} track${items.length === 1 ? "" : "s"} to Deck ${deck}`)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "load" ? "Load sample" : "Add to queue"}{" "}
            {deck && (
              <span style={{ color: DECK_ACCENTS[deck].hex }}>
                → Deck {deck}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {mode === "load"
              ? "Pick a sample (click → load) or drop a new file."
              : "Select multiple tracks, then Confirm → adds to queue."}
          </DialogDescription>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 rounded-md border border-neutral-800 bg-neutral-900/60 p-0.5 text-xs">
            {(["load", "queue"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m)
                  if (m !== "queue") setSelectedIds(new Set())
                }}
                className={cn(
                  "rounded px-2.5 py-1 transition",
                  mode === m
                    ? "bg-neutral-700 text-neutral-100"
                    : "text-neutral-500 hover:text-neutral-300",
                )}
              >
                {m === "load" ? "Load now" : "Add to queue"}
              </button>
            ))}
          </div>
          <div className="relative w-48">
            <HugeiconsIcon
              icon={Search01Icon}
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500"
            />
            <Input
              type="search"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 pl-7 text-xs"
            />
          </div>
        </div>

        {/* Upload zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed py-3 text-xs transition",
            dragOver
              ? "border-pink-500 bg-pink-500/10 text-pink-300"
              : "border-neutral-800 text-neutral-500 hover:border-neutral-700",
          )}
        >
          <HugeiconsIcon icon={Upload04Icon} size={18} />
          <div>Drop or pick a file (MP3 · WAV · FLAC · OGG · M4A · max 100MB)</div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="mt-1 h-6 text-[10px]"
          >
            {uploading ? `Uploading ${Math.round(uploadProgress)}%…` : "Choose files"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                void uploadFiles(e.target.files)
                e.target.value = ""
              }
            }}
          />
        </div>

        {/* Asset list */}
        <div className="max-h-72 overflow-y-auto rounded-md border border-neutral-800">
          {loading ? (
            <div className="p-6 text-center text-sm text-neutral-500">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-neutral-500">
              {search ? "No matches" : "No samples yet. Drop a file above."}
            </div>
          ) : (
            <ul className="divide-y divide-neutral-800">
              {filtered.map((a) => {
                const isSelected = selectedIds.has(a.mediaId)
                return (
                  <li
                    key={a.mediaId}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 p-3 text-sm transition",
                      mode === "queue" && isSelected
                        ? "bg-pink-500/10"
                        : "hover:bg-neutral-800/30",
                    )}
                    onClick={() => {
                      if (mode === "queue") toggleSelected(a.mediaId)
                      else loadSingle(a)
                    }}
                  >
                    {mode === "queue" && (
                      <HugeiconsIcon
                        icon={isSelected ? CheckmarkSquareIcon : SquareIcon}
                        size={16}
                        className={
                          isSelected ? "text-pink-500" : "text-neutral-600"
                        }
                      />
                    )}
                    <HugeiconsIcon
                      icon={AudioWaveIcon}
                      size={16}
                      className="shrink-0 text-neutral-500"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-neutral-100">
                        {a.originalName}
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 text-[10px] text-neutral-500">
                        <span>{fmtBytes(a.size)}</span>
                        {a.duration && <span>{fmtTime(a.duration)}</span>}
                        {a.bpm && (
                          <span className="flex items-center gap-0.5">
                            <HugeiconsIcon icon={PulseIcon} size={10} />
                            {Math.round(a.bpm)}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {mode === "queue" && (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={queueSelected}
              disabled={selectedIds.size === 0}
            >
              {selectedIds.size > 0
                ? `Queue ${selectedIds.size} track${selectedIds.size === 1 ? "" : "s"}`
                : "Pick a track first"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, "0")}`
}
