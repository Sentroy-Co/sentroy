"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { motion, AnimatePresence, LayoutGroup } from "framer-motion"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ImageAdd01Icon,
  Download01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Add01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons"

/**
 * tools.sentroy.com — Image Converter (client/WASM, çoklu dosya, server'a
 * yükleme YOK). Birden çok görseli aynı anda JPEG/PNG/WEBP'e dönüştürür; her
 * dosya tarayıcıda Canvas ile işlenir. framer-motion ile kart giriş/çıkış,
 * "dönüştürülüyor" spinner'ı ve "bitti" checkmark animasyonları.
 */

type Fmt = "jpeg" | "png" | "webp" | "avif"
type Status = "pending" | "converting" | "done" | "error"

interface Entry {
  id: number
  file: File
  srcUrl: string
  status: Status
  result?: { url: string; size: number; name: string }
}

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif,image/heic,image/heif,.heic,.heif"
const FORMATS: { id: Fmt; label: string; mime: string; ext: string; lossy: boolean }[] = [
  { id: "webp", label: "WEBP", mime: "image/webp", ext: "webp", lossy: true },
  { id: "jpeg", label: "JPG", mime: "image/jpeg", ext: "jpg", lossy: true },
  { id: "png", label: "PNG", mime: "image/png", ext: "png", lossy: false },
  // AVIF çıktısı yalnız tarayıcı canvas-encode destekliyorsa gösterilir (feature-detect).
  { id: "avif", label: "AVIF", mime: "image/avif", ext: "avif", lossy: true },
]

