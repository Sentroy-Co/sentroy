"use client"

import { useCallback, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { motion, AnimatePresence, LayoutGroup } from "framer-motion"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  MusicNote01Icon,
  Download01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Add01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons"
import { encodeWav, encodeMp3 } from "@/lib/tools/audio-encode"

/**
 * tools.sentroy.com — Audio Converter (client/WASM, server'a yükleme YOK).
 * WebAudio `decodeAudioData` herhangi bir ses/video (mp3/wav/m4a/mp4/ogg…)
 * dosyasını PCM'e çözer; çıktı MP3 (lamejs, bitrate) veya WAV (lossless). Tek
 * bileşen birden çok SEO sayfasını besler (mp4-to-mp3, mp3-to-wav, video→audio).
 * `outputs` 1 ise sabit format; >1 ise format seçici gösterilir. Çoklu dosya.
 */

type Out = "mp3" | "wav"
type Status = "pending" | "working" | "done" | "error"

interface Entry {
  id: number
  file: File
  status: Status
  progress: number
  result?: { url: string; size: number; name: string }
}

const MP3_BITRATES = [320, 192, 128]

function humanSize(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(2)} MB`
}

export function AudioConverterTool({ outputs, accept }: { outputs: Out[]; accept: string }) {
  const t = useTranslations("d")
  const idRef = useRef(0)
  const [entries, setEntries] = useState<Entry[]>([])
  const [output, setOutput] = useState<Out>(outputs[0]!)
  const [bitrate, setBitrate] = useState(192)
  const [running, setRunning] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const entriesRef = useRef<Entry[]>([])
  entriesRef.current = entries

  const addFiles = useCallback(
    (list: FileList | null | undefined) => {
      if (!list) return
      const ok = Array.from(list).filter((f) => f.type.startsWith("audio/") || f.type.startsWith("video/"))
      if (ok.length === 0) {
        toast.error(t("audNotMedia"))
        return
      }
      setEntries((prev) => [
        ...prev,
        ...ok.map((file) => ({ id: ++idRef.current, file, status: "pending" as Status, progress: 0 })),
      ])
    },
    [t],
  )

  const removeEntry = useCallback((id: number) => {
    setEntries((prev) => {
      const e = prev.find((x) => x.id === id)
      if (e?.result) URL.revokeObjectURL(e.result.url)
      return prev.filter((x) => x.id !== id)
    })
  }, [])

  const clearAll = useCallback(() => {
    setEntries((prev) => {
      prev.forEach((e) => e.result && URL.revokeObjectURL(e.result.url))
      return []
    })
  }, [])

  async function convertOne(e: Entry): Promise<Entry["result"] | null> {
    const ab = await e.file.arrayBuffer()
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    let audioBuf: AudioBuffer
    try {
      audioBuf = await ctx.decodeAudioData(ab)
    } finally {
      void ctx.close()
    }
    const channels: Float32Array[] = []
    for (let c = 0; c < audioBuf.numberOfChannels; c++) channels.push(audioBuf.getChannelData(c))
    const base = e.file.name.replace(/\.[^.]+$/, "")
    let blob: Blob
    if (output === "wav") {
      blob = encodeWav(channels, audioBuf.sampleRate)
    } else {
      blob = await encodeMp3(channels, audioBuf.sampleRate, bitrate, (p) =>
        setEntries((prev) => prev.map((x) => (x.id === e.id ? { ...x, progress: p } : x))),
      )
    }
    return { url: URL.createObjectURL(blob), size: blob.size, name: `${base}.${output}` }
  }

  const convertAll = useCallback(async () => {
    setRunning(true)
    try {
      for (const e of entriesRef.current) {
        if (e.status === "done") continue
        setEntries((prev) => prev.map((x) => (x.id === e.id ? { ...x, status: "working", progress: 0 } : x)))
        try {
          const result = await convertOne(e)
          setEntries((prev) =>
            prev.map((x) =>
              x.id === e.id ? { ...x, status: result ? "done" : "error", result: result ?? undefined } : x,
            ),
          )
        } catch {
          setEntries((prev) => prev.map((x) => (x.id === e.id ? { ...x, status: "error" } : x)))
        }
      }
      toast.success(t("audDone"))
    } finally {
      setRunning(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [output, bitrate, t])

  function triggerDownload(url: string, name: string) {
    const a = document.createElement("a")
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  const downloadAll = useCallback(() => {
    entries.filter((e) => e.result).forEach((e, i) => setTimeout(() => triggerDownload(e.result!.url, e.result!.name), i * 150))
  }, [entries])

  const doneCount = entries.filter((e) => e.status === "done").length
  const allDone = entries.length > 0 && doneCount === entries.length

  // ── Boş durum ──
  if (entries.length === 0) {
    return (
      <div className="mx-auto mt-10 max-w-3xl">
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            addFiles(e.dataTransfer.files)
          }}
          className={
            "flex cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed px-6 py-24 text-center transition-colors " +
            (dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30")
          }
        >
          <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <HugeiconsIcon icon={MusicNote01Icon} strokeWidth={2} className="size-8" />
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-lg font-semibold">{t("audDrop")}</span>
            <span className="text-sm text-muted-foreground">{t("audPrivacy")}</span>
          </div>
          <input type="file" accept={accept} multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        </label>
      </div>
    )
  }

  // ── Editör ──
  return (
    <div className="mt-6 flex flex-col gap-5">
      {/* Format seçici (outputs > 1 ise) + MP3 bitrate */}
      {outputs.length > 1 || output === "mp3" ? (
        <section className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-4">
          {outputs.length > 1 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("audFormat")}
              </span>
              <div className="flex gap-1.5">
                {outputs.map((o) => (
                  <button
                    key={o}
                    onClick={() => {
                      setOutput(o)
                      setEntries((prev) =>
                        prev.map((x) => {
                          if (x.result) URL.revokeObjectURL(x.result.url)
                          return { ...x, status: "pending", progress: 0, result: undefined }
                        }),
                      )
                    }}
                    disabled={running}
                    className={
                      "rounded-full px-3.5 py-1.5 text-xs uppercase transition-colors disabled:opacity-50 " +
                      (output === o ? "bg-primary font-medium text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70")
                    }
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {output === "mp3" ? (
            <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("audBitrate")}
          </span>
          <div className="flex gap-1.5">
            {MP3_BITRATES.map((b) => (
              <button
                key={b}
                onClick={() => setBitrate(b)}
                disabled={running}
                className={
                  "rounded-full px-3.5 py-1.5 text-xs transition-colors disabled:opacity-50 " +
                  (bitrate === b
                    ? "bg-primary font-medium text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70")
                }
              >
                {b} kbps
              </button>
            ))}
          </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {t("imgConvCount", { count: entries.length })}
          {doneCount > 0 ? ` · ${t("imgConvDoneCount", { count: doneCount })}` : ""}
        </span>
        <div className="flex items-center gap-2">
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors hover:bg-muted">
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4" />
            {t("imgConvAddMore")}
            <input type="file" accept={accept} multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
          </label>
          <button
            onClick={clearAll}
            disabled={running}
            className="inline-flex h-9 items-center rounded-xl border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {t("imgConvClear")}
          </button>
        </div>
      </div>

      {/* Dosya satırları */}
      <LayoutGroup>
        <motion.div layout className="flex flex-col gap-2">
          <AnimatePresence mode="popLayout">
            {entries.map((e) => (
              <motion.div
                key={e.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 320, damping: 30 }}
                className="relative flex items-center gap-3 overflow-hidden rounded-2xl border bg-card p-3"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <HugeiconsIcon icon={MusicNote01Icon} strokeWidth={2} className="size-5" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium" title={e.file.name}>
                    {e.file.name}
                  </span>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="uppercase">{(e.file.name.split(".").pop() || "?").slice(0, 4)}</span>
                    <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3" />
                    <span className="font-medium uppercase text-foreground/80">{output}</span>
                    <span>·</span>
                    <span className="tabular-nums">
                      {humanSize(e.file.size)}
                      {e.result ? <span className="text-foreground/70"> → {humanSize(e.result.size)}</span> : null}
                    </span>
                  </div>
                  {e.status === "working" && output === "mp3" ? (
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                      <motion.div
                        className="h-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round(e.progress * 100)}%` }}
                        transition={{ ease: "linear", duration: 0.2 }}
                      />
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {e.status === "working" ? (
                    <Spinner small />
                  ) : e.result ? (
                    <motion.button
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 22 }}
                      onClick={() => triggerDownload(e.result!.url, e.result!.name)}
                      className="inline-flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors hover:bg-primary/20"
                      aria-label="Download"
                    >
                      <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="size-4" />
                    </motion.button>
                  ) : e.status === "error" ? (
                    <span className="text-[11px] text-destructive">{t("audFailed")}</span>
                  ) : null}
                  <button
                    onClick={() => removeEntry(e.id)}
                    disabled={running}
                    className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
                    aria-label="Remove"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </LayoutGroup>

      {/* Aksiyon */}
      <div className="flex items-center justify-end gap-2">
        <AnimatePresence>
          {allDone ? (
            <motion.button
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              onClick={downloadAll}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-primary/40 px-5 font-semibold text-primary transition-colors hover:bg-primary/10"
            >
              <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="size-5" />
              {t("imgConvDownloadAll")}
            </motion.button>
          ) : null}
        </AnimatePresence>
        <button
          onClick={convertAll}
          disabled={running || entries.length === 0}
          className="inline-flex h-11 min-w-44 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {running ? (
            <>
              <Spinner small />
              {t("audConverting")}
            </>
          ) : (
            t("audConvertAll")
          )}
        </button>
      </div>
    </div>
  )
}

function Spinner({ small }: { small?: boolean }) {
  return (
    <motion.span
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, ease: "linear", duration: 0.8 }}
      className={small ? "size-4" : "size-7"}
      style={{ display: "inline-block" }}
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-full">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </motion.span>
  )
}
