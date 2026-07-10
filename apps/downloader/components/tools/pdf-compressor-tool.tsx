"use client"

import { useCallback, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { motion, AnimatePresence, LayoutGroup } from "framer-motion"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Pdf01Icon, Download01Icon, Cancel01Icon, Add01Icon } from "@hugeicons/core-free-icons"

/**
 * tools.sentroy.com — PDF Compressor (client, server'a yükleme YOK). pdfjs ile
 * her sayfa seçili DPI'da canvas'a render edilir, JPEG'e indirgenip pdf-lib ile
 * yeni PDF'e gömülür (rasterize sıkıştırma — görsel/taranmış PDF'lerde büyük
 * kazanç; metin seçilebilirliği kaybolur). Çoklu dosya + ilerleme + %kazanç.
 */

type Status = "pending" | "working" | "done" | "error"
interface Entry {
  id: number
  file: File
  status: Status
  progress: number
  result?: { url: string; size: number; name: string }
}

// Seviye → (DPI, JPEG kalite)
const LEVELS = [
  { id: "high", dpi: 150, q: 0.75 },
  { id: "balanced", dpi: 120, q: 0.6 },
  { id: "small", dpi: 96, q: 0.5 },
  { id: "tiny", dpi: 72, q: 0.42 },
]

function humanSize(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(2)} MB`
}

let workerReady = false

export function PdfCompressorTool() {
  const t = useTranslations("d")
  const idRef = useRef(0)
  const [entries, setEntries] = useState<Entry[]>([])
  const [levelId, setLevelId] = useState("balanced")
  const [running, setRunning] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const entriesRef = useRef<Entry[]>([])
  entriesRef.current = entries
  const level = LEVELS.find((l) => l.id === levelId)!

  const LEVEL_LABELS: Record<string, string> = {
    high: t("imgCompHigh"),
    balanced: t("imgCompBalanced"),
    small: t("imgCompSmall"),
    tiny: t("imgCompTiny"),
  }

  const addFiles = useCallback(
    (list: FileList | null | undefined) => {
      if (!list) return
      const pdfs = Array.from(list).filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))
      if (pdfs.length === 0) {
        toast.error(t("pdfNotPdf"))
        return
      }
      setEntries((prev) => [
        ...prev,
        ...pdfs.map((file) => ({ id: ++idRef.current, file, status: "pending" as Status, progress: 0 })),
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

  async function compressOne(e: Entry): Promise<Entry["result"] | null> {
    const pdfjs = await import("pdfjs-dist")
    if (!workerReady) {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
      workerReady = true
    }
    const { PDFDocument } = await import("pdf-lib")
    const data = new Uint8Array(await e.file.arrayBuffer())
    const pdf = await pdfjs.getDocument({ data }).promise
    const out = await PDFDocument.create()
    const scale = level.dpi / 72
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")!
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p)
      const viewport = page.getViewport({ scale })
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, viewport }).promise
      const jpeg = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), "image/jpeg", level.q))
      if (jpeg) {
        const img = await out.embedJpg(new Uint8Array(await jpeg.arrayBuffer()))
        const pg = out.addPage([canvas.width, canvas.height])
        pg.drawImage(img, { x: 0, y: 0, width: canvas.width, height: canvas.height })
      }
      setEntries((prev) => prev.map((x) => (x.id === e.id ? { ...x, progress: p / pdf.numPages } : x)))
      await new Promise((r) => setTimeout(r, 0))
    }
    const bytes = await out.save()
    const blob = new Blob([bytes as BlobPart], { type: "application/pdf" })
    const base = e.file.name.replace(/\.[^.]+$/, "")
    return { url: URL.createObjectURL(blob), size: blob.size, name: `${base}-compressed.pdf` }
  }

  const compressAll = useCallback(async () => {
    setRunning(true)
    try {
      for (const e of entriesRef.current) {
        if (e.status === "done") continue
        setEntries((prev) => prev.map((x) => (x.id === e.id ? { ...x, status: "working", progress: 0 } : x)))
        try {
          const result = await compressOne(e)
          setEntries((prev) =>
            prev.map((x) => (x.id === e.id ? { ...x, status: result ? "done" : "error", result: result ?? undefined } : x)),
          )
        } catch {
          setEntries((prev) => prev.map((x) => (x.id === e.id ? { ...x, status: "error" } : x)))
        }
      }
      toast.success(t("pdfDone"))
    } finally {
      setRunning(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelId, t])

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
            <HugeiconsIcon icon={Pdf01Icon} strokeWidth={2} className="size-8" />
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-lg font-semibold">{t("pdfDrop")}</span>
            <span className="text-sm text-muted-foreground">{t("pdfHint")}</span>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">🔒 {t("imgCompPrivacy")}</span>
          <input type="file" accept="application/pdf" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        </label>
      </div>
    )
  }

  return (
    <div className="mt-6 flex flex-col gap-5">
      <section className="flex flex-col gap-2.5 rounded-2xl border bg-card p-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("imgCompLevel")}</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {LEVELS.map((l) => {
            const active = levelId === l.id
            return (
              <button
                key={l.id}
                onClick={() => setLevelId(l.id)}
                disabled={running}
                className={
                  "flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2.5 transition-colors disabled:opacity-50 " +
                  (active ? "border-primary bg-primary/10" : "border-border hover:border-primary/40 hover:bg-muted/40")
                }
              >
                <span className={"text-xs font-medium " + (active ? "text-primary" : "text-foreground/90")}>
                  {LEVEL_LABELS[l.id]}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground/70">{l.dpi} DPI</span>
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-muted-foreground/70">{t("pdfNote")}</p>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {t("imgConvCount", { count: entries.length })}
          {doneCount > 0 ? ` · ${t("imgConvDoneCount", { count: doneCount })}` : ""}
        </span>
        <div className="flex items-center gap-2">
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors hover:bg-muted">
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4" />
            {t("imgConvAddMore")}
            <input type="file" accept="application/pdf" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
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

      <LayoutGroup>
        <motion.div layout className="flex flex-col gap-2">
          <AnimatePresence mode="popLayout">
            {entries.map((e) => {
              const pct = e.result && e.file.size > 0 ? Math.round((1 - e.result.size / e.file.size) * 100) : null
              return (
                <motion.div
                  key={e.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 320, damping: 30 }}
                  className="flex items-center gap-3 rounded-2xl border bg-card p-3"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <HugeiconsIcon icon={Pdf01Icon} strokeWidth={2} className="size-5" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium" title={e.file.name}>
                      {e.file.name}
                    </span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {humanSize(e.file.size)}
                      {e.result ? (
                        <span className={e.result.size <= e.file.size ? "text-emerald-500" : "text-amber-500"}>
                          {" → "}
                          {humanSize(e.result.size)}
                          {pct != null ? ` (${pct > 0 ? "−" : "+"}${Math.abs(pct)}%)` : ""}
                        </span>
                      ) : null}
                    </span>
                    {e.status === "working" ? (
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                        <motion.div
                          className="h-full bg-primary"
                          animate={{ width: `${Math.round(e.progress * 100)}%` }}
                          transition={{ ease: "linear", duration: 0.2 }}
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {e.status === "working" ? (
                      <Spinner />
                    ) : e.result ? (
                      <button
                        onClick={() => triggerDownload(e.result!.url, e.result!.name)}
                        className="inline-flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors hover:bg-primary/20"
                        aria-label="Download"
                      >
                        <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="size-4" />
                      </button>
                    ) : e.status === "error" ? (
                      <span className="text-[11px] text-destructive">{t("imgConvFailed")}</span>
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
              )
            })}
          </AnimatePresence>
        </motion.div>
      </LayoutGroup>

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
              {t("pdfCompressing")}
            </>
          ) : (
            t("pdfCompress")
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
      className={small ? "size-4" : "size-5"}
      style={{ display: "inline-block" }}
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-full">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </motion.span>
  )
}