function humanSize(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(2)} MB`
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

// HEIC/HEIF — tarayıcılar (Safari hariç) decode edemez; heic2any (libheif WASM)
// ile PNG'ye çözüp sonra normal canvas pipeline'ına veririz.
const HEIC_RE = /\.(heic|heif)$/i
function isHeic(f: File): boolean {
  return f.type === "image/heic" || f.type === "image/heif" || HEIC_RE.test(f.name)
}
async function decodeHeic(file: File): Promise<string> {
  const heic2any = (await import("heic2any")).default
  const out = await heic2any({ blob: file, toType: "image/png" })
  const blob = Array.isArray(out) ? out[0]! : out
  return URL.createObjectURL(blob)
}

/** Bir görseli verilen format/kalitede encode edip yalnız boyutunu döndürür
 *  (blob atılır — tahmin için). */
async function encodeSize(url: string, mime: string, quality?: number): Promise<number> {
  const img = await loadImage(url)
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) return 0
  if (mime === "image/jpeg") {
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.drawImage(img, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), mime, quality))
  return blob?.size ?? 0
}

const MAX_EST_FILES = 25 // bunun üstünde canlı tahmin atlanır (perf)

export function ImageConverterTool({ defaultFormat = "webp" }: { defaultFormat?: Fmt } = {}) {
  const t = useTranslations("d")
  const idRef = useRef(0)
  const [entries, setEntries] = useState<Entry[]>([])
  const [fmt, setFmt] = useState<Fmt>(defaultFormat)
  const [quality, setQuality] = useState(0.9)
  const [running, setRunning] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [decoding, setDecoding] = useState(0) // çözülmekte olan HEIC sayısı
  const [estTotal, setEstTotal] = useState<number | null>(null)
  const [estimating, setEstimating] = useState(false)
  // AVIF çıktısı tarayıcıda canvas-encode edilebiliyor mu? (Çoğu tarayıcı encode
  // edemez; edebiliyorsa AVIF hedefi gösterilir. AVIF GİRİŞİ zaten desteklenir.)
  const [avifOk, setAvifOk] = useState(false)

  useEffect(() => {
    try {
      const c = document.createElement("canvas")
      c.width = 2
      c.height = 2
      c.toBlob((b) => setAvifOk(!!b && b.type === "image/avif"), "image/avif")
    } catch {
      /* destek yok */
    }
  }, [])

  const availableFormats = FORMATS.filter((f) => f.id !== "avif" || avifOk)
  const fmtCfg = FORMATS.find((f) => f.id === fmt)!
  const entriesRef = useRef<Entry[]>([])
  entriesRef.current = entries

  const totalSrc = entries.reduce((s, e) => s + e.file.size, 0)
  const srcKey = entries.map((e) => e.id).join(",")

  // ── Canlı çıktı tahmini (izole; entry status'una dokunmaz) ──
  // Format/kalite/dosya seti değişince tüm kaynakları geçici encode edip toplam
  // çıktı boyutunu ölçer (blob atılır). ≤25 dosyada çalışır; debounce'lu.
  useEffect(() => {
    if (entries.length === 0 || entries.length > MAX_EST_FILES) {
      setEstTotal(null)
      setEstimating(false)
      return
    }
    let cancelled = false
    setEstimating(true)
    const timer = setTimeout(async () => {
      let total = 0
      for (const e of entriesRef.current) {
        if (cancelled) return
        try {
          total += await encodeSize(e.srcUrl, fmtCfg.mime, fmtCfg.lossy ? quality : undefined)
        } catch {
          /* tek dosya tahmini atla */
        }
      }
      if (!cancelled) {
        setEstTotal(total)
        setEstimating(false)
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fmt, quality, srcKey])

  const addFiles = useCallback(async (list: FileList | null | undefined) => {
    if (!list) return
    const imgs = Array.from(list).filter((f) => f.type.startsWith("image/") || isHeic(f))
    if (imgs.length === 0) {
      toast.error(t("imgConvNotImage"))
      return
    }
    for (const file of imgs) {
      if (isHeic(file)) {
        // HEIC sırayla çöz (WASM, ağır) — çözülünce karta dönüşür.
        setDecoding((d) => d + 1)
        try {
          const srcUrl = await decodeHeic(file)
          setEntries((prev) => [...prev, { id: ++idRef.current, file, srcUrl, status: "pending" as Status }])
        } catch {
          toast.error(t("imgConvHeicFail"))
        } finally {
          setDecoding((d) => d - 1)
        }
      } else {
        setEntries((prev) => [...prev, { id: ++idRef.current, file, srcUrl: URL.createObjectURL(file), status: "pending" as Status }])
      }
    }
  }, [t])

  const removeEntry = useCallback((id: number) => {
    setEntries((prev) => {
      const e = prev.find((x) => x.id === id)
      if (e) {
        URL.revokeObjectURL(e.srcUrl)
        if (e.result) URL.revokeObjectURL(e.result.url)
      }
      return prev.filter((x) => x.id !== id)
    })
  }, [])

  const clearAll = useCallback(() => {
    setEntries((prev) => {
      prev.forEach((e) => {
        URL.revokeObjectURL(e.srcUrl)
        if (e.result) URL.revokeObjectURL(e.result.url)
      })
      return []
    })
  }, [])

  // Format/kalite değişince dönüştürülmüş sonuçları geçersiz kıl (yeniden dönüştür)
  const changeFormat = useCallback((next: Fmt) => {
    setFmt(next)
    setEntries((prev) =>
      prev.map((e) => {
        if (e.result) URL.revokeObjectURL(e.result.url)
        return { ...e, status: "pending", result: undefined }
      }),
    )
  }, [])

  async function convertOne(e: Entry): Promise<Entry["result"] | null> {
    const img = await loadImage(e.srcUrl)
    const canvas = document.createElement("canvas")
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    if (fmtCfg.mime === "image/jpeg") {
      ctx.fillStyle = "#ffffff" // JPEG alpha desteklemez
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(img, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), fmtCfg.mime, fmtCfg.lossy ? quality : undefined),
    )
    if (!blob) return null
    const base = e.file.name.replace(/\.[^.]+$/, "")
    return { url: URL.createObjectURL(blob), size: blob.size, name: `${base}.${fmtCfg.ext}` }
  }

  const convertAll = useCallback(async () => {
    setRunning(true)
    try {
      // Sıralı — her kart sırayla "converting → done" animasyonu göstersin
      const list = entries
      for (const e of list) {
        setEntries((prev) => prev.map((x) => (x.id === e.id ? { ...x, status: "converting" } : x)))
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
      toast.success(t("imgConvDone"))
    } finally {
      setRunning(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, fmt, quality, t])

  function triggerDownload(url: string, name: string) {
    const a = document.createElement("a")
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const downloadAll = useCallback(() => {
    const done = entries.filter((e) => e.result)
    if (done.length === 0) return
    // Tarayıcı tek izinle çoklu indirmeye olanak verir; küçük gecikmeyle sırala
    done.forEach((e, i) => {
      setTimeout(() => triggerDownload(e.result!.url, e.result!.name), i * 150)
    })
  }, [entries])

  const doneCount = entries.filter((e) => e.status === "done").length
  const allDone = entries.length > 0 && doneCount === entries.length

  // ── Boş durum ──
  if (entries.length === 0) {
    if (decoding > 0) {
      return (
        <div className="mx-auto mt-10 flex max-w-3xl items-center justify-center gap-3 rounded-3xl border bg-card py-24 text-sm text-muted-foreground">
          <Spinner />
          {t("imgConvDecoding")}
        </div>
      )
    }
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
            void addFiles(e.dataTransfer.files)
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
            <span className="text-lg font-semibold">{t("imgConvDrop")}</span>
            <span className="text-sm text-muted-foreground">{t("imgConvFormats")}</span>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            🔒 {t("imgConvPrivacy")}
          </span>
          <input
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => void addFiles(e.target.files)}
          />
        </label>
      </div>
    )
  }

  // ── Editör: format toolbar + dosya kartları gridi ──
  return (
    <div className="mt-6 flex flex-col gap-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("imgConvTarget")}
        </span>
        <div className="flex gap-1.5">
          {availableFormats.map((f) => (
            <button
              key={f.id}
              onClick={() => changeFormat(f.id)}
              disabled={running}
              className={
                "rounded-full px-3.5 py-1.5 text-xs transition-colors disabled:opacity-50 " +
                (fmt === f.id
                  ? "bg-primary font-medium text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70")
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        <AnimatePresence>
          {fmtCfg.lossy ? (
            <motion.label
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              className="flex items-center gap-2 overflow-hidden whitespace-nowrap"
            >
              <span className="text-[11px] text-muted-foreground">
                {t("imgConvQuality")} {Math.round(quality * 100)}%
              </span>
              <input
                type="range"
                min={0.3}
                max={1}
                step={0.01}
                value={quality}
                disabled={running}
                onChange={(e) => {
                  setQuality(Number(e.target.value))
                  setEntries((prev) =>
                    prev.map((x) => {
                      if (x.result) URL.revokeObjectURL(x.result.url)
                      return { ...x, status: "pending", result: undefined }
                    }),
                  )
                }}
                className="w-28 accent-primary"
              />
            </motion.label>
          ) : null}
        </AnimatePresence>

        {/* Mevcut → tahmini çıktı boyutu */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="tabular-nums">{humanSize(totalSrc)}</span>
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3" />
          {estimating ? (
            <span className="inline-flex items-center gap-1">
              <Spinner small />
              {t("imgConvEstimating")}
            </span>
          ) : estTotal != null ? (
            <motion.span
              key={estTotal}
              initial={{ opacity: 0, y: 2 }}
              animate={{ opacity: 1, y: 0 }}
              className={
                "font-medium tabular-nums " +
                (estTotal <= totalSrc ? "text-emerald-500" : "text-amber-500")
              }
            >
              ~{humanSize(estTotal)}
            </motion.span>
          ) : (
            <span className="text-muted-foreground/50">{entries.length > MAX_EST_FILES ? t("imgConvEstSkipped") : "—"}</span>
          )}
        </div>

        <div className="ms-auto flex items-center gap-2">
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors hover:bg-muted">
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4" />
            {t("imgConvAddMore")}
            <input type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => void addFiles(e.target.files)} />
          </label>
          <button
            onClick={clearAll}
            disabled={running}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {t("imgConvClear")}
          </button>
        </div>
      </div>

      {/* Dosya kartları */}
      <LayoutGroup>
        <motion.div layout className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {entries.map((e) => (
              <motion.div
                key={e.id}
                layout
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
                className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card"
              >
                {/* Thumbnail */}
                <div className="relative aspect-square overflow-hidden bg-black/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={e.srcUrl} alt={e.file.name} className="size-full object-cover" />

                  {/* Converting overlay */}
                  <AnimatePresence>
                    {e.status === "converting" ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-[2px]"
                      >
                        <Spinner />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  {/* Done badge */}
                  <AnimatePresence>
                    {e.status === "done" ? (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 500, damping: 22 }}
                        className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
                      >
                        <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2.5} className="size-4" />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  {/* Remove */}
                  <button
                    onClick={() => removeEntry(e.id)}
                    className="absolute left-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur transition-opacity hover:bg-black/70 group-hover:opacity-100"
                    aria-label="Remove"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
                  </button>
                </div>

                {/* Bilgi */}
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <span className="truncate text-xs font-medium" title={e.file.name}>
                    {e.file.name}
                  </span>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="uppercase">{e.file.type.split("/")[1] || "?"}</span>
                    <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3" />
                    <span className="font-medium uppercase text-foreground/80">{fmtCfg.ext}</span>
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-1">
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {humanSize(e.file.size)}
                      {e.result ? (
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className={
                            e.result.size <= e.file.size ? "text-emerald-500" : "text-amber-500"
                          }
                        >
                          {" → "}
                          {humanSize(e.result.size)}
                        </motion.span>
                      ) : null}
                    </span>
                    {e.result ? (
                      <button
                        onClick={() => triggerDownload(e.result!.url, e.result!.name)}
                        className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors hover:bg-primary/20"
                        aria-label="Download"
                      >
                        <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="size-4" />
                      </button>
                    ) : e.status === "error" ? (
                      <span className="text-[11px] text-destructive">{t("imgConvFailed")}</span>
                    ) : null}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </LayoutGroup>

      {/* Alt aksiyon barı */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {t("imgConvCount", { count: entries.length })}
          {doneCount > 0 ? ` · ${t("imgConvDoneCount", { count: doneCount })}` : ""}
        </span>
        <div className="flex items-center gap-2">
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
            className="inline-flex h-11 min-w-40 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {running ? (
              <>
                <Spinner small />
                {t("imgConvConverting")}
              </>
            ) : (
              t("imgConvConvertAll")
            )}
          </button>
        </div>
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
