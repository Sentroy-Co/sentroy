"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { Cropper, type CropperRef } from "react-mobile-cropper"
import "react-mobile-cropper/dist/style.css"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ImageAdd01Icon,
  Download01Icon,
  Link01Icon,
  Unlink01Icon,
  ReloadIcon,
  CropIcon,
  Resize01Icon,
  AspectRatioIcon,
} from "@hugeicons/core-free-icons"

/**
 * tools.sentroy.com — Image Resizer & Crop (client/WASM, server'a yükleme YOK).
 * Storage'daki iOS-Photos tarzı CropDialog deneyiminin geniş-sahne tool sürümü:
 * büyük cropper (üstte) + altta kontrol toolbar'ı. Kırp + hedef boyuta ölçekle
 * + döndür + hazır sosyal boyutlar + format/kalite + indir. Tümü tarayıcıda
 * (Canvas + react-mobile-cropper); dosya cihazdan çıkmaz.
 */

const ASPECTS: { id: string; label: string; ratio: number | null }[] = [
  { id: "original", label: "Original", ratio: null },
  { id: "free", label: "Free", ratio: 0 },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "3:2", label: "3:2", ratio: 3 / 2 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
]

// Hazır sosyal medya boyutları (genişlik×yükseklik). Tıklayınca stencil oranı
// + hedef çıktı boyutu o değere kilitlenir.
const SIZE_PRESETS: { id: string; label: string; w: number; h: number }[] = [
  { id: "yt-thumb", label: "YouTube Thumbnail", w: 1280, h: 720 },
  { id: "yt-banner", label: "YouTube Banner", w: 2560, h: 1440 },
  { id: "ig-post", label: "Instagram Post", w: 1080, h: 1080 },
  { id: "ig-portrait", label: "Instagram Portrait", w: 1080, h: 1350 },
  { id: "ig-story", label: "Instagram Story", w: 1080, h: 1920 },
  { id: "tiktok", label: "TikTok / Reels", w: 1080, h: 1920 },
  { id: "fb-cover", label: "Facebook Cover", w: 851, h: 315 },
  { id: "fb-post", label: "Facebook Post", w: 1200, h: 630 },
  { id: "x-header", label: "X Header", w: 1500, h: 500 },
  { id: "x-post", label: "X Post", w: 1600, h: 900 },
  { id: "linkedin-cover", label: "LinkedIn Cover", w: 1584, h: 396 },
  { id: "pinterest", label: "Pinterest Pin", w: 1000, h: 1500 },
]

const WIDTH_PRESETS = [1920, 1280, 1080, 720, 512]
const MAX_PIXELS = 60_000_000
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/bmp"

