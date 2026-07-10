"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Cancel01Icon,
  Delete01Icon,
  Download01Icon,
  Mic01Icon,
  Edit02Icon,
  Backward01Icon,
  Cancel02Icon,
  FullScreenIcon,
  Minimize01Icon,
  PlayIcon,
  PauseIcon,
  Upload04Icon,
  ChartHistogramIcon,
} from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { confirm as confirmDialog } from "@workspace/console/stores/confirm"
import {
  getTransportPosition,
  getTransportState,
  transportPlay,
  transportPause,
  transportSeek,
} from "@/lib/musician-engine"
import {
  aggregateTimelinePeaks,
  peaksToBars,
  type AggregateClipInput,
} from "@/lib/clip-peaks"

/**
 * Lyrics sidebar — right panel, multi-version drafts.
 *
 * Tabs şeklinde alternatif söz versiyonları (Draft v1, Turkish translation,
 * Bridge alt, vb.). Her version için inline-editable title + multiline
 * content editor + karaoke timing recorder.
 *
 * Karaoke v2 (line-level):
 *   - Space basılı tut → o anki satır başlangıç zamanı kaydedilir
 *   - Space bırak → satır bitiş zamanı kaydedilir, cursor sonraki satıra geçer
 *   - Chunk mode: "asWritten" (paragraph satırları) veya "perCount" (her N kelimede bir satır)
 *   - 6 render stili: Classic / Neon / Typewriter / Slide / Vinyl / Modern
 *   - SRT export: satırların startMs/endMs'i direkt cue'lara map edilir (overlap yok)
 */

export type KaraokeStyle =
  | "classic"
  | "neon"
  | "typewriter"
  | "slide"
  | "vinyl"
  | "modern"

export type ChunkMode = "asWritten" | "perCount"

export interface LyricsLineTiming {
  text: string
  sourceLineIdx: number
  startMs: number | null
  endMs: number | null
}

export interface LyricsTiming {
  lines: LyricsLineTiming[]
  chunkMode: ChunkMode
  chunkSize: number
  style: KaraokeStyle
  totalMs: number
  recordedAt: string | Date
}

export interface LyricsVersion {
  id: string
  title: string
  content: string
  timing?: LyricsTiming
  createdAt: string | Date
  updatedAt: string | Date
}

/**
 * Lyrics'i karaoke satırlarına böl.
 *   - "asWritten": content satırlarını koru (boş satırlar atla)
 *   - "perCount": tüm content'i flatten + her N kelimede bir satır
 *
 * sourceLineIdx: asWritten için orijinal paragraph satırı; perCount için
 * sıralı index.
 */
export function chunkLyrics(
  content: string,
  mode: ChunkMode,
  chunkSize: number,
): { text: string; sourceLineIdx: number }[] {
  if (mode === "asWritten") {
    return content
      .split("\n")
      .map((raw, idx) => ({ text: raw.trim(), sourceLineIdx: idx }))
      .filter((l) => l.text.length > 0)
  }
  // perCount — tüm word'leri al, N'er N'er paketle
  const size = Math.max(1, Math.min(10, chunkSize))
  const allWords: string[] = []
  for (const line of content.split("\n")) {
    for (const w of line.split(/\s+/).filter((w) => w.length > 0)) {
      allWords.push(w)
    }
  }
  const out: { text: string; sourceLineIdx: number }[] = []
  for (let i = 0; i < allWords.length; i += size) {
    out.push({
      text: allWords.slice(i, i + size).join(" "),
      sourceLineIdx: Math.floor(i / size),
    })
  }
  return out
}

/** ms → "HH:MM:SS,mmm" SRT format */
function fmtSrtTime(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  const millis = Math.floor(ms % 1000)
  return (
    `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:` +
    `${String(s).padStart(2, "0")},${String(millis).padStart(3, "0")}`
  )
}

/**
 * Line timing → SRT blob. Her line kendi {startMs, endMs} taşır;
 * direkt cue'lara map edilir. Overlap yok — startMs < endMs garanti.
 * endMs null ise sonraki line.startMs - 50ms (gap), son line için
 * startMs + 2000ms cushion.
 */
function exportSrt(version: LyricsVersion): Blob {
  const timing = version.timing
  if (!timing || timing.lines.length === 0) {
    return new Blob([""], { type: "text/srt" })
  }
  const valid = timing.lines.filter(
    (l) => l.startMs !== null && l.text.length > 0,
  )
  let out = ""
  let cueIdx = 1
  for (let i = 0; i < valid.length; i++) {
    const l = valid[i]!
    const startMs = l.startMs!
    let endMs: number
    if (l.endMs !== null && l.endMs > startMs) {
      endMs = l.endMs
      const next = valid[i + 1]
      if (next && next.startMs !== null) {
        const gap = next.startMs - 50
        if (endMs > gap) endMs = Math.max(startMs + 200, gap)
      }
    } else {
      const next = valid[i + 1]
      if (next && next.startMs !== null) {
        endMs = next.startMs - 50
      } else {
        endMs = startMs + 2000
      }
    }
    if (endMs <= startMs) endMs = startMs + 500
    out += `${cueIdx}\n${fmtSrtTime(startMs)} --> ${fmtSrtTime(endMs)}\n${l.text}\n\n`
    cueIdx++
  }
  return new Blob([out], { type: "text/srt;charset=utf-8" })
}

/**
 * SRT metnini karaoke line timing'lerine çevir. Her cue = bir satır
 * (çok-satırlı cue metni boşlukla birleştirilir). Cue index satırı (yalnız
 * rakam) atlanır. `HH:MM:SS,mmm` ve `.` ayraç toleranslı; 1-3 haneli ms.
 */
function parseSrt(raw: string): LyricsLineTiming[] {
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const blocks = text.split(/\n\s*\n/)
  const tc =
    /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/
  const toMs = (h: string, m: string, s: string, ms: string) =>
    +h * 3600000 + +m * 60000 + +s * 1000 + +ms.padEnd(3, "0")
  const lines: LyricsLineTiming[] = []
  let idx = 0
  for (const block of blocks) {
    const rows = block
      .split("\n")
      .map((r) => r.trim())
      .filter(Boolean)
    if (rows.length === 0) continue
    // İlk satır cue numarası ise atla.
    const start = /^\d+$/.test(rows[0]!) ? 1 : 0
    const timeRow = rows[start]
    if (!timeRow) continue
    const m = tc.exec(timeRow)
    if (!m) continue
    const startMs = toMs(m[1]!, m[2]!, m[3]!, m[4]!)
    const endMs = toMs(m[5]!, m[6]!, m[7]!, m[8]!)
    const cueText = rows.slice(start + 1).join(" ").trim()
    if (!cueText) continue
    lines.push({ text: cueText, sourceLineIdx: idx, startMs, endMs })
    idx++
  }
  return lines
}

// ─── Karaoke render style definitions ─────────────────────────────────────

interface StyleSpec {
  id: KaraokeStyle
  label: string
  description: string
  /** Container className — typography + padding */
  container: string
  /** Pending (henüz okunmamış) satır className */
  pending: string
  /** Active (şu an okunan) satır className */
  active: string
  /** Past (geçmiş) satır className */
  past: string
  /** Cursor (recording target) className */
  cursor: string
  /** Progress overlay color (active satırda soldan-sağa fill) */
  progressBg: string
  /** Style picker thumbnail color hint */
  thumb: string
  /**
   * Progress fill modu:
   *   - "behind": metnin arkasında soldan-sağa renkli rect (klasik karaoke)
   *   - "clip":   metnin İÇİNDE rengin ilerlemesi (Apple Music tarzı,
   *               text üzerinde mask-based overlay)
   */
  fillMode: "behind" | "clip"
  /** Stilin chrome rengi (gap bar fill, waveform trail vb.). bg-* class. */
  accentBg: string
}

export const KARAOKE_STYLES: Record<KaraokeStyle, StyleSpec> = {
  classic: {
    id: "classic",
    label: "Classic",
    description: "White prose · amber active highlight",
    container: "font-sans text-neutral-300 leading-[1.75]",
    pending: "text-neutral-600",
    active:
      "text-amber-100 [text-shadow:_0_0_14px_rgba(251,191,36,0.45)]",
    past: "text-neutral-500",
    cursor:
      "bg-amber-500/25 text-amber-50 ring-1 ring-amber-400/60 rounded-md [box-shadow:_0_0_22px_rgba(251,191,36,0.4)]",
    progressBg: "bg-amber-400/30",
    thumb: "from-amber-300 to-amber-500",
    fillMode: "behind",
    accentBg: "bg-amber-400",
  },
  neon: {
    id: "neon",
    label: "Neon",
    description: "Emerald glow · text fills letter-by-letter",
    container:
      "font-sans font-bold tracking-wide text-neutral-700 leading-[1.85]",
    pending: "text-neutral-700",
    active:
      "text-emerald-700/40",
    past: "text-emerald-700/55",
    cursor:
      "bg-emerald-500/25 text-emerald-50 ring-1 ring-emerald-400/60 rounded-md [box-shadow:_0_0_30px_rgba(52,211,153,0.6),_inset_0_0_12px_rgba(52,211,153,0.4)]",
    progressBg:
      "text-emerald-200 [text-shadow:_0_0_10px_rgba(52,211,153,0.85),_0_0_26px_rgba(52,211,153,0.55)]",
    thumb: "from-emerald-300 to-cyan-400",
    fillMode: "clip",
    accentBg: "bg-emerald-400",
  },
  typewriter: {
    id: "typewriter",
    label: "Typewriter",
    description: "Courier mono · text fills as inked",
    container:
      "font-mono text-amber-100/70 leading-[1.95] tracking-tight",
    pending: "text-amber-100/25",
    active: "text-amber-100/30",
    past: "text-amber-100/50",
    cursor:
      "bg-amber-100/12 text-amber-50 border-b-2 border-amber-300 rounded-sm",
    progressBg:
      "text-amber-50 underline decoration-2 decoration-amber-400/70 underline-offset-4",
    thumb: "from-amber-100 to-amber-300",
    fillMode: "clip",
    accentBg: "bg-amber-300",
  },
  slide: {
    id: "slide",
    label: "Slide",
    description: "Cinematic · scale + slide",
    container:
      "font-sans font-semibold text-neutral-500 leading-[1.8]",
    pending: "text-neutral-700",
    active:
      "text-white [text-shadow:_0_2px_22px_rgba(255,255,255,0.45)] scale-[1.08] translate-x-2 origin-left transition-transform duration-300",
    past: "text-neutral-500",
    cursor:
      "bg-white/12 text-white scale-[1.05] origin-left rounded-md transition-transform",
    progressBg: "bg-white/15",
    thumb: "from-white to-neutral-300",
    fillMode: "behind",
    accentBg: "bg-white",
  },
  vinyl: {
    id: "vinyl",
    label: "Vinyl",
    description: "Pink magenta · text fills with disco glow",
    container:
      "font-serif italic text-pink-200/35 leading-[1.8] tracking-wider",
    pending: "text-pink-300/25",
    active: "text-pink-300/30",
    past: "text-pink-300/40",
    cursor:
      "bg-pink-500/25 text-pink-50 not-italic ring-1 ring-pink-400/60 rounded-md [box-shadow:_0_0_24px_rgba(236,72,153,0.6)]",
    progressBg:
      "text-pink-100 not-italic [text-shadow:_0_0_18px_rgba(244,114,182,0.7)] tracking-normal",
    thumb: "from-pink-300 to-fuchsia-500",
    fillMode: "clip",
    accentBg: "bg-pink-400",
  },
  modern: {
    id: "modern",
    label: "Modern",
    description: "Minimal · subtle background bar",
    container:
      "font-sans font-medium text-neutral-400 leading-[1.75]",
    pending: "text-neutral-600",
    active:
      "text-neutral-50 bg-neutral-800/85 backdrop-blur rounded-md",
    past: "text-neutral-500",
    cursor: "bg-neutral-700/80 text-neutral-50 rounded-md",
    progressBg: "bg-neutral-50/15",
    thumb: "from-neutral-200 to-neutral-500",
    fillMode: "behind",
    accentBg: "bg-neutral-100",
  },
}

const STYLE_LIST: KaraokeStyle[] = [
  "classic",
  "neon",
  "typewriter",
  "slide",
  "vinyl",
  "modern",
]

