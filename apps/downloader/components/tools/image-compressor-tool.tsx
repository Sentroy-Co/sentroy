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
} from "@hugeicons/core-free-icons"

/**
 * tools.sentroy.com — Image Compressor (client/WASM, çoklu dosya, server'a
 * yükleme YOK). `mode="jpg"` → JPEG kalite-tabanlı sıkıştırma (Canvas);
 * `mode="png"` → renk kuantizasyonu (UPNG.js, lazy import). Hazır sıkıştırma
 * seviyeleri + canlı boyut/%kazanç tahmini + framer-motion animasyonları.
 * Tek bileşen iki SEO sayfasını besler (compress-jpg, compress-png).
 */

type Mode = "jpg" | "png"
type Status = "pending" | "working" | "done" | "error"

interface Entry {
  id: number
  file: File
  srcUrl: string
  status: Status
  result?: { url: string; size: number; name: string }
}

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif"
const MAX_EST_FILES = 12

// Seviye → encoder parametresi. JPG: quality (0-1). PNG: cnum (renk; 0=lossless).
const JPG_LEVELS = [
  { id: "best", q: 0.92 },
  { id: "high", q: 0.82 },
  { id: "balanced", q: 0.65 },
  { id: "small", q: 0.5 },
  { id: "tiny", q: 0.35 },
]
const PNG_LEVELS = [
  { id: "lossless", cnum: 0 },
  { id: "high", cnum: 256 },
  { id: "balanced", cnum: 128 },
  { id: "small", cnum: 64 },
  { id: "tiny", cnum: 32 },
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

async function encodeBlob(url: string, mode: Mode, param: number): Promise<Blob | null> {
  const img = await loadImage(url)
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  if (mode === "jpg") {
    ctx.fillStyle = "#ffffff" // JPEG alpha desteklemez
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(img, 0, 0)
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", param))
  }
  // PNG → UPNG kuantizasyon (param = cnum; 0 = lossless), lazy import
  ctx.drawImage(img, 0, 0)
  const id = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const UPNG = (await import("upng-js")).default
  const out = UPNG.encode([id.data.buffer as ArrayBuffer], canvas.width, canvas.height, param)
  return new Blob([out], { type: "image/png" })
}

export function ImageCompressorTool({ mode }: { mode: Mode }) {
  const t = useTranslations("d")
  const idRef = useRef(0)
  const levels = mode === "jpg" ? JPG_LEVELS : PNG_LEVELS
  const [entries, setEntries] = useState<Entry[]>([])
  const [levelId, setLevelId] = useState("balanced")
  const [running, setRunning] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [estTotal, setEstTotal] = useState<number | null>(null)
  const [estimating, setEstimating] = useState(false)

  const ext = mode === "jpg" ? "jpg" : "png"
  const param =
    mode === "jpg"
      ? (JPG_LEVELS.find((l) => l.id === levelId)?.q ?? 0.65)
      : (PNG_LEVELS.find((l) => l.id === levelId)?.cnum ?? 128)

  const entriesRef = useRef<Entry[]>([])
  entriesRef.current = entries
  const totalSrc = entries.reduce((s, e) => s + e.file.size, 0)
  const srcKey = entries.map((e) => e.id).join(",")

  const LEVEL_LABELS: Record<string, string> = {
    best: t("imgCompBest"),
    high: t("imgCompHigh"),
    balanced: t("imgCompBalanced"),
    small: t("imgCompSmall"),
    tiny: t("imgCompTiny"),
    lossless: t("imgCompLossless"),
  }

  function levelSub(l: { id: string; q?: number; cnum?: number }): string {
    if (mode === "jpg") return `${Math.round((l.q ?? 0) * 100)}%`
    return l.cnum === 0 ? "" : `${l.cnum}`
  }

  // ── Canlı toplam çıktı tahmini (izole; debounce'lu; PNG ağır → ≤12 dosya) ──
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
          const blob = await encodeBlob(e.srcUrl, mode, param)
          total += blob?.size ?? 0
        } catch {
          /* atla */
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
  }, [levelId, srcKey, mode])

  const addFiles = useCallback(
    (list: FileList | null | undefined) => {
      if (!list) return
      const imgs = Array.from(list).filter((f) => f.type.startsWith("image/"))
      if (imgs.length === 0) {
        toast.error(t("imgConvNotImage"))
        return
      }
      setEntries((prev) => [
        ...prev,
        ...imgs.map((file) => ({
          id: ++idRef.current,
          file,
          srcUrl: URL.createObjectURL(file),
          status: "pending" as Status,
        })),
      ])
    },
    [t],
  )

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

  const changeLevel = useCallback((id: string) => {
    setLevelId(id)
    setEntries((prev) =>
      prev.map((e) => {
        if (e.result) URL.revokeObjectURL(e.result.url)
        return { ...e, status: "pending", result: undefined }
      }),
    )
  }, [])

  const compressAll = useCallback(async () => {
    setRunning(true)
    try {
      for (const e of entriesRef.current) {
        setEntries((prev) => prev.map((x) => (x.id === e.id ? { ...x, status: "working" } : x)))
        try {
          const blob = await encodeBlob(e.srcUrl, mode, param)
          if (!blob) {
            setEntries((prev) => prev.map((x) => (x.id === e.id ? { ...x, status: "error" } : x)))
            continue
          }
          const base = e.file.name.replace(/\.[^.]+$/, "")
          const url = URL.createObjectURL(blob)
          setEntries((prev) =>
            prev.map((x) =>
              x.id === e.id
                ? { ...x, status: "done", result: { url, size: blob.size, name: `${base}.${ext}` } }
                : x,
            ),
          )
        } catch {
          setEntries((prev) => prev.map((x) => (x.id === e.id ? { ...x, status: "error" } : x)))
        }
      }
      toast.success(t("imgCompDone"))
    } finally {
      setRunning(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, param, ext, t])

  function triggerDownload(url: string, name: string) {
    const a = document.createElement("a")
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const downloadAll = useCallback(() => {
    entries.filter((e) => e.result).forEach((e, i) => {
      setTimeout(() => triggerDownload(e.result!.url, e.result!.name), i * 150)
    })
  }, [entries])

  const doneCount = entries.filter((e) => e.status === "done").length
  const allDone = entries.length > 0 && doneCount === entries.length
  const savedPct = estTotal != null && totalSrc > 0 ? Math.round((1 - estTotal / totalSrc) * 100) : null

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
            <HugeiconsIcon icon={ImageAdd01Icon} strokeWidth={2} className="size-8" />
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-lg font-semibold">{t("imgCompDrop")}</span>
            <span className="text-sm text-muted-foreground">{t("imgConvFormats")}</span>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            🔒 {t("imgCompPrivacy")}
          </span>
          <input type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        </label>
      </div>
    )
  }

  // ── Editör ──
  return (
    <div className="mt-6 flex flex-col gap-5">
      {/* Sıkıştırma seviyesi presetleri */}
      <section className="flex flex-col gap-2.5 rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("imgCompLevel")}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="tabular-nums">{humanSize(totalSrc)}</span>
            <span>→</span>
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
                className="inline-flex items-center gap-1.5"
              >
                <span className={"font-medium tabular-nums " + (estTotal <= totalSrc ? "text-emerald-500" : "text-amber-500")}>
                  ~{humanSize(estTotal)}
                </span>
                {savedPct != null && savedPct > 0 ? (
                  <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-500">
                    −{savedPct}%
                  </span>
                ) : null}
              </motion.span>
            ) : (
              <span className="text-muted-foreground/50">
                {entries.length > MAX_EST_FILES ? t("imgConvEstSkipped") : "—"}
              </span>
            )}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {levels.map((l) => {
            const active = levelId === l.id
            return (
              <motion.button
                key={l.id}
                onClick={() => changeLevel(l.id)}
                disabled={running}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.97 }}
                className={
                  "flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2.5 transition-colors disabled:opacity-50 " +
                  (active ? "border-primary bg-primary/10" : "border-border hover:border-primary/40 hover:bg-muted/40")
                }
              >
                <span className={"text-xs font-medium " + (active ? "text-primary" : "text-foreground/90")}>
                  {LEVEL_LABELS[l.id]}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground/70">{levelSub(l)}</span>
              </motion.button>
            )
          })}
        </div>
      </section>

      {/* Toolbar: ekle / temizle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {t("imgConvCount", { count: entries.length })}
          {doneCount > 0 ? ` · ${t("imgConvDoneCount", { count: doneCount })}` : ""}
        </span>
        <div className="flex items-center gap-2">
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors hover:bg-muted">
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4" />
            {t("imgConvAddMore")}
            <input type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
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

      {/* Kartlar */}
      <LayoutGroup>
        <motion.div layout className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {entries.map((e) => {
              const pct = e.result && e.file.size > 0 ? Math.round((1 - e.result.size / e.file.size) * 100) : null
              return (
                <motion.div
                  key={e.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 320, damping: 28 }}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card"
                >
                  <div className="relative aspect-square overflow-hidden bg-black/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={e.srcUrl} alt={e.file.name} className="size-full object-cover" />
                    <AnimatePresence>
                      {e.status === "working" ? (
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
                    <AnimatePresence>
                      {e.status === "done" && pct != null ? (
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: "spring", stiffness: 500, damping: 22 }}
                          className={
                            "absolute right-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-bold shadow-lg " +
                            (pct > 0 ? "bg-emerald-500 text-white" : "bg-amber-500 text-white")
                          }
                        >
                          {pct > 0 ? `−${pct}%` : `+${-pct}%`}
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                    <button
                      onClick={() => removeEntry(e.id)}
                      className="absolute left-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur transition-opacity hover:bg-black/70 group-hover:opacity-100"
                      aria-label="Remove"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <span className="truncate text-xs font-medium" title={e.file.name}>
                      {e.file.name}
                    </span>
                    <div className="mt-auto flex items-center justify-between pt-1">
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {humanSize(e.file.size)}
                        {e.result ? (
                          <span className={e.result.size <= e.file.size ? "text-emerald-500" : "text-amber-500"}>
                            {" → "}
                            {humanSize(e.result.size)}
                          </span>
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
                      ) : e.status === "done" ? (
                        <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="size-4 text-primary" />
                      ) : e.status === "error" ? (
                        <span className="text-[11px] text-destructive">{t("imgConvFailed")}</span>
                      ) : null}
                    </div>
                  </div>
                </motion.div>
              )
            })}
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
          onClick={compressAll}
          disabled={running || entries.length === 0}
          className="inline-flex h-11 min-w-44 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {running ? (
            <>
              <Spinner small />
              {t("imgCompCompressing")}
            </>
          ) : (
            t("imgCompCompressAll")
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
