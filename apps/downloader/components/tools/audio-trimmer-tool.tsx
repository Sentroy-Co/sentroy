"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { MusicNote01Icon, Cancel01Icon, Download01Icon, PlayIcon, PauseIcon, Scissor01Icon } from "@hugeicons/core-free-icons"
import { encodeWav, encodeMp3 } from "@/lib/tools/audio-encode"

/**
 * Audio Trimmer (client, server'a yükleme YOK). WaveSurfer waveform + sürüklenebilir
 * region ile başlangıç/bitiş seçilir; WebAudio ile çözülen PCM o aralıkta kesilip
 * WAV (lossless) veya MP3 (lamejs) olarak dışa verilir. wavesurfer lazy-import.
 */

type Out = "wav" | "mp3"
const MP3_BITRATES = [320, 192, 128]

function fmt(s: number): string {
  if (!isFinite(s)) return "0:00"
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, "0")}`
}

export function AudioTrimmerTool() {
  const t = useTranslations("d")
  const containerRef = useRef<HTMLDivElement | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wsRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const regionRef = useRef<any>(null)
  const bufferRef = useRef<AudioBuffer | null>(null)
  const selRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 })

  const [file, setFile] = useState<File | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const [sel, setSel] = useState<{ start: number; end: number }>({ start: 0, end: 0 })
  const [playing, setPlaying] = useState(false)
  const [output, setOutput] = useState<Out>("mp3")
  const [bitrate, setBitrate] = useState(192)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  selRef.current = sel

  const onPick = useCallback(
    async (f: File | undefined) => {
      if (!f) return
      if (!f.type.startsWith("audio/") && !f.type.startsWith("video/")) {
        toast.error(t("audNotMedia"))
        return
      }
      try {
        const ab = await f.arrayBuffer()
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const ctx = new Ctx()
        const buf = await ctx.decodeAudioData(ab.slice(0))
        void ctx.close()
        bufferRef.current = buf
        setDuration(buf.duration)
        setSel({ start: 0, end: buf.duration })
        setFile(f)
        setObjectUrl(URL.createObjectURL(f))
      } catch {
        toast.error(t("trimDecodeErr"))
      }
    },
    [t],
  )

  // WaveSurfer + regions (lazy import)
  useEffect(() => {
    if (!objectUrl || !containerRef.current) return
    let destroyed = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ws: any = null
    ;(async () => {
      const [{ default: WaveSurfer }, { default: RegionsPlugin }] = await Promise.all([
        import("wavesurfer.js"),
        import("wavesurfer.js/plugins/regions"),
      ])
      if (destroyed || !containerRef.current) return
      ws = WaveSurfer.create({
        container: containerRef.current,
        height: 110,
        waveColor: "#52525b",
        progressColor: "#818cf8",
        cursorColor: "#a5b4fc",
        url: objectUrl,
      })
      wsRef.current = ws
      const regions = ws.registerPlugin(RegionsPlugin.create())
      ws.on("ready", () => {
        const dur = ws.getDuration()
        regions.clearRegions()
        regionRef.current = regions.addRegion({
          start: 0,
          end: dur,
          drag: true,
          resize: true,
          color: "rgba(129,140,248,0.15)",
        })
        setSel({ start: 0, end: dur })
      })
      regions.on("region-updated", (region: { start: number; end: number }) => {
        setSel({ start: region.start, end: region.end })
      })
      ws.on("play", () => setPlaying(true))
      ws.on("pause", () => setPlaying(false))
      ws.on("finish", () => setPlaying(false))
      // seçim sonuna gelince durdur (region önizlemesi)
      ws.on("timeupdate", (ct: number) => {
        if (ct >= selRef.current.end - 0.02) {
          ws.pause()
          ws.setTime(selRef.current.start)
        }
      })
    })()
    return () => {
      destroyed = true
      try {
        ws?.destroy()
      } catch {
        /* noop */
      }
      wsRef.current = null
    }
  }, [objectUrl])

  const reset = () => {
    setFile(null)
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    setObjectUrl(null)
    bufferRef.current = null
  }

  const togglePlay = () => {
    const ws = wsRef.current
    if (!ws) return
    if (ws.isPlaying()) {
      ws.pause()
    } else {
      if (ws.getCurrentTime() < sel.start || ws.getCurrentTime() >= sel.end) ws.setTime(sel.start)
      ws.play()
    }
  }

  const download = useCallback(async () => {
    const buf = bufferRef.current
    if (!buf || !file) return
    const dur = sel.end - sel.start
    if (dur < 0.05) {
      toast.error(t("trimTooShort"))
      return
    }
    setBusy(true)
    try {
      const sr = buf.sampleRate
      const s = Math.floor(sel.start * sr)
      const e = Math.floor(sel.end * sr)
      const channels: Float32Array[] = []
      for (let c = 0; c < buf.numberOfChannels; c++) channels.push(buf.getChannelData(c).slice(s, e))
      const blob = output === "wav" ? encodeWav(channels, sr) : await encodeMp3(channels, sr, bitrate)
      const base = file.name.replace(/\.[^.]+$/, "")
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${base}-trim.${output}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success(t("trimDone"))
    } catch {
      toast.error(t("toolGenericError"))
    } finally {
      setBusy(false)
    }
  }, [file, sel, output, bitrate, t])

  if (!file || !objectUrl) {
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
            void onPick(e.dataTransfer.files?.[0])
          }}
          className={
            "flex cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed px-6 py-24 text-center transition-colors " +
            (dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30")
          }
        >
          <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <HugeiconsIcon icon={Scissor01Icon} strokeWidth={2} className="size-8" />
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-lg font-semibold">{t("trimDrop")}</span>
            <span className="text-sm text-muted-foreground">{t("trimHint")}</span>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">🔒 {t("audPrivacy")}</span>
          <input type="file" accept="audio/*,video/*" className="hidden" onChange={(e) => void onPick(e.target.files?.[0])} />
        </label>
      </div>
    )
  }

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-medium">{file.name}</span>
        <button onClick={reset} className="inline-flex h-9 shrink-0 items-center rounded-xl border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted">
          {t("imgResizeNew")}
        </button>
      </div>

      {/* Waveform */}
      <div className="rounded-2xl border bg-card p-4">
        <div ref={containerRef} className="w-full" />
      </div>

      {/* Seçim + oynat */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={togglePlay}
          className="inline-flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
          aria-label="Play/Pause"
        >
          <HugeiconsIcon icon={playing ? PauseIcon : PlayIcon} strokeWidth={2} className="size-5" />
        </button>
        <div className="flex items-center gap-2 text-sm tabular-nums">
          <span className="rounded-lg bg-muted px-2.5 py-1">{fmt(sel.start)}</span>
          <span className="text-muted-foreground">→</span>
          <span className="rounded-lg bg-muted px-2.5 py-1">{fmt(sel.end)}</span>
          <span className="text-muted-foreground">({fmt(sel.end - sel.start)})</span>
        </div>
        <span className="ms-auto text-xs text-muted-foreground">{t("trimDragHint")}</span>
      </div>

      {/* Format + bitrate */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("audFormat")}</span>
          <div className="flex gap-1.5">
            {(["mp3", "wav"] as Out[]).map((o) => (
              <button
                key={o}
                onClick={() => setOutput(o)}
                className={
                  "rounded-full px-3.5 py-1.5 text-xs uppercase transition-colors " +
                  (output === o ? "bg-primary font-medium text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70")
                }
              >
                {o}
              </button>
            ))}
          </div>
        </div>
        {output === "mp3" ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("audBitrate")}</span>
            <div className="flex gap-1.5">
              {MP3_BITRATES.map((b) => (
                <button
                  key={b}
                  onClick={() => setBitrate(b)}
                  className={
                    "rounded-full px-3 py-1.5 text-xs transition-colors " +
                    (bitrate === b ? "bg-primary font-medium text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70")
                  }
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <button
        onClick={download}
        disabled={busy}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        <HugeiconsIcon icon={busy ? Scissor01Icon : Download01Icon} strokeWidth={2} className="size-5" />
        {busy ? t("trimming") : t("trimDownload")}
      </button>
    </div>
  )
}