export function LyricsSidebar({
  open,
  onOpenChange,
  companySlug,
  projectId,
  initial,
  projectDurationSec,
  waveformClips,
  bpm,
  onPlay,
  onPause,
  renderAudio,
  markers,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  companySlug: string
  projectId: string
  initial: LyricsVersion[] | undefined
  /** Proje BPM'i — ritim timeline beat grid'i (KaraokePanel'e geçer). */
  bpm?: number
  /** Karaoke video export'u için offline mix AudioBuffer render'ı. */
  renderAudio?: () => Promise<AudioBuffer>
  /** Proje marker'ları (durak etiketleri) — export frame'inde. */
  markers?: { time: number; label: string }[]
  /** Fullscreen karaoke play/pause — parent'ın TAM play path'i (ensureAudio
   *  + clip scheduling + transportPlay). Fullscreen doğrudan transportPlay
   *  çağırırsa, ana player'dan hiç çalınmamışsa ses gelmez (item: FS play). */
  onPlay?: () => void | Promise<void>
  onPause?: () => void
  /** Karaoke fullscreen player seek slider'ı bu duration'ı max alır.
   *  Yoksa son timed line + 30s fallback. */
  projectDurationSec?: number
  /** Fullscreen player'da master mini-waveform için aggregated clip listesi
   *  (mediaId + url + start/duration + gain + muted). Aktif clip'leri
   *  parent (musician-editor) projeksiyonu yapar; sidebar peak fetch ve
   *  aggregation'ı çağırır. */
  waveformClips?: AggregateClipInput[]
}) {
  const [versions, setVersions] = useState<LyricsVersion[]>(initial ?? [])
  const [activeId, setActiveId] = useState<string | null>(
    initial?.[0]?.id ?? null,
  )
  const [mode, setMode] = useState<"edit" | "karaoke">("edit")
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Satır-numarası gutter'ı — textarea dikey scroll'una senkronize (absolute
  // sabit kalırsa numaralar metinden kayar). translateY(-scrollTop).
  const gutterRef = useRef<HTMLPreElement>(null)

  // Initial sync — yalnızca project ID değişiminde reset. `initial`
  // reference parent re-render'ında değişebilir; bu reset local karaoke
  // state'ini overwrite eder, bu yüzden sadece projectId dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setVersions(initial ?? [])
    setActiveId((cur) => {
      if (cur && initial?.some((v) => v.id === cur)) return cur
      return initial?.[0]?.id ?? null
    })
  }, [projectId])

  const active = useMemo(
    () => versions.find((v) => v.id === activeId) ?? null,
    [versions, activeId],
  )

  const persist = useCallback(
    (next: LyricsVersion[]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `/api/companies/${companySlug}/studio/projects/${projectId}`,
            {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ lyrics: next }),
            },
          )
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : "Lyrics save failed",
          )
        }
      }, 800)
    },
    [companySlug, projectId],
  )

  const addVersion = useCallback(() => {
    const id = `lyr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const now = new Date().toISOString()
    const next: LyricsVersion = {
      id,
      title: `Draft ${versions.length + 1}`,
      content: "",
      createdAt: now,
      updatedAt: now,
    }
    const updated = [...versions, next]
    setVersions(updated)
    setActiveId(id)
    persist(updated)
  }, [versions, persist])

  // ── SRT import — dosyayı parse edip yeni versiyon olarak ekle ──
  const srtInputRef = useRef<HTMLInputElement>(null)
  const importSrt = useCallback(
    async (file: File) => {
      try {
        const raw = await file.text()
        const lines = parseSrt(raw)
        if (lines.length === 0) {
          toast.error("No subtitles found in that SRT")
          return
        }
        const content = lines.map((l) => l.text).join("\n")
        const totalMs = lines.reduce(
          (mx, l) => Math.max(mx, l.endMs ?? l.startMs ?? 0),
          0,
        )
        const id = `lyr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const now = new Date().toISOString()
        const title = file.name.replace(/\.srt$/i, "").slice(0, 40) || "Imported SRT"
        const version: LyricsVersion = {
          id,
          title,
          content,
          // asWritten + aynı satır metinleri → chunkLyrics token'larıyla eşleşir,
          // karaoke panel timing'i tanır (per-line merge).
          timing: {
            lines,
            chunkMode: "asWritten",
            chunkSize: 4,
            style: "classic",
            totalMs,
            recordedAt: now,
          },
          createdAt: now,
          updatedAt: now,
        }
        const updated = [...versions, version]
        setVersions(updated)
        setActiveId(id)
        persist(updated)
        toast.success(`Imported ${lines.length} timed lines`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "SRT import failed")
      }
    },
    [versions, persist],
  )

  const removeVersion = useCallback(
    async (id: string) => {
      const ok = await confirmDialog({
        title: "Delete lyrics version?",
        description: "This action cannot be undone.",
        confirmText: "Delete",
        destructive: true,
      })
      if (!ok) return
      const updated = versions.filter((v) => v.id !== id)
      setVersions(updated)
      if (activeId === id) setActiveId(updated[0]?.id ?? null)
      persist(updated)
    },
    [versions, activeId, persist],
  )

  const patchVersion = useCallback(
    (
      id: string,
      patch: Partial<Pick<LyricsVersion, "title" | "content" | "timing">>,
    ) => {
      const updated = versions.map((v) =>
        v.id === id
          ? { ...v, ...patch, updatedAt: new Date().toISOString() }
          : v,
      )
      setVersions(updated)
      persist(updated)
    },
    [versions, persist],
  )

  const handleExportSrt = useCallback(() => {
    if (!active) return
    if (!active.timing || active.timing.lines.length === 0) {
      toast.error("No timing yet — record karaoke first")
      return
    }
    const timedCount = active.timing.lines.filter(
      (l) => l.startMs !== null,
    ).length
    if (timedCount === 0) {
      toast.error("No timed lines")
      return
    }
    const blob = exportSrt(active)
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    const safe = active.title.replace(/[^a-z0-9._-]/gi, "_").toLowerCase()
    a.download = `${safe || "lyrics"}.srt`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`SRT exported · ${timedCount} timed lines`)
  }, [active])

  const lineCount = active?.content.split("\n").length ?? 0

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col overflow-hidden border-l border-neutral-800 transition-[width] duration-200 ease-out",
        open ? "w-[460px]" : "w-0",
      )}
      style={{
        background:
          "radial-gradient(circle at 100% 0%, rgba(236, 72, 153, 0.06) 0%, transparent 50%), linear-gradient(180deg, rgba(15, 15, 18, 0.95) 0%, rgba(10, 10, 12, 0.98) 100%)",
      }}
    >
      {open && (
        <>
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-neutral-800 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <HugeiconsIcon
                icon={Mic01Icon}
                size={14}
                className="text-pink-400"
              />
              <span className="text-sm font-bold tracking-wide text-neutral-100">
                Lyrics
              </span>
              <span className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[9px] text-neutral-400">
                {versions.length}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={addVersion}
                      className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 transition hover:bg-neutral-800 hover:text-emerald-300"
                    >
                      <HugeiconsIcon icon={Add01Icon} size={12} />
                    </button>
                  }
                />
                <TooltipContent>New version</TooltipContent>
              </Tooltip>
              {/* SRT import — yeni versiyon olarak ekler (timing dahil) */}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={() => srtInputRef.current?.click()}
                      className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 transition hover:bg-neutral-800 hover:text-emerald-300"
                    >
                      <HugeiconsIcon icon={Upload04Icon} size={12} />
                    </button>
                  }
                />
                <TooltipContent>Import SRT as new version</TooltipContent>
              </Tooltip>
              <input
                ref={srtInputRef}
                type="file"
                accept=".srt,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void importSrt(f)
                  e.target.value = ""
                }}
              />
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={() => onOpenChange(false)}
                      className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-100"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={12} />
                    </button>
                  }
                />
                <TooltipContent>Close</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Version tabs + mode switch */}
          {versions.length > 0 && (
            <>
              <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-neutral-800/60 bg-neutral-950/40 px-2 py-1.5">
                {versions.map((v) => (
                  <VersionTab
                    key={v.id}
                    version={v}
                    active={v.id === activeId}
                    onSelect={() => setActiveId(v.id)}
                    onRename={(name) => patchVersion(v.id, { title: name })}
                    onDelete={() => removeVersion(v.id)}
                  />
                ))}
              </div>
              <div className="flex shrink-0 items-center justify-between border-b border-neutral-800/60 bg-neutral-950/30 px-3 py-1.5">
                <div className="flex items-center gap-0.5 rounded border border-neutral-800 p-0.5">
                  <button
                    type="button"
                    onClick={() => setMode("edit")}
                    className={cn(
                      "rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest transition",
                      mode === "edit"
                        ? "bg-pink-500/20 text-pink-200"
                        : "text-neutral-500 hover:text-neutral-200",
                    )}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("karaoke")}
                    className={cn(
                      "rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest transition",
                      mode === "karaoke"
                        ? "bg-pink-500/20 text-pink-200"
                        : "text-neutral-500 hover:text-neutral-200",
                    )}
                  >
                    Karaoke
                  </button>
                </div>
                {mode === "karaoke" && active && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={handleExportSrt}
                          className="flex items-center gap-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-neutral-300 transition hover:border-emerald-500/60 hover:bg-emerald-500/10 hover:text-emerald-300"
                        >
                          <HugeiconsIcon
                            icon={Download01Icon}
                            size={10}
                          />
                          SRT
                        </button>
                      }
                    />
                    <TooltipContent>
                      Download line-grouped SRT subtitle file
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </>
          )}

          {/* Body — edit (textarea) or karaoke (recorder/replay) */}
          {active && mode === "karaoke" ? (
            <KaraokePanel
              version={active}
              projectDurationSec={projectDurationSec}
              waveformClips={waveformClips}
              bpm={bpm}
              onPlay={onPlay}
              onPause={onPause}
              renderAudio={renderAudio}
              markers={markers}
              onPatchTiming={(timing) =>
                patchVersion(active.id, { timing })
              }
            />
          ) : active ? (
            <div className="relative min-h-0 flex-1 overflow-hidden">
              {/* Satır numaraları — textarea ile AYNI font-size + leading + py
                  (aksi halde satır yükseklikleri farklı → numaralar kayar).
                  Dikey scroll'da textarea'nın scrollTop'una göre translate. */}
              <pre
                ref={gutterRef}
                aria-hidden
                className="pointer-events-none absolute left-0 top-0 z-0 w-9 select-none py-4 pr-2 text-right font-mono text-[13px] leading-[1.7] text-neutral-700 will-change-transform"
              >
                {Array.from({ length: Math.max(lineCount, 1) }, (_, i) => i + 1)
                  .map(String)
                  .join("\n")}
              </pre>
              <textarea
                value={active.content}
                onChange={(e) =>
                  patchVersion(active.id, { content: e.target.value })
                }
                onScroll={(e) => {
                  if (gutterRef.current)
                    gutterRef.current.style.transform = `translateY(${-e.currentTarget.scrollTop}px)`
                }}
                placeholder={`Write your lyrics here…\n\nVerses, chorus, bridges…\nLines stay as you type — no Markdown.`}
                spellCheck={false}
                // wrap=off → 1 mantıksal satır = 1 görsel satır = 1 numara
                // (soft-wrap numaralandırmayı bozar; uzun satır yatay scroll).
                wrap="off"
                className="relative z-10 h-full w-full resize-none overflow-auto whitespace-pre border-0 bg-transparent py-4 pl-10 pr-4 font-mono text-[13px] leading-[1.7] text-neutral-100 placeholder:text-neutral-700 focus:outline-none"
                style={{
                  caretColor: "#ec4899",
                  textShadow: "0 0 18px rgba(236, 72, 153, 0.08)",
                }}
              />
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full bg-pink-500/10"
                style={{
                  boxShadow:
                    "0 0 36px rgba(236, 72, 153, 0.18), inset 0 0 18px rgba(236, 72, 153, 0.12)",
                }}
              >
                <HugeiconsIcon
                  icon={Mic01Icon}
                  size={22}
                  className="text-pink-300"
                />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium text-neutral-200">
                  No lyrics yet
                </div>
                <div className="text-[11px] text-neutral-500">
                  Start your first draft. Add alternates anytime.
                </div>
              </div>
              <button
                type="button"
                onClick={addVersion}
                className="flex items-center gap-1.5 rounded-md bg-pink-500/20 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-pink-200 transition hover:bg-pink-500/30"
              >
                <HugeiconsIcon icon={Add01Icon} size={12} />
                Start writing
              </button>
            </div>
          )}

          {active && mode === "edit" && (
            <div className="flex shrink-0 items-center justify-between border-t border-neutral-800 px-4 py-1.5 font-mono text-[9px] uppercase tracking-widest text-neutral-600">
              <span>
                {lineCount} {lineCount === 1 ? "line" : "lines"} ·{" "}
                {active.content
                  .split(/\s+/)
                  .filter((w) => w.length > 0).length}{" "}
                words
              </span>
              <span className="text-neutral-700">auto-saved</span>
            </div>
          )}
        </>
      )}
    </aside>
  )
}

