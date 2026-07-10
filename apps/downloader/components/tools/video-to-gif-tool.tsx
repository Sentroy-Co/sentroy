"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { VideoReplayIcon, Download01Icon, ReloadIcon } from "@hugeicons/core-free-icons"

/**
 * Video → GIF (client, server'a yükleme YOK). <video> karelerini canvas'a
 * seek-ederek çıkarır, gifenc (MIT) ile quantize + palet → GIF. Audio trimmer
 * gibi başlangıç/bitiş aralığı seçtirir. gifenc lazy-import (ağır lib ortak
 * bundle'a girmez). Uzun klipler MAX_FRAMES'e clamp'lenir (tarayıcı dostu).
 */

const FPS_OPTIONS = [5, 10, 15, 20]
const WIDTH_OPTIONS = [240, 320, 480, 640]
const MAX_FRAMES = 300

function fmtTime(s: number): string {
  if (!isFinite(s)) return "0:00"
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const cs = Math.floor((s % 1) * 10)
  return `${m}:${sec.toString().padStart(2, "0")}.${cs}`
}

function humanSize(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(2)} MB`
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const on = () => {
      video.removeEventListener("seeked", on)
      resolve()
    }
    video.addEventListener("seeked", on)
    video.currentTime = Math.min(t, video.duration || t)
  })
}

export function VideoToGifTool() {
  const t = useTranslations("d")
  const previewRef = useRef<HTMLVideoElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [fps, setFps] = useState(10)
  const [width, setWidth] = useState(480)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ url: string; size: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const resultRef = useRef<string | null>(null)

  const reset = () => {
    if (url) URL.revokeObjectURL(url)
    if (resultRef.current) URL.revokeObjectURL(resultRef.current)
    resultRef.current = null
    setFile(null)
    setUrl(null)
    setResult(null)
    setProgress(0)
  }

  const onPick = useCallback(
    (f: File | undefined) => {
      if (!f) return
      if (!f.type.startsWith("video/")) {
        toast.error(t("v2gNotVideo"))
        return
      }
      if (url) URL.revokeObjectURL(url)
      if (resultRef.current) {
        URL.revokeObjectURL(resultRef.current)
        resultRef.current = null
      }
      setResult(null)
      setFile(f)
      setUrl(URL.createObjectURL(f))
    },
    [url, t],
  )

  // Metadata yüklenince süre + varsayılan aralık (ilk 10 sn).
  const onMeta = () => {
    const v = previewRef.current
    if (!v) return
    const d = v.duration || 0
    setDuration(d)
    setStart(0)
    setEnd(Math.min(d, 10))
  }

  const onStart = (val: number) => {
    const s = Math.min(val, end - 0.1)
    setStart(Math.max(0, s))
    if (previewRef.current) previewRef.current.currentTime = Math.max(0, s)
  }
  const onEnd = (val: number) => {
    const e = Math.max(val, start + 0.1)
    setEnd(Math.min(duration, e))
    if (previewRef.current) previewRef.current.currentTime = Math.min(duration, e)
  }

  const span = Math.max(0, end - start)
  const frameCount = Math.min(MAX_FRAMES, Math.max(1, Math.round(span * fps)))

  const generate = useCallback(async () => {
    if (!url || !file || span < 0.1) return
    setBusy(true)
    setProgress(0)
    setResult(null)
    if (resultRef.current) {
      URL.revokeObjectURL(resultRef.current)
      resultRef.current = null
    }
    try {
      const { GIFEncoder, quantize, applyPalette } = await import("gifenc")

      // Seek için ayrı video (preview'i bozmadan).
      const vid = document.createElement("video")
      vid.src = url
      vid.muted = true
      vid.crossOrigin = "anonymous"
      await new Promise<void>((res, rej) => {
        vid.onloadedmetadata = () => res()
        vid.onerror = () => rej(new Error("load"))
      })

      const w = Math.max(2, Math.round(width / 2) * 2)
      const ratio = vid.videoHeight / vid.videoWidth || 0.5625
      const h = Math.max(2, Math.round((w * ratio) / 2) * 2)
      const canvas = document.createElement("canvas")
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!

      const frames = frameCount
      const step = span / frames
      const delay = Math.max(20, Math.round(step * 1000))
      const enc = GIFEncoder()

      for (let i = 0; i < frames; i++) {
        await seekTo(vid, start + i * step)
        ctx.drawImage(vid, 0, 0, w, h)
        const { data } = ctx.getImageData(0, 0, w, h)
        const palette = quantize(data, 256)
        const index = applyPalette(data, palette)
        enc.writeFrame(index, w, h, { palette, delay })
        setProgress(Math.round(((i + 1) / frames) * 100))
        // UI'a nefes aldır (uzun döngüde jank olmasın)
        await new Promise((r) => requestAnimationFrame(() => r(null)))
      }
      enc.finish()
      const bytes = enc.bytes()
      const blob = new Blob([bytes as BlobPart], { type: "image/gif" })
      const out = URL.createObjectURL(blob)
      resultRef.current = out
      setResult({ url: out, size: blob.size })
      toast.success(t("v2gDone"))
    } catch {
      toast.error(t("v2gFailed"))
    } finally {
      setBusy(false)
    }
  }, [url, file, start, span, frameCount, width, fps, t])

  const download = () => {
    if (!result || !file) return
    const base = file.name.replace(/\.[^.]+$/, "") || "video"
    const a = document.createElement("a")
    a.href = result.url
    a.download = `${base}.gif`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url)
      if (resultRef.current) URL.revokeObjectURL(resultRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!file || !url) {
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
            onPick(e.dataTransfer.files?.[0])
          }}
          className={
            "flex cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed px-6 py-24 text-center transition-colors " +
            (dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30")
          }
        >
          <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <HugeiconsIcon icon={VideoReplayIcon} strokeWidth={2} className="size-8" />
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-lg font-semibold">{t("v2gDrop")}</span>
            <span className="text-sm text-muted-foreground">{t("v2gHint")}</span>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">🔒 {t("sheetPrivacy")}</span>
          <input type="file" accept="video/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
        </label>
      </div>
    )
  }

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-medium">{file.name}</span>
        <button onClick={reset} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors hover:bg-muted">
          <HugeiconsIcon icon={ReloadIcon} strokeWidth={2} className="size-4" />
          {t("officeNew")}
        </button>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Önizleme */}
        <div className="overflow-hidden rounded-2xl border bg-black/40">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={previewRef} src={url} onLoadedMetadata={onMeta} controls playsInline className="max-h-[360px] w-full object-contain" />
        </div>

        {/* Sonuç / ayarlar */}
        <div className="flex flex-col gap-4">
          {/* Aralık */}
          <div className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
            <div className="flex items-center justify-between text-sm tabular-nums">
              <span className="rounded-lg bg-muted px-2.5 py-1">{fmtTime(start)}</span>
              <span className="text-xs text-muted-foreground">{t("v2gFrames", { n: frameCount })}</span>
              <span className="rounded-lg bg-muted px-2.5 py-1">{fmtTime(end)}</span>
            </div>
            {/* Görsel seçili bölge */}
            <div className="relative h-1.5 rounded-full bg-muted">
              <div
                className="absolute h-full rounded-full bg-primary"
                style={{ left: `${duration ? (start / duration) * 100 : 0}%`, right: `${duration ? 100 - (end / duration) * 100 : 0}%` }}
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-16 shrink-0">{t("v2gStart")}</span>
              <input type="range" min={0} max={duration} step={0.1} value={start} onChange={(e) => onStart(Number(e.target.value))} className="flex-1 accent-primary" />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-16 shrink-0">{t("v2gEnd")}</span>
              <input type="range" min={0} max={duration} step={0.1} value={end} onChange={(e) => onEnd(Number(e.target.value))} className="flex-1 accent-primary" />
            </label>
          </div>

          {/* FPS + genişlik */}
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("v2gFps")}</span>
              <div className="flex gap-1.5">
                {FPS_OPTIONS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setFps(f)}
                    className={"rounded-full px-3 py-1.5 text-xs transition-colors " + (fps === f ? "bg-primary font-medium text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70")}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("v2gWidth")}</span>
              <div className="flex gap-1.5">
                {WIDTH_OPTIONS.map((w) => (
                  <button
                    key={w}
                    onClick={() => setWidth(w)}
                    className={"rounded-full px-3 py-1.5 text-xs transition-colors " + (width === w ? "bg-primary font-medium text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70")}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sonuç önizleme */}
          {result ? (
            <div className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("v2gResult")} · {humanSize(result.size)}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.url} alt="GIF" className="max-h-64 w-full rounded-lg object-contain" />
            </div>
          ) : null}
        </div>
      </div>

      {/* Aksiyon */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={generate}
          disabled={busy || span < 0.1}
          className="inline-flex h-12 min-w-48 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <HugeiconsIcon icon={VideoReplayIcon} strokeWidth={2} className="size-5" />
          {busy ? t("v2gGenerating", { p: progress }) : t("v2gGenerate")}
        </button>
        {result ? (
          <button
            onClick={download}
            className="inline-flex h-12 items-center gap-2 rounded-xl border border-primary/40 px-5 font-semibold text-primary transition-colors hover:bg-primary/10"
          >
            <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="size-5" />
            {t("v2gDownload")}
          </button>
        ) : null}
      </div>
    </div>
  )
}
