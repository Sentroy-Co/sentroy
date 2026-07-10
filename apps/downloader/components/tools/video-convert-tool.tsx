"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { VideoReplayIcon, Download01Icon, ReloadIcon } from "@hugeicons/core-free-icons"

/**
 * Video format dönüştürücü (client, server'a yükleme YOK). mediabunny (MIT)
 * WebCodecs tabanli demux + transcode + mux ile calisir — donanim
 * hizlandirmali H.264/VP9 encode, GPL yok. `import()` ile lazy (agir lib
 * ortak bundle'a girmez).
 *
 * Desteklenmeyen durumlar (Firefox H.264 encode kisitli, legacy MPEG-1/2
 * kaynak decode edilemez): conversion.isValid / discardedTracks üzerinden
 * yakalanip kullaniciya nazik mesaj gösterilir.
 */

type OutFmt = "mp4" | "webm"

interface ConvertConfig {
  /** Kaynak format etiketi (UI metninde). */
  from: string
  /** Hedef format etiketi. */
  to: string
  /** Hedef container. */
  outFmt: OutFmt
  /** İndirme uzantisi (nokta yok). */
  ext: string
  /** Blob mime. */
  mime: string
}

function humanSize(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(2)} MB`
}

function VideoConvert({ from, to, outFmt, ext, mime }: ConvertConfig) {
  const t = useTranslations("d")
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pct, setPct] = useState(0)
  const [result, setResult] = useState<{ url: string; size: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const srcUrlRef = useRef<string | null>(null)
  const resultUrlRef = useRef<string | null>(null)

  const revokeAll = useCallback(() => {
    if (srcUrlRef.current) URL.revokeObjectURL(srcUrlRef.current)
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
    srcUrlRef.current = null
    resultUrlRef.current = null
  }, [])

  const onPick = useCallback(
    (f?: File | null) => {
      if (!f) return
      const okType =
        f.type.startsWith("video/") ||
        /\.(mp4|m4v|mov|webm|mkv|mpe?g|mpg)$/i.test(f.name)
      if (!okType) {
        toast.error(t("vcNotVideo"))
        return
      }
      revokeAll()
      const u = URL.createObjectURL(f)
      srcUrlRef.current = u
      setFile(f)
      setUrl(u)
      setResult(null)
      setError(null)
      setPct(0)
    },
    [revokeAll, t],
  )

  const convert = useCallback(async () => {
    if (!file) return
    setBusy(true)
    setPct(0)
    setError(null)
    try {
      const {
        Input,
        Output,
        ALL_FORMATS,
        BlobSource,
        BufferTarget,
        Mp4OutputFormat,
        WebMOutputFormat,
        Conversion,
      } = await import("mediabunny")

      const input = new Input({
        formats: ALL_FORMATS,
        source: new BlobSource(file),
      })
      const output = new Output({
        format: outFmt === "mp4" ? new Mp4OutputFormat() : new WebMOutputFormat(),
        target: new BufferTarget(),
      })
      // Codec'leri ZORLA transcode et — belirtilmezse mediabunny kaynağı
      // hedef container'a stream-COPY edebiliyor (ör. VP9/Opus→MP4, ISO-geçerli
      // ama QuickTime "dosya bozuk" der). MP4=H.264+AAC (evrensel), WebM=VP9+Opus.
      const conversion = await Conversion.init({
        input,
        output,
        video: { codec: outFmt === "mp4" ? "avc" : "vp9" },
        audio: { codec: outFmt === "mp4" ? "aac" : "opus" },
      })
      conversion.onProgress = (p) => setPct(Math.round(p * 100))

      // Video track decode/encode edilemiyorsa (Firefox H.264 encode yok,
      // legacy MPEG-1/2 kaynak, vb.) → nazik "desteklenmiyor" mesaji.
      const videoDropped = conversion.discardedTracks.some(
        (d) =>
          d.track.isVideoTrack() &&
          (d.reason === "undecodable_source_codec" ||
            d.reason === "unknown_source_codec" ||
            d.reason === "no_encodable_target_codec"),
      )
      if (!conversion.isValid || videoDropped) {
        setError(t("vcUnsupported", { to }))
        return
      }

      await conversion.execute()
      const buf = output.target.buffer
      if (!buf) throw new Error("Empty output")
      const blob = new Blob([buf], { type: mime })
      const outUrl = URL.createObjectURL(blob)
      resultUrlRef.current = outUrl
      setResult({ url: outUrl, size: blob.size })
      setPct(100)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("vcFailed"))
    } finally {
      setBusy(false)
    }
  }, [file, outFmt, mime, to, t])

  const download = useCallback(() => {
    if (!result || !file) return
    const a = document.createElement("a")
    a.href = result.url
    a.download = file.name.replace(/\.[^./]+$/, "") + "." + ext
    a.click()
  }, [result, file, ext])

  const reset = useCallback(() => {
    revokeAll()
    setFile(null)
    setUrl(null)
    setResult(null)
    setError(null)
    setPct(0)
    setBusy(false)
  }, [revokeAll])

  useEffect(() => {
    return () => revokeAll()
  }, [revokeAll])

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
            (dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/30")
          }
        >
          <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <HugeiconsIcon icon={VideoReplayIcon} strokeWidth={2} className="size-8" />
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-lg font-semibold">{t("vcDrop", { from })}</span>
            <span className="text-sm text-muted-foreground">
              {t("vcHint", { from, to })}
            </span>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            🔒 {t("sheetPrivacy")}
          </span>
          <input
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0])}
          />
        </label>
      </div>
    )
  }

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-medium">{file.name}</span>
        <button
          onClick={reset}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors hover:bg-muted"
        >
          <HugeiconsIcon icon={ReloadIcon} strokeWidth={2} className="size-4" />
          {t("officeNew")}
        </button>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Önizleme */}
        <div className="overflow-hidden rounded-2xl border bg-black/40">
          <video
            src={url}
            controls
            playsInline
            className="max-h-[360px] w-full object-contain"
          />
        </div>

        {/* Dönüştür / sonuç */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
            <div className="flex items-center justify-center gap-2 text-sm font-medium">
              <span className="rounded-lg bg-muted px-2.5 py-1 uppercase">{from}</span>
              <span className="text-muted-foreground">→</span>
              <span className="rounded-lg bg-primary/15 px-2.5 py-1 uppercase text-primary">
                {to}
              </span>
            </div>

            {error ? (
              <p className="rounded-xl bg-destructive/10 p-3 text-center text-sm text-destructive">
                {error}
              </p>
            ) : null}

            {busy ? (
              <div className="flex flex-col gap-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-150"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-center text-xs text-muted-foreground tabular-nums">
                  {t("vcConverting", { pct })}
                </span>
              </div>
            ) : result ? (
              <div className="flex flex-col gap-2">
                <p className="text-center text-xs text-muted-foreground">
                  {t("vcResult", { size: humanSize(result.size) })}
                </p>
                <button
                  onClick={download}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="size-4" />
                  {t("vcDownload", { to })}
                </button>
              </div>
            ) : (
              <button
                onClick={convert}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                <HugeiconsIcon icon={VideoReplayIcon} strokeWidth={2} className="size-4" />
                {t("vcConvert", { to })}
              </button>
            )}
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            🔒 {t("sheetPrivacy")}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── 3 tool wrapper — TOOL_UI id → component (props alamaz, config sabit) ──

export function WebmToMp4Tool() {
  return (
    <VideoConvert from="WebM" to="MP4" outFmt="mp4" ext="mp4" mime="video/mp4" />
  )
}

export function MpegToMp4Tool() {
  return (
    <VideoConvert from="MPEG" to="MP4" outFmt="mp4" ext="mp4" mime="video/mp4" />
  )
}

export function Mp4ToWebmTool() {
  return (
    <VideoConvert from="MP4" to="WebM" outFmt="webm" ext="webm" mime="video/webm" />
  )
}