// ─── Karaoke recorder / replay panel ───────────────────────────────────────

/**
 * Karaoke mode (line-level):
 *   - Lyrics content chunkMode + chunkSize ile satırlara bölünür
 *   - "Record" → Space basılı tut: o anki satırın startMs'i kaydedilir
 *     (Transport pozisyonu). Space bırak: endMs kaydedilir + cursor sonraki
 *     satıra geçer. OS key repeat'ten korunmak için holdingRef.
 *   - Backspace: cursor'u bir geri al, son satırın start/endMs'ini sıfırla
 *   - "Replay" (record off): Transport çalarken active line highlight olur;
 *     satır içinde soldan-sağa progress overlay (line span'ına oranla)
 *   - Style picker: 6 görsel render stili
 *   - Chunk picker: asWritten (paragraph satırlarını koru) veya perCount
 *     (her N kelimede bir satır, N = 1..10)
 *
 * Persistence: timing değişimi parent persist debounce'a düşer.
 */
function KaraokePanel({
  version,
  projectDurationSec,
  waveformClips,
  bpm,
  onPlay,
  onPause,
  renderAudio,
  markers,
  onPatchTiming,
}: {
  version: LyricsVersion
  projectDurationSec?: number
  waveformClips?: AggregateClipInput[]
  /** Proje BPM'i — ritim timeline beat grid'i için. */
  bpm?: number
  onPlay?: () => void | Promise<void>
  onPause?: () => void
  /** Karaoke video export'u için offline mix AudioBuffer. */
  renderAudio?: () => Promise<AudioBuffer>
  /** Proje marker'ları (durak etiketleri) — export frame'inde. */
  markers?: { time: number; label: string }[]
  onPatchTiming(timing: LyricsTiming): void
}) {
  const [chunkMode, setChunkMode] = useState<ChunkMode>(
    version.timing?.chunkMode ?? "asWritten",
  )
  const [chunkSize, setChunkSize] = useState<number>(
    version.timing?.chunkSize ?? 4,
  )
  const [style, setStyle] = useState<KaraokeStyle>(
    version.timing?.style ?? "classic",
  )

  const tokens = useMemo(
    () => chunkLyrics(version.content, chunkMode, chunkSize),
    [version.content, chunkMode, chunkSize],
  )

  // Initial line array: mevcut token'lara önceki timing'i PER-LINE taşı.
  // Eskiden all-or-nothing'di (tek satır editi tüm zaman etiketlerini
  // sıfırlıyordu). Artık metni değişmeyen her satır kendi start/endMs'ini
  // korur; yalnız metni değişen/yeni satır null olur. Eşleştirme: önce aynı
  // pozisyonda aynı metin, sonra başka pozisyonda kullanılmamış aynı metin.
  // Defensive — legacy `{words:[...]}` shape'inde `lines` undefined olabilir.
  const initialLines: LyricsLineTiming[] = useMemo(() => {
    const prev =
      version.timing && Array.isArray(version.timing.lines)
        ? version.timing.lines
        : null
    if (!prev || prev.length === 0) {
      return tokens.map((tok) => ({ ...tok, startMs: null, endMs: null }))
    }
    const used = new Set<number>()
    const byText = new Map<string, number[]>()
    prev.forEach((l, i) => {
      const arr = byText.get(l.text)
      if (arr) arr.push(i)
      else byText.set(l.text, [i])
    })
    return tokens.map((tok, i) => {
      // 1) Aynı pozisyonda aynı metin → timing'i koru.
      if (prev[i]?.text === tok.text && !used.has(i)) {
        used.add(i)
        return { ...tok, startMs: prev[i]!.startMs, endMs: prev[i]!.endMs }
      }
      // 2) Başka pozisyonda kullanılmamış aynı metin (satır taşınmış/eklenmiş).
      const cand = byText.get(tok.text)?.find((j) => !used.has(j))
      if (cand !== undefined) {
        used.add(cand)
        return { ...tok, startMs: prev[cand]!.startMs, endMs: prev[cand]!.endMs }
      }
      // 3) Yeni/değişmiş satır → timing yok.
      return { ...tok, startMs: null, endMs: null }
    })
  }, [version.timing, tokens])

  const [lines, setLines] = useState<LyricsLineTiming[]>(initialLines)
  const [recording, setRecording] = useState(false)
  const [cursorIdx, setCursorIdx] = useState(0)
  const [replayTick, setReplayTick] = useState(0)
  // Space-hold guard — OS key repeat spam'ini (~30Hz keydown) engelle.
  // Sadece ilk keydown action eder; sonraki keydown'lar holdingRef true
  // ise no-op. keyup'ta false.
  const holdingRef = useRef(false)
  // Aktif basılı satır — keyup'ın geçerli line'ı bilebilmesi için
  // (cursorIdx state mutation arası lost olabilir).
  const activeLineRef = useRef<number | null>(null)
  // Font scale — A−/A+ controls; localStorage persist.
  const [fontScale, setFontScale] = useState<number>(() => {
    if (typeof window === "undefined") return 1
    const raw = window.localStorage.getItem("studio-karaoke-font-scale")
    const n = raw ? parseFloat(raw) : 1
    return Number.isFinite(n) ? Math.max(0.85, Math.min(2.5, n)) : 1
  })
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "studio-karaoke-font-scale",
        fontScale.toString(),
      )
    } catch {}
  }, [fontScale])
  // Ritim timeline (alttan açılan) — sözleri beat grid üstünde düzenle.
  const [rhythmOpen, setRhythmOpen] = useState(false)
  // Fullscreen karaoke — transport seek/play slider + centered active line.
  // ESC kapatır.
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    if (!fullscreen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onEsc = (e: KeyboardEvent) => {
      if (e.code === "Escape") setFullscreen(false)
    }
    window.addEventListener("keydown", onEsc)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onEsc)
    }
  }, [fullscreen])
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Sync from version — sadece version ID değişiminde reset.
  // Recording aktifken parent re-render'ları local state'i etkilemez.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setChunkMode(version.timing?.chunkMode ?? "asWritten")
    setChunkSize(version.timing?.chunkSize ?? 4)
    setStyle(version.timing?.style ?? "classic")
    setLines(initialLines)
    setCursorIdx(
      Math.max(0, initialLines.findIndex((l) => l.startMs === null)),
    )
    setRecording(false)
    holdingRef.current = false
    activeLineRef.current = null
    setFullscreen(false)
  }, [version.id])

  // Chunk config değişimi → lines reset (tokens shape değişti)
  useEffect(() => {
    // Sadece chunk değişimi tetiklerse reset. version.id zaten ayrı effect'te.
    setLines(initialLines)
    setCursorIdx(
      Math.max(0, initialLines.findIndex((l) => l.startMs === null)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunkMode, chunkSize])

  // Replay rAF — Transport çalarken her frame active line + progress hesapla
  useEffect(() => {
    if (recording) return
    let raf = 0
    const tick = () => {
      setReplayTick((t) => (t + 1) % 1_000_000)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [recording])

  const persist = useCallback(
    (
      nextLines: LyricsLineTiming[],
      override?: Partial<Pick<LyricsTiming, "chunkMode" | "chunkSize" | "style">>,
    ) => {
      const ends = nextLines
        .map((l) => l.endMs ?? l.startMs)
        .filter((m): m is number => m !== null && Number.isFinite(m))
      const totalMs = ends.length > 0 ? Math.max(...ends) + 1000 : 0
      onPatchTiming({
        lines: nextLines,
        chunkMode: override?.chunkMode ?? chunkMode,
        chunkSize: override?.chunkSize ?? chunkSize,
        style: override?.style ?? style,
        totalMs,
        recordedAt: new Date().toISOString(),
      })
    },
    [onPatchTiming, chunkMode, chunkSize, style],
  )

  // Ritim timeline'dan gelen düzenleme — lokal lines + persist.
  const commitLines = useCallback(
    (next: LyricsLineTiming[]) => {
      setLines(next)
      persist(next)
    },
    [persist],
  )

  // Style/chunk değişimi → persist (mevcut lines + yeni config)
  const handleStyleChange = useCallback(
    (s: KaraokeStyle) => {
      setStyle(s)
      persist(lines, { style: s })
    },
    [lines, persist],
  )

  const handleChunkChange = useCallback(
    (mode: ChunkMode, size: number) => {
      setChunkMode(mode)
      setChunkSize(size)
      // Reset lines (shape değişti)
      const fresh = chunkLyrics(version.content, mode, size).map((t) => ({
        ...t,
        startMs: null,
        endMs: null,
      }))
      setLines(fresh)
      setCursorIdx(0)
      persist(fresh, { chunkMode: mode, chunkSize: size })
    },
    [version.content, persist],
  )

  // Space keydown → o anki satırın startMs'ini kaydet (basılı tut başlangıcı)
  // Space keyup → o satırın endMs'ini kaydet + cursor advance
  // Backspace → cursor'u bir geri al, son satırın start/endMs sıfırla
  //
  // Capture phase + stopImmediatePropagation: global musician-editor Space
  // handler'ı (transport play/pause) recording sırasında bypass edilmeli.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!recording) return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        return
      }
      if (e.code === "Space") {
        e.preventDefault()
        e.stopImmediatePropagation()
        // Key repeat guard — basılı tutarken OS 30Hz spam yapıyor
        if (holdingRef.current) return
        if (cursorIdx >= lines.length) {
          setRecording(false)
          toast.success("Karaoke timing complete", {
            description: `${lines.length} lines timed`,
          })
          return
        }
        holdingRef.current = true
        activeLineRef.current = cursorIdx
        const nowMs = Math.max(0, getTransportPosition() * 1000)
        const next = lines.map((l, i) =>
          i === cursorIdx ? { ...l, startMs: nowMs, endMs: null } : l,
        )
        setLines(next)
        // Persist'i keyup'a bırak — start+end tek shot kayıt olur, network
        // gereksiz yere iki kez tetiklenmez.
      } else if (e.code === "Backspace") {
        e.preventDefault()
        e.stopImmediatePropagation()
        if (cursorIdx === 0 && !holdingRef.current) return
        // Eğer şu an basılı tutuluyorsa undo aktif basılı satırı sıfırla,
        // değilse bir önceki kaydı sıfırla
        const target = holdingRef.current
          ? (activeLineRef.current ?? cursorIdx)
          : cursorIdx - 1
        const next = lines.map((l, i) =>
          i === target ? { ...l, startMs: null, endMs: null } : l,
        )
        setLines(next)
        persist(next)
        if (!holdingRef.current) setCursorIdx(target)
        else holdingRef.current = false
      }
    },
    [recording, cursorIdx, lines, persist],
  )

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (!recording) return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        return
      }
      if (e.code !== "Space") return
      if (!holdingRef.current) return
      e.preventDefault()
      e.stopImmediatePropagation()
      const lineIdx = activeLineRef.current
      holdingRef.current = false
      activeLineRef.current = null
      if (lineIdx === null) return
      const nowMs = Math.max(0, getTransportPosition() * 1000)
      const next = lines.map((l, i) => {
        if (i !== lineIdx) return l
        // endMs en az startMs + 100ms (zero-duration cue önleme)
        const endMs =
          l.startMs !== null && nowMs > l.startMs
            ? nowMs
            : (l.startMs ?? nowMs) + 200
        return { ...l, endMs }
      })
      setLines(next)
      persist(next)
      setCursorIdx((i) => Math.min(lines.length, i + 1))
    },
    [recording, lines, persist],
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, { capture: true })
    window.addEventListener("keyup", handleKeyUp, { capture: true })
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true })
      window.removeEventListener("keyup", handleKeyUp, { capture: true })
    }
  }, [handleKeyDown, handleKeyUp])

  // Cursor advance → o satıra auto-scroll (ekran ortası).
  useEffect(() => {
    if (!recording) return
    const container = containerRef.current
    if (!container) return
    const el = container.querySelector(
      `[data-line-idx="${cursorIdx}"]`,
    ) as HTMLElement | null
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [cursorIdx, recording])

  const startRecord = useCallback(() => {
    if (getTransportState() !== "started") {
      toast.warning("Press play first — recording follows transport time")
      return
    }
    const firstNull = lines.findIndex((l) => l.startMs === null)
    setCursorIdx(firstNull >= 0 ? firstNull : 0)
    setRecording(true)
    holdingRef.current = false
    activeLineRef.current = null
    toast.info("Recording — hold Space for each line, release at line end")
  }, [lines])

  const stopRecord = useCallback(() => {
    setRecording(false)
    holdingRef.current = false
    activeLineRef.current = null
  }, [])

  const clearTimings = useCallback(async () => {
    const ok = await confirmDialog({
      title: "Clear all line timings?",
      description: "This wipes every recorded start/end. You can re-record.",
      confirmText: "Clear",
      destructive: true,
    })
    if (!ok) return
    const next = lines.map((l) => ({ ...l, startMs: null, endMs: null }))
    setLines(next)
    persist(next)
    setCursorIdx(0)
  }, [lines, persist])

  // Replay — aktif satır + progress (transport-driven, recording dışında)
  const activeReplayIdx = useMemo(() => {
    if (recording) return cursorIdx
    if (getTransportState() !== "started") return -1
    const nowMs = getTransportPosition() * 1000
    // startMs <= nowMs olan + (endMs null veya endMs >= nowMs olan)
    let best = -1
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!
      if (l.startMs === null) continue
      if (l.startMs > nowMs) break
      const end = l.endMs ?? (lines[i + 1]?.startMs ?? l.startMs + 3000)
      if (nowMs <= end) {
        best = i
        break
      }
      best = i // past line; continue looking for current
    }
    return best
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, recording, cursorIdx, replayTick])

  const activeProgress = useMemo(() => {
    if (recording || activeReplayIdx < 0) return 0
    if (getTransportState() !== "started") return 0
    const cur = lines[activeReplayIdx]
    if (!cur || cur.startMs === null) return 0
    const end = cur.endMs ?? (lines[activeReplayIdx + 1]?.startMs ?? cur.startMs + 3000)
    const nowMs = getTransportPosition() * 1000
    const span = end - cur.startMs
    if (span <= 0) return 1
    return Math.max(0, Math.min(1, (nowMs - cur.startMs) / span))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReplayIdx, lines, recording, replayTick])

  const timedCount = lines.filter((l) => l.startMs !== null).length
  const styleSpec = KARAOKE_STYLES[style]

  return (
    <>
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Control bar — record + undo + clear + font + counter */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-800/60 bg-neutral-950/40 px-3 py-2">
        {!recording ? (
          <button
            type="button"
            onClick={startRecord}
            className="flex items-center gap-1 rounded bg-red-500/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-red-300 transition hover:bg-red-500/30"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
            Record
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecord}
            className="flex items-center gap-1 rounded bg-neutral-700/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-neutral-200 transition hover:bg-neutral-700"
          >
            <HugeiconsIcon icon={Cancel02Icon} size={10} />
            Stop
          </button>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => {
                  if (cursorIdx === 0) return
                  const prev = cursorIdx - 1
                  const next = lines.map((l, i) =>
                    i === prev ? { ...l, startMs: null, endMs: null } : l,
                  )
                  setLines(next)
                  persist(next)
                  setCursorIdx(prev)
                }}
                disabled={cursorIdx === 0 || !recording}
                className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <HugeiconsIcon icon={Backward01Icon} size={11} />
              </button>
            }
          />
          <TooltipContent>Undo last line (Backspace)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={clearTimings}
                disabled={timedCount === 0}
                className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 transition hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <HugeiconsIcon icon={Delete01Icon} size={11} />
              </button>
            }
          />
          <TooltipContent>Clear all timings</TooltipContent>
        </Tooltip>
        <span className="ms-auto font-mono text-[9px] uppercase tracking-widest text-neutral-500">
          {timedCount} / {lines.length} lines
        </span>
        <div className="flex items-center gap-0.5 rounded border border-neutral-800 p-0.5">
          <button
            type="button"
            onClick={() =>
              setFontScale((s) => Math.max(0.85, Number((s - 0.15).toFixed(2))))
            }
            className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100"
            title="Decrease font size"
          >
            A−
          </button>
          <button
            type="button"
            onClick={() =>
              setFontScale((s) => Math.min(2.5, Number((s + 0.15).toFixed(2))))
            }
            className="flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100"
            title="Increase font size"
          >
            A+
          </button>
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => setRhythmOpen((o) => !o)}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded transition",
                  rhythmOpen
                    ? "bg-pink-500/20 text-pink-200"
                    : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100",
                )}
              >
                <HugeiconsIcon icon={ChartHistogramIcon} size={12} />
              </button>
            }
          />
          <TooltipContent>Rhythm timeline — align lyrics to the beat</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => setFullscreen(true)}
                disabled={lines.length === 0}
                className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 transition hover:bg-pink-500/15 hover:text-pink-200 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <HugeiconsIcon icon={FullScreenIcon} size={12} />
              </button>
            }
          />
          <TooltipContent>Fullscreen player</TooltipContent>
        </Tooltip>
      </div>

      {/* Chunk + Style config bar */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-neutral-800/60 bg-neutral-950/30 px-3 py-2">
        {/* Chunk mode */}
        <div className="flex items-center gap-2">
          <span className="w-12 font-mono text-[9px] uppercase tracking-widest text-neutral-500">
            Lines
          </span>
          <div className="flex flex-1 flex-wrap items-center gap-0.5 rounded border border-neutral-800 bg-neutral-950/60 p-0.5">
            <button
              type="button"
              onClick={() => handleChunkChange("asWritten", chunkSize)}
              className={cn(
                "rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest transition",
                chunkMode === "asWritten"
                  ? "bg-pink-500/25 text-pink-100"
                  : "text-neutral-500 hover:text-neutral-200",
              )}
              title="Keep paragraph line breaks from the editor"
            >
              As written
            </button>
            <div className="mx-1 h-3 w-px bg-neutral-800" />
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => handleChunkChange("perCount", n)}
                className={cn(
                  "rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest transition",
                  chunkMode === "perCount" && chunkSize === n
                    ? "bg-pink-500/25 text-pink-100"
                    : "text-neutral-500 hover:text-neutral-200",
                )}
                title={`${n} word${n === 1 ? "" : "s"} per line`}
              >
                {n}w
              </button>
            ))}
          </div>
        </div>
        {/* Style picker — 6 thumbnails */}
        <div className="flex items-center gap-2">
          <span className="w-12 font-mono text-[9px] uppercase tracking-widest text-neutral-500">
            Style
          </span>
          <div className="flex flex-1 flex-wrap items-center gap-1">
            {STYLE_LIST.map((s) => {
              const spec = KARAOKE_STYLES[s]
              const active = style === s
              return (
                <Tooltip key={s}>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={() => handleStyleChange(s)}
                        className={cn(
                          "group/style relative flex h-7 flex-1 min-w-[58px] items-center justify-center overflow-hidden rounded border transition",
                          active
                            ? "border-pink-400/70 ring-1 ring-pink-400/40"
                            : "border-neutral-800 hover:border-neutral-700",
                        )}
                      >
                        <div
                          className={cn(
                            "absolute inset-0 bg-gradient-to-br opacity-30 transition",
                            spec.thumb,
                            active ? "opacity-50" : "group-hover/style:opacity-40",
                          )}
                        />
                        <span
                          className={cn(
                            "relative z-10 text-[9px] font-bold uppercase tracking-widest",
                            active ? "text-pink-50" : "text-neutral-200",
                          )}
                        >
                          {spec.label}
                        </span>
                      </button>
                    }
                  />
                  <TooltipContent>{spec.description}</TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        </div>
      </div>

      {/* Lines render — styled via KARAOKE_STYLES[style] */}
      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {lines.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-[11px] text-neutral-500">
            Write some lyrics in Edit mode first
          </div>
        ) : (
          <div
            className={cn("space-y-2.5", styleSpec.container)}
            style={{ fontSize: `${15 * fontScale}px` }}
          >
            {lines.map((line, idx) => {
              const isCursor = recording && idx === cursorIdx
              const isActive = !recording && idx === activeReplayIdx
              const isPast =
                !recording &&
                activeReplayIdx >= 0 &&
                idx < activeReplayIdx
              const isTimed = line.startMs !== null
              const stateClass = isCursor
                ? styleSpec.cursor
                : isActive
                  ? styleSpec.active
                  : isPast
                    ? styleSpec.past
                    : isTimed
                      ? styleSpec.past
                      : styleSpec.pending
              return (
                <div
                  key={idx}
                  data-line-idx={idx}
                  className={cn(
                    "relative inline-block px-2 py-1 transition-colors duration-150",
                    "max-w-full",
                    stateClass,
                  )}
                  title={
                    line.startMs !== null
                      ? `${(line.startMs / 1000).toFixed(2)}s${
                          line.endMs !== null
                            ? ` → ${(line.endMs / 1000).toFixed(2)}s`
                            : ""
                        }`
                      : "not timed"
                  }
                >
                  <KaraokeFill
                    text={line.text || "·"}
                    spec={styleSpec}
                    progress={isActive ? activeProgress : 0}
                    showProgress={isActive}
                  />
                </div>
              )
            })}
            {/* End-of-list spacer for scroll-into-view */}
            <div className="h-32" />
          </div>
        )}
      </div>

      {/* Footer hints */}
      <div className="flex shrink-0 items-center justify-between border-t border-neutral-800 px-4 py-1.5 font-mono text-[9px] uppercase tracking-widest text-neutral-600">
        <span>
          {recording
            ? "Hold Space for each line · release at end · Backspace undo"
            : "Press Play, then start recording"}
        </span>
        <span className="text-neutral-700">auto-saved</span>
      </div>
    </div>

    {/* Fullscreen player overlay */}
    {fullscreen && (
      <FullscreenKaraoke
        lines={lines}
        styleSpec={styleSpec}
        activeIdx={activeReplayIdx}
        activeProgress={activeProgress}
        replayTick={replayTick}
        projectDurationSec={projectDurationSec}
        waveformClips={waveformClips}
        onPlay={onPlay}
        onPause={onPause}
        renderAudio={renderAudio}
        markers={markers}
        onClose={() => setFullscreen(false)}
      />
    )}

    {/* Ritim timeline — alttan açılan tam-genişlik panel */}
    {rhythmOpen && (
      <RhythmTimeline
        lines={lines}
        bpm={bpm ?? 120}
        durationSec={projectDurationSec ?? 0}
        waveformClips={waveformClips}
        onChange={commitLines}
        onClose={() => setRhythmOpen(false)}
      />
    )}
    </>
  )
}