type Fmt = "original" | "jpeg" | "png" | "webp"

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function ImageResizerTool() {
  const t = useTranslations("d")
  const cropperRef = useRef<CropperRef | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [src, setSrc] = useState<{ w: number; h: number } | null>(null)
  const [aspectId, setAspectId] = useState<string>("original")
  const [presetId, setPresetId] = useState<string | null>(null)
  const [coords, setCoords] = useState<{ width: number; height: number } | null>(null)
  const [lock, setLock] = useState(true)
  const [tw, setTw] = useState("")
  const [th, setTh] = useState("")
  const [dimsTouched, setDimsTouched] = useState(false)
  const [fmt, setFmt] = useState<Fmt>("original")
  const [quality, setQuality] = useState(0.92)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [estSize, setEstSize] = useState<number | null>(null)
  const [estimating, setEstimating] = useState(false)

  function outputMime(): string {
    return fmt === "jpeg"
      ? "image/jpeg"
      : fmt === "png"
        ? "image/png"
        : fmt === "webp"
          ? "image/webp"
          : file?.type === "image/png"
            ? "image/png"
            : "image/jpeg"
  }

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    const img = new Image()
    img.onload = () => setSrc({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  const onPick = useCallback((f: File | null | undefined) => {
    if (!f) return
    if (!f.type.startsWith("image/")) {
      toast.error(t("imgResizeNotImage"))
      return
    }
    setFile(f)
    setAspectId("original")
    setPresetId(null)
    setCoords(null)
    setDimsTouched(false)
    setTw("")
    setTh("")
    setFmt("original")
  }, [t])

  const reset = useCallback(() => {
    setFile(null)
    setImageUrl(null)
    setSrc(null)
    setCoords(null)
  }, [])

  // Aktif çıktı oranı: preset > aspect chip.
  const preset = presetId ? SIZE_PRESETS.find((p) => p.id === presetId) : null
  const activeRatio: number | undefined = (() => {
    if (preset) return preset.w / preset.h
    const a = ASPECTS.find((x) => x.id === aspectId)
    if (!a) return undefined
    if (a.id === "original") return src ? src.w / src.h : undefined
    if (a.id === "free") return undefined
    return a.ratio ?? undefined
  })()

  // Oran değişince stencil'i snap'le
  useEffect(() => {
    const c = cropperRef.current
    if (!c || activeRatio === undefined) return
    const cur = c.getState()?.coordinates
    if (!cur) return
    c.setCoordinates({ width: cur.width, height: cur.width / activeRatio })
  }, [activeRatio])

  const onCropChange = useCallback(
    (c: CropperRef) => {
      const co = c.getCoordinates()
      if (!co) return
      setCoords({ width: co.width, height: co.height })
      if (preset) return // preset aktifken hedef boyut sabit
      if (!dimsTouched) {
        setTw(String(Math.round(co.width)))
        setTh(String(Math.round(co.height)))
      } else if (lock) {
        const wNum = parseInt(tw || "0", 10)
        if (wNum > 0) setTh(String(Math.round(wNum / (co.width / co.height))))
      }
    },
    [dimsTouched, lock, tw, preset],
  )

  const cropAspect = coords ? coords.width / coords.height : src ? src.w / src.h : 1

  const selectAspect = (id: string) => {
    setAspectId(id)
    setPresetId(null)
  }
  const selectPreset = (id: string) => {
    const p = SIZE_PRESETS.find((x) => x.id === id)
    if (!p) return
    setPresetId(id)
    setAspectId("")
    setTw(String(p.w))
    setTh(String(p.h))
    setLock(true)
    setDimsTouched(true)
  }

  const onWidth = (v: string) => {
    const clean = v.replace(/[^0-9]/g, "")
    setTw(clean)
    setDimsTouched(true)
    setPresetId(null)
    if (lock && clean) setTh(String(Math.round(parseInt(clean, 10) / cropAspect)))
  }
  const onHeight = (v: string) => {
    const clean = v.replace(/[^0-9]/g, "")
    setTh(clean)
    setDimsTouched(true)
    setPresetId(null)
    if (lock && clean) setTw(String(Math.round(parseInt(clean, 10) * cropAspect)))
  }
  const applyWidthPreset = (w: number) => {
    setTw(String(w))
    setTh(String(Math.round(w / cropAspect)))
    setDimsTouched(true)
    setPresetId(null)
  }
  const fitCrop = () => {
    if (!coords) return
    setTw(String(Math.round(coords.width)))
    setTh(String(Math.round(coords.height)))
    setDimsTouched(false)
    setPresetId(null)
  }

  const rotate = () => cropperRef.current?.rotateImage(90)

  // ── Canlı çıktı boyutu tahmini (debounce'lu gerçek encode) ──
  useEffect(() => {
    const c = cropperRef.current
    if (!c || !file) {
      setEstSize(null)
      return
    }
    const w = parseInt(tw || "0", 10)
    const h = parseInt(th || "0", 10)
    if (!w || !h || w * h > MAX_PIXELS) {
      setEstSize(null)
      return
    }
    let cancelled = false
    setEstimating(true)
    const timer = setTimeout(async () => {
      const outMime = outputMime()
      const lossy = outMime === "image/jpeg" || outMime === "image/webp"
      const canvas = c.getCanvas({
        width: w,
        height: h,
        imageSmoothingQuality: "high",
        fillColor: outMime === "image/jpeg" ? "#ffffff" : undefined,
      })
      if (!canvas) {
        if (!cancelled) {
          setEstSize(null)
          setEstimating(false)
        }
        return
      }
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), outMime, lossy ? quality : undefined),
      )
      if (!cancelled) {
        setEstSize(blob ? blob.size : null)
        setEstimating(false)
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tw, th, fmt, quality, file])

  const download = useCallback(async () => {
    const c = cropperRef.current
    if (!c || !file) return
    const w = Math.max(1, parseInt(tw || "0", 10) || 0)
    const h = Math.max(1, parseInt(th || "0", 10) || 0)
    if (!w || !h) {
      toast.error(t("imgResizeBadSize"))
      return
    }
    if (w * h > MAX_PIXELS) {
      toast.error(t("imgResizeTooBig"))
      return
    }
    setBusy(true)
    try {
      const outMime =
        fmt === "jpeg"
          ? "image/jpeg"
          : fmt === "png"
            ? "image/png"
            : fmt === "webp"
              ? "image/webp"
              : file.type === "image/png"
                ? "image/png"
                : "image/jpeg"
      const lossy = outMime === "image/jpeg" || outMime === "image/webp"
      const canvas = c.getCanvas({
        width: w,
        height: h,
        imageSmoothingQuality: "high",
        fillColor: outMime === "image/jpeg" ? "#ffffff" : undefined,
      })
      if (!canvas) {
        toast.error(t("toolGenericError"))
        return
      }
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), outMime, lossy ? quality : undefined),
      )
      if (!blob) {
        toast.error(t("toolGenericError"))
        return
      }
      const ext = outMime === "image/png" ? "png" : outMime === "image/webp" ? "webp" : "jpg"
      const base = file.name.replace(/\.[^.]+$/, "")
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${base}-${w}x${h}.${ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success(t("imgResizeDone", { size: humanSize(blob.size) }))
    } finally {
      setBusy(false)
    }
  }, [file, tw, th, fmt, quality, t])

  // ── Boş durum: drop zone ──
  if (!file || !imageUrl) {
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
            <HugeiconsIcon icon={ImageAdd01Icon} strokeWidth={2} className="size-8" />
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-lg font-semibold">{t("imgResizeDrop")}</span>
            <span className="text-sm text-muted-foreground">{t("imgResizeFormats")}</span>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            🔒 {t("imgResizePrivacy")}
          </span>
          <input type="file" accept={ACCEPT} className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
        </label>
      </div>
    )
  }

  // ── Editör: büyük cropper + altta kontrol toolbar'ı ──
  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{file.name}</span>
          {src ? (
            <span className="text-xs text-muted-foreground">
              {src.w}×{src.h} px · {humanSize(file.size)}
            </span>
          ) : null}
        </div>
        <button
          onClick={reset}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors hover:bg-muted"
        >
          <HugeiconsIcon icon={ReloadIcon} strokeWidth={2} className="size-4" />
          {t("imgResizeNew")}
        </button>
      </div>

      {/* BÜYÜK cropper — tam genişlik, ekranın yarısından fazla yükseklik */}
      <div className="relative h-[56vh] min-h-[360px] max-h-[680px] overflow-hidden rounded-2xl border bg-black">
        <Cropper
          ref={cropperRef}
          src={imageUrl}
          onChange={onCropChange}
          stencilProps={{ aspectRatio: activeRatio }}
          className="sentroy-tool-cropper"
        />
      </div>

      {/* Aspect chip'leri + rotate */}
      <section className="flex flex-wrap items-center gap-1.5">
        <span className="me-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <HugeiconsIcon icon={AspectRatioIcon} strokeWidth={2} className="size-3.5" />
          {t("imgResizeAspect")}
        </span>
        {ASPECTS.map((a) => {
          const active = !presetId && aspectId === a.id
          return (
            <button
              key={a.id}
              onClick={() => selectAspect(a.id)}
              className={
                "rounded-full px-3 py-1.5 text-xs transition-colors " +
                (active
                  ? "bg-primary font-medium text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70")
              }
            >
              {a.id === "original" ? t("imgResizeOriginal") : a.id === "free" ? t("imgResizeFree") : a.label}
            </button>
          )
        })}
        <button
          onClick={rotate}
          title={t("imgResizeRotate")}
          className="ms-auto inline-flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/70"
        >
          <RotateIcon />
        </button>
      </section>

      {/* Hazır sosyal boyutlar — her seçenekte orana göre ölçekli önizleme kutusu */}
      <section className="flex flex-col gap-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("imgResizePresets")}
        </span>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {SIZE_PRESETS.map((p) => {
            const active = presetId === p.id
            // Önizleme kutusu: orana göre ölçekle (büyük kenar 34px)
            const r = p.w / p.h
            const bw = r >= 1 ? 34 : Math.round(34 * r)
            const bh = r >= 1 ? Math.round(34 / r) : 34
            return (
              <motion.button
                key={p.id}
                onClick={() => selectPreset(p.id)}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.97 }}
                title={`${p.w}×${p.h}`}
                className={
                  "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-center transition-colors " +
                  (active
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/40 hover:bg-muted/40")
                }
              >
                <span className="flex h-10 items-center justify-center">
                  <span
                    style={{ width: bw, height: bh }}
                    className={
                      "rounded-[3px] border-2 transition-colors " +
                      (active ? "border-primary bg-primary/20" : "border-muted-foreground/40 bg-muted-foreground/5")
                    }
                  />
                </span>
                <span
                  className={
                    "text-[11px] font-medium leading-tight " + (active ? "text-primary" : "text-foreground/90")
                  }
                >
                  {p.label}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground/60">
                  {p.w}×{p.h}
                </span>
              </motion.button>
            )
          })}
        </div>
      </section>

      {/* Resize + Format/Kalite (geniş ekranda 2 sütun) */}
      <div className="grid gap-5 sm:grid-cols-2">
        <section className="flex flex-col gap-2.5">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <HugeiconsIcon icon={Resize01Icon} strokeWidth={2} className="size-3.5" />
            {t("imgResizeSize")}
          </span>
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">{t("imgResizeWidth")}</span>
              <input
                value={tw}
                onChange={(e) => onWidth(e.target.value)}
                inputMode="numeric"
                className="h-10 rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary"
              />
            </label>
            <button
              onClick={() => setLock((v) => !v)}
              title={lock ? t("imgResizeUnlock") : t("imgResizeLock")}
              className={
                "mb-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors " +
                (lock ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground hover:bg-muted/70")
              }
            >
              <HugeiconsIcon icon={lock ? Link01Icon : Unlink01Icon} strokeWidth={2} className="size-4" />
            </button>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">{t("imgResizeHeight")}</span>
              <input
                value={th}
                onChange={(e) => onHeight(e.target.value)}
                inputMode="numeric"
                disabled={lock}
                className="h-10 rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {WIDTH_PRESETS.map((w) => (
              <button
                key={w}
                onClick={() => applyWidthPreset(w)}
                className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/70"
              >
                {w}px
              </button>
            ))}
            <button
              onClick={fitCrop}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/70"
            >
              <HugeiconsIcon icon={CropIcon} strokeWidth={2} className="size-3" />
              {t("imgResizeFitCrop")}
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("imgResizeFormat")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {(["original", "jpeg", "png", "webp"] as Fmt[]).map((f) => (
              <button
                key={f}
                onClick={() => setFmt(f)}
                className={
                  "rounded-full px-3 py-1.5 text-xs transition-colors " +
                  (fmt === f
                    ? "bg-primary font-medium text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70")
                }
              >
                {f === "original" ? t("imgResizeOriginal") : f.toUpperCase()}
              </button>
            ))}
          </div>
          {fmt === "jpeg" || fmt === "webp" ? (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">
                {t("imgResizeQuality")}: {Math.round(quality * 100)}%
              </span>
              <input
                type="range"
                min={0.3}
                max={1}
                step={0.01}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="accent-primary"
              />
            </label>
          ) : null}
        </section>
      </div>

      {/* Mevcut → tahmini çıktı boyutu */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        {file ? <span className="tabular-nums">{humanSize(file.size)}</span> : null}
        <span>→</span>
        {estimating ? (
          <span className="inline-flex items-center gap-1.5">
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, ease: "linear", duration: 0.8 }}
              className="inline-block size-3"
            >
              <svg viewBox="0 0 24 24" fill="none" className="size-full">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </motion.span>
            {t("imgResizeEstimating")}
          </span>
        ) : estSize != null ? (
          <motion.span
            key={estSize}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            className={
              "font-medium tabular-nums " + (estSize <= (file?.size ?? Infinity) ? "text-emerald-500" : "text-amber-500")
            }
          >
            ~{humanSize(estSize)} <span className="font-normal text-muted-foreground/70">({t("imgResizeEstimated")})</span>
          </motion.span>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </div>

      <button
        onClick={download}
        disabled={busy}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="size-5" />
        {busy ? t("imgResizeProcessing") : t("imgResizeDownload")}
      </button>

      <style>{`.sentroy-tool-cropper { height: 100%; width: 100%; background: #000; }`}</style>
    </div>
  )
}

function RotateIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v5h-5" />
    </svg>
  )
}