// ─── Karaoke line render — fillMode aware ────────────────────────────────

/**
 * Active satırda progress overlay'ini iki şekilde gösterir:
 *   - "behind": metnin arkasında soldan-sağa renkli rect (klasik)
 *   - "clip":   metnin İÇİNDEKİ rengin soldan-sağa dolması (Apple Music
 *               tarzı; iki katman: base dim + clip-path masked active)
 */
function KaraokeFill({
  text,
  spec,
  progress,
  showProgress,
}: {
  text: string
  spec: StyleSpec
  progress: number
  showProgress: boolean
}) {
  // Transition kullanılmıyor — replayTick rAF her 16ms yeni progress
  // veriyor; CSS transition (80ms) her yeni değeri eski animasyonu yarıda
  // keserek görsel olarak "donmuş gibi" gösterebiliyor. Doğrudan değer
  // değişikliği = 60fps smooth update.
  if (spec.fillMode === "clip" && showProgress) {
    return (
      <span className="relative inline-block">
        <span aria-hidden className="relative z-0">
          {text}
        </span>
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 z-10",
            spec.progressBg,
          )}
          style={{
            clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)`,
            WebkitClipPath: `inset(0 ${(1 - progress) * 100}% 0 0)`,
          }}
        >
          {text}
        </span>
      </span>
    )
  }
  // Behind-fill: text üstte, renkli rect altta. scaleX transform GPU
  // accelerated + layout trigger etmez (width yerine).
  return (
    <span className="relative inline-block">
      <span className="relative z-10">{text}</span>
      {showProgress && progress > 0 && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 z-0 origin-left rounded-l will-change-transform",
            spec.progressBg,
          )}
          style={{
            width: "100%",
            transform: `scaleX(${progress})`,
          }}
        />
      )}
    </span>
  )
}

// ─── Karaoke video export — canvas frame renderer ───────────────────────

/** Karaoke stilinin canvas-renk karşılığı (StyleSpec CSS class → hex/rgba). */
interface ExportPalette {
  font: string
  accent: string
  active: string
  dim: string
  glow: string
  fillMode: "behind" | "clip"
}
const FONT_SANS = "ui-sans-serif, system-ui, sans-serif"
const FONT_MONO = "ui-monospace, SFMono-Regular, Menlo, monospace"
const FONT_SERIF = "Georgia, 'Times New Roman', serif"
const EXPORT_PALETTE: Record<KaraokeStyle, ExportPalette> = {
  classic: { font: FONT_SANS, accent: "#fbbf24", active: "#fef3c7", dim: "rgba(255,255,255,0.26)", glow: "rgba(251,191,36,0.45)", fillMode: "behind" },
  neon: { font: FONT_SANS, accent: "#34d399", active: "#a7f3d0", dim: "rgba(52,211,153,0.22)", glow: "rgba(52,211,153,0.6)", fillMode: "clip" },
  typewriter: { font: FONT_MONO, accent: "#fcd34d", active: "#fef3c7", dim: "rgba(253,230,138,0.24)", glow: "rgba(252,211,77,0.4)", fillMode: "clip" },
  slide: { font: FONT_SANS, accent: "#ffffff", active: "#ffffff", dim: "rgba(255,255,255,0.30)", glow: "rgba(255,255,255,0.45)", fillMode: "behind" },
  vinyl: { font: FONT_SERIF, accent: "#f472b6", active: "#fbcfe8", dim: "rgba(244,114,182,0.26)", glow: "rgba(236,72,153,0.6)", fillMode: "clip" },
  modern: { font: FONT_SANS, accent: "#e5e5e5", active: "#fafafa", dim: "rgba(255,255,255,0.26)", glow: "rgba(255,255,255,0.16)", fillMode: "behind" },
}

/** nowMs'te aktif satır + progress (0..1). Export canvas'ı ve fallback için. */
function computeActiveLine(
  nowMs: number,
  lines: LyricsLineTiming[],
): { idx: number; progress: number } {
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i]!.startMs
    if (s !== null && s <= nowMs) idx = i
  }
  if (idx < 0) return { idx: -1, progress: 0 }
  const l = lines[idx]!
  const start = l.startMs
  const end =
    l.endMs ?? (idx + 1 < lines.length ? lines[idx + 1]!.startMs : null)
  let progress = 1
  if (start !== null && end !== null && end > start) {
    progress = Math.max(0, Math.min(1, (nowMs - start) / (end - start)))
  }
  return { idx, progress }
}

/** Metin maxW'ye sığana kadar font boyutunu küçült (px döner). */
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  base: number,
  font: string,
): number {
  let size = base
  while (size > 22) {
    ctx.font = `700 ${size}px ${font}`
    if (ctx.measureText(text).width <= maxW) break
    size -= 3
  }
  return size
}

/** Karaoke frame'ini canvas'a çiz — stil paletine göre bg glow + prev/next
 *  dim + current fill. `cx` metin merkezi (scene cover için sağ yarı). */
function drawKaraokeFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  lines: LyricsLineTiming[],
  nowMs: number,
  palette: ExportPalette,
  region?: { cx: number; maxW: number },
): void {
  const cx = region?.cx ?? W / 2
  const maxW = region?.maxW ?? W - 220
  ctx.fillStyle = "#050507"
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(cx, H * 0.28, 0, cx, H * 0.28, W * 0.7)
  glow.addColorStop(0, palette.glow.replace(/[\d.]+\)$/, "0.13)"))
  glow.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  const { idx, progress } = computeActiveLine(nowMs, lines)
  const current = idx >= 0 ? lines[idx]! : null
  const prev = idx > 0 ? lines[idx - 1]! : null
  const next =
    idx >= 0 && idx + 1 < lines.length
      ? lines[idx + 1]!
      : idx < 0
        ? (lines.find((l) => l.startMs !== null) ?? null)
        : null

  ctx.textAlign = "center"
  ctx.textBaseline = "middle"

  if (prev?.text) {
    ctx.font = `500 34px ${palette.font}`
    ctx.fillStyle = "rgba(255,255,255,0.20)"
    ctx.fillText(prev.text, cx, H * 0.28, maxW)
  }
  if (next?.text) {
    ctx.font = `600 42px ${palette.font}`
    ctx.fillStyle = "rgba(255,255,255,0.5)"
    ctx.fillText(next.text, cx, H * 0.74, maxW)
  }

  const text = current?.text || "♪"
  const size = fitFontSize(ctx, text, maxW, 88, palette.font)
  ctx.font = `700 ${size}px ${palette.font}`
  const y = H * 0.5
  // Aktif satır glow (stil).
  ctx.save()
  ctx.shadowColor = palette.glow
  ctx.shadowBlur = 22
  ctx.fillStyle = palette.dim
  ctx.fillText(text, cx, y)
  ctx.restore()
  // Sung portion — soldan-sağa stil-renginde clip.
  if (idx >= 0 && progress > 0) {
    const tw = ctx.measureText(text).width
    const x0 = cx - tw / 2
    ctx.save()
    ctx.beginPath()
    ctx.rect(x0, y - size, tw * progress, size * 2)
    ctx.clip()
    ctx.fillStyle = palette.active
    ctx.fillText(text, cx, y)
    ctx.restore()
  }
}

/** AudioBuffer'ı ilk `seconds` saniyeye kırp (export A/V eşit uzunluk). */
function sliceAudioBuffer(buf: AudioBuffer, seconds: number): AudioBuffer {
  const len = Math.min(buf.length, Math.max(1, Math.ceil(seconds * buf.sampleRate)))
  const out = new AudioBuffer({
    length: len,
    numberOfChannels: buf.numberOfChannels,
    sampleRate: buf.sampleRate,
  })
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    out.copyToChannel(buf.getChannelData(ch).subarray(0, len), ch)
  }
  return out
}

/** saniye → "m:ss" (export progress etiketi). */
function fmtClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

type ExportScene = "centered" | "cover" | "kinetic"

interface ExportFrameOpts {
  lines: LyricsLineTiming[]
  nowMs: number
  durationMs: number
  waveBars: Float32Array | null
  markers: { time: number; label: string }[]
  palette: ExportPalette
  scene: ExportScene
  coverImage: HTMLImageElement | null
}

/** Görseli hedef dikdörtgene object-fit:cover ile çiz. */
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const ir = img.width / img.height
  const dr = dw / dh
  let sw: number, sh: number, sx: number, sy: number
  if (ir > dr) {
    sh = img.height
    sw = sh * dr
    sx = (img.width - sw) / 2
    sy = 0
  } else {
    sw = img.width
    sh = sw / dr
    sx = 0
    sy = (img.height - sh) / 2
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
}

/** Alt şerit — audio wave (çalınan kısım stil accent) + wave başında GEÇEN,
 *  sonunda KALAN süre + DURAK (marker) tick+isim. [x0,x1] aralığında çizer. */
function drawWaveStrip(
  ctx: CanvasRenderingContext2D,
  H: number,
  x0: number,
  x1: number,
  opts: Pick<ExportFrameOpts, "nowMs" | "durationMs" | "waveBars" | "markers" | "palette">,
): void {
  const { nowMs, durationMs, waveBars, markers, palette } = opts
  const progress = durationMs > 0 ? Math.min(1, Math.max(0, nowMs / durationMs)) : 0
  const waveW = x1 - x0
  const stripY = H - 74
  const stripH = 46

  if (waveBars && waveBars.length) {
    const bw = waveW / waveBars.length
    for (let i = 0; i < waveBars.length; i++) {
      const h = Math.max(1, (waveBars[i] ?? 0) * stripH)
      const x = x0 + i * bw
      const played = i / waveBars.length <= progress
      ctx.fillStyle = played ? palette.accent : "rgba(255,255,255,0.15)"
      ctx.fillRect(x, stripY + (stripH - h) / 2, Math.max(1, bw * 0.7), h)
    }
  }

  // Geçen (wave başı) + kalan (wave sonu) — progress bar YOK.
  const remainingSec = Math.max(0, durationMs - nowMs) / 1000
  ctx.textBaseline = "alphabetic"
  ctx.font = `600 15px ${palette.font}`
  ctx.fillStyle = palette.active
  ctx.textAlign = "left"
  ctx.fillText(fmtClock(nowMs / 1000), x0, stripY - 8)
  ctx.fillStyle = "rgba(255,255,255,0.55)"
  ctx.textAlign = "right"
  ctx.fillText(`-${fmtClock(remainingSec)}`, x1, stripY - 8)

  // Marker'lar — wave üstünde tick + isim.
  ctx.textAlign = "center"
  ctx.font = `600 13px ${palette.font}`
  ctx.textBaseline = "alphabetic"
  for (const m of markers) {
    if (durationMs <= 0) break
    const mp = (m.time * 1000) / durationMs
    if (mp < 0 || mp > 1) continue
    const x = x0 + waveW * mp
    const active = m.time * 1000 <= nowMs
    ctx.fillStyle = active ? palette.accent : "rgba(255,255,255,0.30)"
    ctx.fillRect(x - 0.5, stripY - 4, 1, stripH + 8)
    ctx.fillStyle = active ? palette.active : "rgba(255,255,255,0.55)"
    ctx.fillText(m.label, x, stripY - 26)
  }
}

/** Kinetik sahne — tek aktif satır büyük, satır aktif olunca pop (scale+fade). */
function drawKineticScene(ctx: CanvasRenderingContext2D, W: number, H: number, opts: ExportFrameOpts): void {
  const { lines, nowMs, palette } = opts
  ctx.fillStyle = "#050507"
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W / 2, H * 0.44, 0, W / 2, H * 0.44, W * 0.6)
  glow.addColorStop(0, palette.glow.replace(/[\d.]+\)$/, "0.16)"))
  glow.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  const { idx, progress } = computeActiveLine(nowMs, lines)
  const current =
    idx >= 0 ? lines[idx]! : (lines.find((l) => l.startMs !== null) ?? null)
  const next = idx >= 0 && idx + 1 < lines.length ? lines[idx + 1]! : null
  const text = current?.text || "♪"
  const startMs = current?.startMs ?? 0
  const age = Math.max(0, nowMs - startMs)
  const intro = Math.min(1, age / 260)
  const ease = 1 - (1 - intro) * (1 - intro)
  const scale = 0.84 + 0.16 * ease
  const cy = H * 0.46

  ctx.save()
  ctx.translate(W / 2, cy)
  ctx.scale(scale, scale)
  ctx.globalAlpha = idx >= 0 ? 0.35 + 0.65 * ease : 0.4
  const size = fitFontSize(ctx, text, (W - 200) / scale, 128, palette.font)
  ctx.font = `800 ${size}px ${palette.font}`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.shadowColor = palette.glow
  ctx.shadowBlur = 34
  ctx.fillStyle = palette.dim
  ctx.fillText(text, 0, 0)
  if (idx >= 0 && progress > 0) {
    const tw = ctx.measureText(text).width
    ctx.save()
    ctx.beginPath()
    ctx.rect(-tw / 2, -size, tw * progress, size * 2)
    ctx.clip()
    ctx.fillStyle = palette.active
    ctx.fillText(text, 0, 0)
    ctx.restore()
  }
  ctx.restore()

  if (next?.text) {
    ctx.globalAlpha = 1
    ctx.font = `500 30px ${palette.font}`
    ctx.fillStyle = "rgba(255,255,255,0.28)"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(next.text, W / 2, H * 0.72, W - 240)
  }

  drawWaveStrip(ctx, H, 90, W - 90, opts)
}

/** Cover sahne — sol yarı albüm kapağı (kullanıcı yükler), sağ yarı karaoke +
 *  wave. YouTube-dostu. Kapak yoksa gradient placeholder. */
function drawCoverScene(ctx: CanvasRenderingContext2D, W: number, H: number, opts: ExportFrameOpts): void {
  const { lines, nowMs, palette, coverImage } = opts
  const splitX = Math.round(W * 0.46)
  // Sağ metin — bg + text (region: sağ yarı merkezi). Sonra sol kapak overlay.
  const cx = Math.round((splitX + W) / 2)
  const maxW = W - splitX - 96
  drawKaraokeFrame(ctx, W, H, lines, nowMs, palette, { cx, maxW })

  // Sol yarı — kapak veya placeholder.
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, splitX, H)
  ctx.clip()
  if (coverImage) {
    drawImageCover(ctx, coverImage, 0, 0, splitX, H)
    // Sağa doğru hafif karartma (metin paneline yumuşak geçiş).
    const fade = ctx.createLinearGradient(splitX - 140, 0, splitX, 0)
    fade.addColorStop(0, "rgba(5,5,7,0)")
    fade.addColorStop(1, "rgba(5,5,7,0.85)")
    ctx.fillStyle = fade
    ctx.fillRect(splitX - 140, 0, 140, H)
  } else {
    const g = ctx.createLinearGradient(0, 0, splitX, H)
    g.addColorStop(0, palette.glow.replace(/[\d.]+\)$/, "0.35)"))
    g.addColorStop(1, "rgba(10,10,14,1)")
    ctx.fillStyle = g
    ctx.fillRect(0, 0, splitX, H)
    ctx.fillStyle = "rgba(255,255,255,0.14)"
    ctx.font = `700 120px ${palette.font}`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("♪", splitX / 2, H / 2)
  }
  ctx.restore()

  // Sağ yarı wave şeridi.
  drawWaveStrip(ctx, H, splitX + 40, W - 60, opts)
}

/**
 * Export frame'i — SCENE'e göre layout (centered / cover / kinetic). Metin
 * seçili karaoke stilinin paletiyle; alt şeritte audio wave + geçen/kalan
 * süre + durak (marker) etiketleri. Yalnız export'ta (canlı fullscreen DOM).
 */
function drawKaraokeExportFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  opts: ExportFrameOpts,
): void {
  if (opts.scene === "cover") {
    drawCoverScene(ctx, W, H, opts)
    return
  }
  if (opts.scene === "kinetic") {
    drawKineticScene(ctx, W, H, opts)
    return
  }
  // centered (varsayılan)
  drawKaraokeFrame(ctx, W, H, opts.lines, opts.nowMs, opts.palette)
  drawWaveStrip(ctx, H, 90, W - 90, opts)
}

// ─── Rhythm timeline — beat-aware lyric editor ──────────────────────────

/**
 * Alttan açılan tam-genişlik ritim editörü. Proje BPM'inden beat/bar grid
 * çizer, arkada master waveform underlay (aggregateTimelinePeaks), her timed
 * satırı sürüklenebilir/boyutlandırılabilir blok olarak timeline'a yerleştirir.
 * Beat'e denk gelmeyen satır highlight + offset rozeti + "snap to beat".
 * Playhead transport pozisyonunu izler; cetvele tıkla → seek.
 */
function RhythmTimeline({
  lines,
  bpm,
  durationSec,
  waveformClips,
  onChange,
  onClose,
}: {
  lines: LyricsLineTiming[]
  bpm: number
  durationSec: number
  waveformClips?: AggregateClipInput[]
  onChange(next: LyricsLineTiming[]): void
  onClose(): void
}) {
  const beatSec = 60 / Math.max(30, Math.min(300, bpm || 120))
  const [pps, setPps] = useState(90) // px / saniye (zoom)
  const [snap, setSnap] = useState(true)
  const [draft, setDraft] = useState<LyricsLineTiming[]>(lines)
  const [peaks, setPeaks] = useState<Float32Array | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const playheadRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<
    | { idx: number; mode: "move" | "start" | "end"; x0: number; s0: number; e0: number }
    | null
  >(null)

  const RULER_H = 22
  const TRACK_H = 104

  // Dışarıdan lines değişince (drag yokken) draft'ı senkronla.
  useEffect(() => {
    if (!dragRef.current) setDraft(lines)
  }, [lines])

  const lastEndSec = draft.reduce((mx, l) => {
    const e = l.endMs ?? l.startMs
    return e !== null && e / 1000 > mx ? e / 1000 : mx
  }, 0)
  const totalSec = Math.max(durationSec, lastEndSec + 4, 8)
  const width = Math.ceil(totalSec * pps)

  const nearestBeatSec = useCallback(
    (sec: number) => Math.round(sec / beatSec) * beatSec,
    [beatSec],
  )
  const tol = Math.min(0.08, beatSec * 0.18)
  const offsetMs = (startMs: number) => {
    const sec = startMs / 1000
    return Math.round((sec - nearestBeatSec(sec)) * 1000)
  }
  const isOffBeat = (startMs: number | null) =>
    startMs !== null && Math.abs(offsetMs(startMs)) > tol * 1000

  // Waveform peaks (async fetch, cache'li).
  useEffect(() => {
    let cancelled = false
    if (!waveformClips || waveformClips.length === 0) {
      setPeaks(null)
      return
    }
    aggregateTimelinePeaks(waveformClips, totalSec, Math.min(4000, Math.ceil(width / 2)))
      .then((p) => {
        if (!cancelled) setPeaks(p)
      })
      .catch(() => {
        if (!cancelled) setPeaks(null)
      })
    return () => {
      cancelled = true
    }
  }, [waveformClips, totalSec, width])

  // Waveform + beat/bar grid canvas.
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = Math.max(1, width * dpr)
    c.height = TRACK_H * dpr
    const ctx = c.getContext("2d")
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, TRACK_H)
    if (peaks && peaks.length) {
      const bars = peaksToBars(peaks, Math.max(1, Math.ceil(width / 2)))
      const bw = width / bars.length
      ctx.fillStyle = "rgba(236,72,153,0.14)"
      for (let i = 0; i < bars.length; i++) {
        const h = (bars[i] ?? 0) * TRACK_H * 0.82
        ctx.fillRect(i * bw, (TRACK_H - h) / 2, Math.max(1, bw * 0.8), h)
      }
    }
    const beats = Math.floor(totalSec / beatSec)
    for (let i = 0; i <= beats; i++) {
      const x = i * beatSec * pps
      const bar = i % 4 === 0
      ctx.strokeStyle = bar ? "rgba(255,255,255,0.17)" : "rgba(255,255,255,0.055)"
      ctx.lineWidth = bar ? 1.5 : 1
      ctx.beginPath()
      ctx.moveTo(x + 0.5, 0)
      ctx.lineTo(x + 0.5, TRACK_H)
      ctx.stroke()
    }
  }, [peaks, width, totalSec, beatSec, pps])

  // Playhead — transport pozisyonu.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const x = getTransportPosition() * pps
      if (playheadRef.current)
        playheadRef.current.style.transform = `translateX(${x}px)`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [pps])

  // Drag (window listener) — move / resize-start / resize-end.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const deltaMs = ((e.clientX - d.x0) / pps) * 1000
      setDraft((prev) =>
        prev.map((l, i) => {
          if (i !== d.idx) return l
          let s = d.s0
          let en = d.e0
          if (d.mode === "move") {
            s = d.s0 + deltaMs
            en = d.e0 + deltaMs
            if (snap) {
              const snapped = nearestBeatSec(s / 1000) * 1000
              en += snapped - s
              s = snapped
            }
          } else if (d.mode === "start") {
            s = d.s0 + deltaMs
            if (snap) s = nearestBeatSec(s / 1000) * 1000
            s = Math.min(s, en - 120)
          } else {
            en = d.e0 + deltaMs
            if (snap) en = nearestBeatSec(en / 1000) * 1000
            en = Math.max(en, s + 120)
          }
          s = Math.max(0, s)
          return { ...l, startMs: Math.round(s), endMs: Math.round(en) }
        }),
      )
    }
    const onUp = () => {
      if (dragRef.current) {
        dragRef.current = null
        setDraft((cur) => {
          onChange(cur)
          return cur
        })
      }
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [pps, snap, onChange, nearestBeatSec])

  const startDrag = (
    e: React.PointerEvent,
    idx: number,
    mode: "move" | "start" | "end",
  ) => {
    e.preventDefault()
    e.stopPropagation()
    const l = draft[idx]
    if (!l || l.startMs === null) return
    dragRef.current = {
      idx,
      mode,
      x0: e.clientX,
      s0: l.startMs,
      e0: l.endMs ?? l.startMs + beatSec * 1000,
    }
  }

  const snapToBeat = (idx: number) => {
    setDraft((prev) => {
      const next = prev.map((l, i) => {
        if (i !== idx || l.startMs === null) return l
        const s = Math.round(nearestBeatSec(l.startMs / 1000) * 1000)
        const dur = (l.endMs ?? l.startMs) - l.startMs
        return { ...l, startMs: s, endMs: l.endMs !== null ? s + dur : l.endMs }
      })
      onChange(next)
      return next
    })
  }

  const timed = draft
    .map((l, i) => ({ l, i }))
    .filter((x) => x.l.startMs !== null)
  const offCount = timed.filter((x) => isOffBeat(x.l.startMs)).length
  const bars = Math.floor(totalSec / (beatSec * 4)) + 1

  const seekAt = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    transportSeek(Math.max(0, x / pps))
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[190] flex h-[44vh] flex-col border-t border-neutral-800 bg-neutral-950/95 shadow-2xl backdrop-blur">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-800 px-3 py-2">
        <div className="flex items-center gap-1.5 text-neutral-300">
          <HugeiconsIcon icon={ChartHistogramIcon} size={14} className="text-pink-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest">
            Rhythm
          </span>
        </div>
        <span className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
          {Math.round(bpm)} BPM
        </span>
        {offCount > 0 ? (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
            {offCount} off-beat
          </span>
        ) : (
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
            on beat
          </span>
        )}
        <button
          type="button"
          onClick={() => setSnap((s) => !s)}
          className={cn(
            "rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest transition",
            snap
              ? "border-pink-500/50 bg-pink-500/15 text-pink-200"
              : "border-neutral-700 text-neutral-400 hover:bg-neutral-800",
          )}
          title="Snap edges to the beat grid"
        >
          Snap {snap ? "on" : "off"}
        </button>
        <div className="flex items-center gap-0.5 rounded border border-neutral-800 p-0.5">
          <button
            type="button"
            onClick={() => setPps((p) => Math.max(30, Math.round(p * 0.8)))}
            className="flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
            title="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => setPps((p) => Math.min(400, Math.round(p * 1.25)))}
            className="flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
            title="Zoom in"
          >
            +
          </button>
        </div>
        <span className="hidden text-[10px] text-neutral-600 sm:inline">
          Drag to move · drag edges to resize · click ruler to seek
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ms-auto flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={11} />
          Close
        </button>
      </div>

      {/* Timeline scroll area */}
      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden"
      >
        <div className="relative" style={{ width, height: RULER_H + TRACK_H }}>
          {/* Ruler — bar numaraları + seek */}
          <div
            onClick={seekAt}
            className="absolute left-0 top-0 cursor-pointer border-b border-neutral-800/80 bg-neutral-900/40"
            style={{ width, height: RULER_H }}
          >
            {Array.from({ length: bars }, (_, b) => (
              <span
                key={b}
                className="absolute top-0 select-none pl-1 font-mono text-[9px] leading-[22px] text-neutral-600"
                style={{ left: b * beatSec * 4 * pps }}
              >
                {b + 1}
              </span>
            ))}
          </div>

          {/* Waveform + beat grid canvas */}
          <canvas
            ref={canvasRef}
            className="absolute left-0"
            style={{ top: RULER_H, width, height: TRACK_H }}
          />

          {/* Lyric blocks */}
          {timed.map(({ l, i }) => {
            const s = l.startMs! / 1000
            const en = (l.endMs ?? l.startMs! + beatSec * 1000) / 1000
            const left = s * pps
            const w = Math.max(8, (en - s) * pps)
            const off = isOffBeat(l.startMs)
            return (
              <div
                key={i}
                onPointerDown={(e) => startDrag(e, i, "move")}
                className={cn(
                  "group/blk absolute flex cursor-grab items-center overflow-hidden rounded-md border text-[10px] active:cursor-grabbing",
                  off
                    ? "border-amber-500/70 bg-amber-500/20 text-amber-100"
                    : "border-pink-500/50 bg-pink-500/25 text-pink-50",
                )}
                style={{ left, width: w, top: RULER_H + 10, height: TRACK_H - 20 }}
                title={l.text}
              >
                {/* Resize-start handle */}
                <span
                  onPointerDown={(e) => startDrag(e, i, "start")}
                  className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize bg-white/20 opacity-0 group-hover/blk:opacity-100"
                />
                <span className="pointer-events-none truncate px-2">{l.text || "·"}</span>
                {off ? (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => snapToBeat(i)}
                    title="Snap to nearest beat"
                    className="absolute right-1 top-0.5 rounded bg-amber-500/30 px-1 font-mono text-[8px] text-amber-100 hover:bg-amber-500/50"
                  >
                    {offsetMs(l.startMs!) > 0 ? "+" : ""}
                    {offsetMs(l.startMs!)}ms
                  </button>
                ) : null}
                {/* Resize-end handle */}
                <span
                  onPointerDown={(e) => startDrag(e, i, "end")}
                  className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize bg-white/20 opacity-0 group-hover/blk:opacity-100"
                />
              </div>
            )
          })}

          {/* Playhead */}
          <div
            ref={playheadRef}
            className="pointer-events-none absolute left-0 top-0 z-10 w-px bg-pink-400"
            style={{ height: RULER_H + TRACK_H }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Fullscreen karaoke player ───────────────────────────────────────────

function FullscreenKaraoke({
  lines,
  styleSpec,
  activeIdx,
  activeProgress,
  replayTick,
  projectDurationSec,
  waveformClips,
  onPlay,
  onPause,
  renderAudio,
  markers,
  onClose,
}: {
  lines: LyricsLineTiming[]
  styleSpec: (typeof KARAOKE_STYLES)[KaraokeStyle]
  activeIdx: number
  activeProgress: number
  replayTick: number
  projectDurationSec?: number
  waveformClips?: AggregateClipInput[]
  onPlay?: () => void | Promise<void>
  onPause?: () => void
  /** Offline mix AudioBuffer — video export sesi (real-time capture DEĞİL). */
  renderAudio?: () => Promise<AudioBuffer>
  /** Proje marker'ları (durak etiketleri) — export frame'inde gösterilir. */
  markers?: { time: number; label: string }[]
  onClose(): void
}) {
  // Transport state — replayTick parent'tan rAF ile her frame artıyor, snapshot.
  void replayTick
  const transportState = getTransportState()
  const transportSec = getTransportPosition()
  const nowMs = transportSec * 1000

  // Player seek slider max: projectDurationSec → son timed line + 30s fallback
  const inferredDuration = useMemo(() => {
    let last = 0
    for (const l of lines) {
      const e = l.endMs ?? l.startMs
      if (e !== null && Number.isFinite(e) && e > last) last = e
    }
    return Math.max(30, Math.ceil(last / 1000) + 30)
  }, [lines])
  const duration = projectDurationSec ?? inferredDuration

  // Eğer activeIdx -1 ama transport çalıyorsa: yaklaşan ilk satır
  const upcomingIdx = useMemo(() => {
    if (activeIdx >= 0) return -1
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!
      if (l.startMs !== null && l.startMs >= nowMs) return i
    }
    return -1
  }, [activeIdx, lines, nowMs])

  // Görüntülenecek "etrafındaki" satırlar — prev / current / next
  const displayCenterIdx = activeIdx >= 0 ? activeIdx : upcomingIdx
  const prev = displayCenterIdx > 0 ? lines[displayCenterIdx - 1] : null
  const current = displayCenterIdx >= 0 ? lines[displayCenterIdx] : null
  const next =
    displayCenterIdx >= 0 && displayCenterIdx + 1 < lines.length
      ? lines[displayCenterIdx + 1]
      : null

  // Pre-song gap — şarkının başında ilk satıra kadar olan sessizlik.
  // activeIdx < 0 (henüz hiçbir satır aktif değil) + ilk timed line var.
  const preGap = useMemo(() => {
    if (activeIdx >= 0) return null
    // İlk timed line'ı bul
    const firstTimed = lines.find((l) => l.startMs !== null)
    if (!firstTimed || firstTimed.startMs === null) return null
    if (nowMs >= firstTimed.startMs) return null
    const totalMs = firstTimed.startMs
    const remainingMs = firstTimed.startMs - nowMs
    const progress = Math.max(
      0,
      Math.min(1, (totalMs - remainingMs) / Math.max(1, totalMs)),
    )
    return { totalMs, remainingMs, progress }
  }, [activeIdx, lines, nowMs])

  // Gap progress bar — current.endMs ile next.startMs arası boşluk.
  // Sleek horizontal bar — kalan süre etiketi + gradient fill.
  const gap = useMemo(() => {
    if (!current || !next) return null
    const endMs = current.endMs ?? current.startMs
    if (endMs === null || next.startMs === null) return null
    const gapMs = next.startMs - endMs
    if (gapMs <= 200) return null
    let progress = 0
    let remainingMs = gapMs
    if (nowMs >= endMs) {
      progress = Math.min(1, Math.max(0, (nowMs - endMs) / gapMs))
      remainingMs = Math.max(0, next.startMs - nowMs)
    }
    return { gapMs, remainingMs, progress }
  }, [current, next, nowMs])

  const togglePlay = useCallback(async () => {
    if (transportState === "started") {
      // Parent'ın pause'u (isPlaying state'ini de senkron tutar); yoksa
      // doğrudan transport.
      if (onPause) onPause()
      else transportPause()
    } else {
      // Parent'ın TAM play path'i (ensureAudio + clip scheduling). Ana
      // player'dan hiç çalınmamış olsa bile fullscreen'de ses gelir.
      if (onPlay) await onPlay()
      else await transportPlay()
    }
  }, [transportState, onPlay, onPause])

  // ── Video export — OFFLINE frame-by-frame (mediabunny/WebCodecs) ──
  // Real-time MediaRecorder+captureStream ~60s sonra video track'i durduruyordu
  // (bilinen sinir → "1 dakikadan sonra donma"). OpenCut yaklaşimi: her frame
  // deterministik cizilir + VideoEncoder ile encode edilir (CanvasSource), ses
  // offline mix buffer'dan (renderProject) gelir → real-time YOK, her uzunlukta
  // sorunsuz. Ciktiya dogrudan MP4 (H.264+AAC) — WebM ara adim yok.
  const [exportPhase, setExportPhase] = useState<"idle" | "preparing" | "rendering">("idle")
  const [exportPct, setExportPct] = useState(0)
  const exporting = exportPhase !== "idle"
  const exportCancelRef = useRef(false)
  const stopExport = useCallback(() => {
    exportCancelRef.current = true
  }, [])
  // Sahne + albüm kapağı (cover scene için).
  const [scene, setScene] = useState<ExportScene>("centered")
  const [coverImage, setCoverImage] = useState<HTMLImageElement | null>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const onPickCover = useCallback((file?: File | null) => {
    if (!file) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      setCoverImage(img)
      // decode sonrası objectURL'i bırakma — img yeniden çizilecek; revoke
      // etmeyelim (drawImage img'i kullanır). Küçük bir sızıntı, kabul.
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      toast.error("Couldn't load that image")
    }
    img.src = url
  }, [])
  const startExport = useCallback(async () => {
    if (exporting) return
    if (!lines.some((l) => l.startMs !== null)) {
      toast.error("No timing yet — sync the karaoke first")
      return
    }
    exportCancelRef.current = false
    setExportPhase("preparing")
    setExportPct(0)
    const tid = toast.loading("Rendering audio…")
    try {
      const {
        Output,
        Mp4OutputFormat,
        BufferTarget,
        CanvasSource,
        AudioBufferSource,
        QUALITY_HIGH,
      } = await import("mediabunny")

      // Ses: offline mix buffer (real-time capture DEĞİL → freeze yok).
      let audioBuffer: AudioBuffer | null = null
      if (renderAudio) {
        try {
          audioBuffer = await renderAudio()
        } catch {
          audioBuffer = null
        }
      }
      if (exportCancelRef.current) {
        toast.dismiss(tid)
        return
      }

      const lastEndMs = lines.reduce((mx, l) => {
        const e = l.endMs ?? l.startMs
        return e !== null && Number.isFinite(e) && e > mx ? e : mx
      }, 0)
      const lyricsEndSec = lastEndMs / 1000 + 3
      // TÜM şarkı boyunca export et (ses varsa audio süresi) — eskiden son
      // sözde kesiyordu. Ses yoksa sözlerin bitişi + 3s fallback.
      const durationSec = audioBuffer
        ? audioBuffer.duration
        : Math.max(lyricsEndSec, 4)
      const durationMs = durationSec * 1000
      const palette = EXPORT_PALETTE[styleSpec.id]

      // Waveform bar'ları (export frame'inin alt şeridinde çizilir).
      let waveBars: Float32Array | null = null
      if (waveformClips && waveformClips.length) {
        try {
          const pk = await aggregateTimelinePeaks(waveformClips, durationSec, 1600)
          waveBars = peaksToBars(pk, 1600)
        } catch {
          waveBars = null
        }
      }
      if (exportCancelRef.current) {
        toast.dismiss(tid)
        return
      }

      const W = 1280
      const H = 720
      const FPS = 30
      const canvas = document.createElement("canvas")
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        toast.error("Canvas unavailable", { id: tid })
        return
      }

      const output = new Output({
        format: new Mp4OutputFormat(),
        target: new BufferTarget(),
      })
      const videoSource = new CanvasSource(canvas, {
        codec: "avc",
        bitrate: QUALITY_HIGH,
      })
      output.addVideoTrack(videoSource, { frameRate: FPS })
      const trimmed = audioBuffer ? sliceAudioBuffer(audioBuffer, durationSec) : null
      let audioSource: InstanceType<typeof AudioBufferSource> | null = null
      if (trimmed) {
        audioSource = new AudioBufferSource({ codec: "aac", bitrate: QUALITY_HIGH })
        output.addAudioTrack(audioSource)
      }
      await output.start()
      if (audioSource && trimmed) await audioSource.add(trimmed)

      setExportPhase("rendering")
      toast.loading("Rendering video…", { id: tid })
      const frameCount = Math.max(1, Math.ceil(durationSec * FPS))
      for (let i = 0; i < frameCount; i++) {
        if (exportCancelRef.current) break
        const tSec = i / FPS
        drawKaraokeExportFrame(ctx, W, H, {
          lines,
          nowMs: tSec * 1000,
          durationMs,
          waveBars,
          markers: markers ?? [],
          palette,
          scene,
          coverImage,
        })
        await videoSource.add(tSec, 1 / FPS)
        setExportPct(Math.round((i / frameCount) * 100))
        // UI'ya nefes aldır (encoder queue + React güncelleme).
        if (i % 8 === 0) await new Promise((r) => setTimeout(r, 0))
      }

      if (exportCancelRef.current) {
        await output.cancel()
        toast.dismiss(tid)
        return
      }
      await output.finalize()
      const buf = output.target.buffer
      if (!buf) {
        toast.error("Export produced no output", { id: tid })
        return
      }
      const blob = new Blob([buf], { type: "video/mp4" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "karaoke.mp4"
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Karaoke video exported", { id: tid })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed", { id: tid })
    } finally {
      setExportPhase("idle")
      setExportPct(0)
    }
  }, [exporting, lines, renderAudio, waveformClips, markers, styleSpec.id, scene, coverImage])

  const fmtTime = (sec: number): string => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[200] flex flex-col"
      style={{
        background:
          "radial-gradient(ellipse at top, rgba(236, 72, 153, 0.10) 0%, transparent 60%), linear-gradient(180deg, rgba(8, 8, 10, 0.98) 0%, rgba(2, 2, 4, 1) 100%)",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Top bar — minimal: title + style indicator + close */}
      <div className="flex shrink-0 items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3 text-neutral-400">
          <HugeiconsIcon icon={Mic01Icon} size={14} className="text-pink-400" />
          <span className="text-[11px] font-bold uppercase tracking-[0.2em]">
            Karaoke · {styleSpec.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Sahne seçici + (cover ise) albüm kapağı — yalnız idle iken. */}
          {!exporting && (
            <>
              <div className="flex items-center gap-0.5 rounded-md border border-neutral-800 p-0.5">
                {(
                  [
                    ["centered", "Center"],
                    ["cover", "Cover"],
                    ["kinetic", "Kinetic"],
                  ] as const
                ).map(([s, label]) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScene(s)}
                    className={cn(
                      "rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest transition",
                      scene === s
                        ? "bg-pink-500/20 text-pink-200"
                        : "text-neutral-500 hover:text-neutral-200",
                    )}
                    title={`${label} layout`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {scene === "cover" && (
                <>
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    className="flex items-center gap-1 rounded-md border border-neutral-800 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-neutral-300 transition hover:bg-neutral-800"
                    title="Album cover image (left half)"
                  >
                    {coverImage ? "Cover ✓" : "Cover image…"}
                  </button>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      onPickCover(e.target.files?.[0])
                      e.target.value = ""
                    }}
                  />
                </>
              )}
            </>
          )}
          {exportPhase === "preparing" ? (
            <span className="flex items-center gap-2 rounded-md border border-pink-500/40 bg-pink-500/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-pink-200">
              <span className="size-3 animate-spin rounded-full border-2 border-pink-300/40 border-t-pink-200" />
              Rendering audio…
            </span>
          ) : exportPhase === "rendering" ? (
            <button
              type="button"
              onClick={stopExport}
              className="flex items-center gap-2 rounded-md border border-red-500/50 bg-red-500/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-red-300 transition hover:bg-red-500/25"
              title="Cancel export"
            >
              <span className="size-1.5 animate-pulse rounded-full bg-red-400" />
              Rendering {exportPct}% · Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startExport()}
              className="flex items-center gap-2 rounded-md border border-pink-500/40 bg-pink-500/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-pink-200 transition hover:border-pink-400/60 hover:bg-pink-500/25"
              title="Export karaoke as an MP4 video (offline render — audio wave, progress, markers baked in)"
            >
              <HugeiconsIcon icon={Download01Icon} size={11} />
              Export video
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={exporting}
            className="flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400 transition hover:border-neutral-700 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-40"
            title="Exit fullscreen (ESC)"
          >
            <HugeiconsIcon icon={Minimize01Icon} size={11} />
            Exit
          </button>
        </div>
      </div>

      {/* Center — prev / active / gap / next */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-7 px-8">
        {/* Pre-song gap — şarkı başında ilk satıra kadar countdown */}
        {preGap && (
          <GapProgressBar
            spec={styleSpec}
            progress={preGap.progress}
            remainingMs={preGap.remainingMs}
            label="Starts in"
          />
        )}

        {/* Prev line — faded above (smaller, subtler) */}
        <div
          className={cn(
            "max-w-3xl text-center text-xl opacity-30 transition-opacity duration-300 md:text-2xl",
            styleSpec.container,
            styleSpec.past,
          )}
          style={{ minHeight: "1.4em" }}
        >
          {prev?.text ?? ""}
        </div>

        {/* Active (current) line — centered + largest */}
        <div
          className={cn(
            "relative max-w-5xl text-center text-5xl leading-tight md:text-6xl",
            styleSpec.container,
            current && activeIdx >= 0
              ? styleSpec.fillMode === "clip"
                ? styleSpec.active
                : styleSpec.active
              : styleSpec.pending,
          )}
        >
          {current ? (
            <span className="relative inline-block px-3 py-2">
              <KaraokeFill
                text={current.text || "·"}
                spec={styleSpec}
                progress={activeIdx >= 0 ? activeProgress : 0}
                showProgress={activeIdx >= 0}
              />
            </span>
          ) : (
            <span className="opacity-30">— · —</span>
          )}
        </div>

        {/* Inter-line gap — current end → next start (sleek progress bar) */}
        {gap && (
          <GapProgressBar
            spec={styleSpec}
            progress={gap.progress}
            remainingMs={gap.remainingMs}
            label="Next in"
          />
        )}

        {/* Next line — readable color (not muted). Sırası gelince
            styleSpec.active devreye girince zaten büyür + background alır.
            styleSpec.container ÖNCE yazıldı; sonraki text-color class
            tailwind-merge ile kazanır. */}
        <div
          className={cn(
            styleSpec.container,
            "max-w-4xl text-center text-3xl text-neutral-200 transition-colors duration-300 md:text-4xl",
          )}
          style={{ minHeight: "1.4em" }}
        >
          {next?.text ?? ""}
        </div>
      </div>

      {/* Bottom — waveform overview + transport player */}
      <div className="shrink-0 border-t border-neutral-800/60 bg-neutral-950/60 px-6 py-3 backdrop-blur">
        <div className="mx-auto max-w-6xl space-y-2">
          {/* Master mini-waveform — full-width clip peaks aggregate */}
          <WaveformOverview
            clips={waveformClips}
            totalSec={duration}
            transportSec={transportSec}
            lines={lines}
            spec={styleSpec}
            onSeek={transportSeek}
          />
          {/* Player controls — play/pause + time only (seek artık waveform'da) */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={togglePlay}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-pink-500/20 text-pink-200 ring-1 ring-pink-400/40 transition hover:bg-pink-500/35 hover:ring-pink-300/70"
              title={
                transportState === "started" ? "Pause (Space)" : "Play (Space)"
              }
            >
              <HugeiconsIcon
                icon={transportState === "started" ? PauseIcon : PlayIcon}
                size={18}
              />
            </button>
            <span className="font-mono text-[10px] tabular-nums text-neutral-400">
              {fmtTime(transportSec)}
            </span>
            <div className="flex-1" />
            <span className="font-mono text-[10px] tabular-nums text-neutral-500">
              {fmtTime(duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sleek gap progress bar (between lines or pre-song) ──────────────────

function GapProgressBar({
  spec,
  progress,
  remainingMs,
  label,
}: {
  spec: StyleSpec
  progress: number
  remainingMs: number
  label: string
}) {
  const remainingSec = Math.max(0, remainingMs / 1000)
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-2">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-neutral-500">
          {label}
        </span>
        <span className="font-mono text-sm tabular-nums text-neutral-300">
          {remainingSec.toFixed(1)}s
        </span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-neutral-800/80">
        <div
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-0 origin-left rounded-full shadow-[0_0_18px_currentColor] will-change-transform",
            spec.accentBg,
          )}
          // Width yerine transform: scaleX — GPU-accelerated + layout
          // trigger etmez. transition yok çünkü rAF her frame yeni değer
          // veriyor; CSS transition interrupted-by-next-value oluyordu
          // ve bar görsel olarak donmuş gibi görünüyordu.
          style={{
            width: "100%",
            transform: `scaleX(${progress})`,
          }}
        />
      </div>
    </div>
  )
}

// ─── Waveform overview — aggregated clip peaks + line markers + playhead ─

function WaveformOverview({
  clips,
  totalSec,
  transportSec,
  lines,
  spec,
  onSeek,
}: {
  clips: AggregateClipInput[] | undefined
  totalSec: number
  transportSec: number
  lines: LyricsLineTiming[]
  spec: StyleSpec
  onSeek(sec: number): void
}) {
  const TARGET_BARS = 240
  const [aggregated, setAggregated] = useState<Float32Array | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!clips || clips.length === 0 || totalSec <= 0) {
      setAggregated(null)
      return
    }
    void aggregateTimelinePeaks(clips, totalSec, TARGET_BARS).then((peaks) => {
      if (!cancelled) setAggregated(peaks)
    })
    return () => {
      cancelled = true
    }
    // clips referansı her parent render'da değişebilir; serileştirme yerine
    // length + first/last mediaId hash'ini dep olarak kullanmak overkill,
    // basit length + totalSec yeterli (cache zaten aynı mediaId'leri instant döner).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips?.length, totalSec])

  const bars = useMemo(
    () => peaksToBars(aggregated, TARGET_BARS),
    [aggregated],
  )

  const playheadPct =
    totalSec > 0
      ? Math.max(0, Math.min(100, (transportSec / totalSec) * 100))
      : 0

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = containerRef.current
      if (!el || totalSec <= 0) return
      const rect = el.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      onSeek(ratio * totalSec)
    },
    [onSeek, totalSec],
  )

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className="relative h-14 w-full cursor-pointer overflow-hidden rounded-md border border-neutral-800/80 bg-neutral-950/40"
      title="Click to seek"
    >
      {/* Bars — past (left of playhead) tinted; future neutral */}
      {bars.length > 0 ? (
        <div className="absolute inset-0 flex items-center px-1">
          {Array.from(bars).map((v, i) => {
            const barPct = (i / bars.length) * 100
            const isPast = barPct <= playheadPct
            const h = Math.max(2, v * 100)
            return (
              <div
                key={i}
                className="mx-[0.5px] flex-1 rounded-[1px] transition-colors"
                style={{
                  height: `${h}%`,
                  background: isPast
                    ? "rgb(244 114 182 / 0.85)"
                    : "rgb(115 115 115 / 0.55)",
                  boxShadow: isPast
                    ? "0 0 6px rgba(244, 114, 182, 0.4)"
                    : "none",
                }}
              />
            )
          })}
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center font-mono text-[9px] uppercase tracking-widest text-neutral-600">
          {clips && clips.length > 0 ? "Loading waveform…" : "No audio loaded"}
        </div>
      )}

      {/* Line markers — küçük dikey çentikler her timed line'ın startMs'inde */}
      {totalSec > 0 &&
        lines.map((l, i) => {
          if (l.startMs === null) return null
          const pct = ((l.startMs / 1000) / totalSec) * 100
          if (pct < 0 || pct > 100) return null
          return (
            <div
              key={i}
              className="pointer-events-none absolute top-0 h-full w-px bg-neutral-50/20"
              style={{ left: `${pct}%` }}
            />
          )
        })}

      {/* Playhead */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 h-full w-0.5 bg-pink-300 shadow-[0_0_10px_rgba(244,114,182,0.8)]"
        style={{ left: `${playheadPct}%` }}
      />
      {/* Trail underline — styleSpec accent */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-0.5 opacity-60",
          spec.accentBg,
        )}
        style={{ width: `${playheadPct}%` }}
      />
    </div>
  )
}

function VersionTab({
  version,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  version: LyricsVersion
  active: boolean
  onSelect(): void
  onRename(next: string): void
  onDelete(): void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(version.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setDraft(version.title)
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 0)
    }
  }, [editing, version.title])

  const commit = useCallback(() => {
    const t = draft.trim()
    if (t && t !== version.title && t.length <= 120) onRename(t)
    setEditing(false)
  }, [draft, version.title, onRename])

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
        maxLength={120}
        className="shrink-0 rounded border border-pink-500/60 bg-neutral-950 px-2 py-0.5 text-[11px] font-medium text-pink-200 outline-none"
        style={{ width: Math.max(80, draft.length * 8 + 30) }}
      />
    )
  }

  return (
    <div
      className={cn(
        "group/tab flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 transition",
        active
          ? "border-pink-500/60 bg-pink-500/15 text-pink-200 shadow-[0_0_18px_rgba(236,72,153,0.18)]"
          : "border-neutral-800 bg-neutral-900/40 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={() => setEditing(true)}
        className="max-w-[140px] truncate text-[11px] font-medium"
        title={`${version.title} · double-click to rename`}
      >
        {version.title}
      </button>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="opacity-0 transition hover:text-pink-200 group-hover/tab:opacity-100"
        title="Rename"
      >
        <HugeiconsIcon icon={Edit02Icon} size={9} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="opacity-0 transition hover:text-red-400 group-hover/tab:opacity-100"
        title="Delete version"
      >
        <HugeiconsIcon icon={Delete01Icon} size={9} />
      </button>
    </div>
  )
}
