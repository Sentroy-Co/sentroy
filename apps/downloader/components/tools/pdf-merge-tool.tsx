"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { motion, AnimatePresence, LayoutGroup } from "framer-motion"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Pdf01Icon, Cancel01Icon, Add01Icon, ArrowUp01Icon, ArrowDown01Icon, Layers01Icon } from "@hugeicons/core-free-icons"

/** PDF Merge — çoklu PDF'i sırayla tek dosyada birleştir (pdf-lib). Saf client. */

interface Entry {
  id: number
  file: File
  pages: number | null
}

function humanSize(b: number): string {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(2)} MB`
}

export function PdfMergeTool() {
  const t = useTranslations("d")
  const idRef = useRef(0)
  const [entries, setEntries] = useState<Entry[]>([])
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  // Yeni eklenen dosyaların sayfa sayısını async oku
  useEffect(() => {
    const pending = entries.filter((e) => e.pages === null)
    if (pending.length === 0) return
    let cancelled = false
    ;(async () => {
      const { PDFDocument } = await import("pdf-lib")
      for (const e of pending) {
        try {
          const doc = await PDFDocument.load(await e.file.arrayBuffer(), { updateMetadata: false })
          const n = doc.getPageCount()
          if (!cancelled) setEntries((prev) => prev.map((x) => (x.id === e.id ? { ...x, pages: n } : x)))
        } catch {
          if (!cancelled) setEntries((prev) => prev.map((x) => (x.id === e.id ? { ...x, pages: 0 } : x)))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [entries])

  const addFiles = useCallback(
    (list: FileList | null | undefined) => {
      if (!list) return
      const pdfs = Array.from(list).filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))
      if (pdfs.length === 0) {
        toast.error(t("pdfNotPdf"))
        return
      }
      setEntries((prev) => [...prev, ...pdfs.map((file) => ({ id: ++idRef.current, file, pages: null }))])
    },
    [t],
  )

  const remove = (id: number) => setEntries((p) => p.filter((x) => x.id !== id))
  const clearAll = () => setEntries([])
  const move = (id: number, dir: -1 | 1) =>
    setEntries((p) => {
      const i = p.findIndex((x) => x.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= p.length) return p
      const next = [...p]
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    })

  const merge = useCallback(async () => {
    if (entries.length < 2) {
      toast.error(t("pdfMergeNeed2"))
      return
    }
    setBusy(true)
    try {
      const { PDFDocument } = await import("pdf-lib")
      const out = await PDFDocument.create()
      for (const e of entries) {
        const src = await PDFDocument.load(await e.file.arrayBuffer())
        const pages = await out.copyPages(src, src.getPageIndices())
        pages.forEach((p) => out.addPage(p))
      }
      const bytes = await out.save()
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "merged.pdf"
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success(t("pdfMergeDone", { count: entries.length }))
    } catch {
      toast.error(t("toolGenericError"))
    } finally {
      setBusy(false)
    }
  }, [entries, t])

  const totalPages = entries.reduce((s, e) => s + (e.pages ?? 0), 0)

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
            <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} className="size-8" />
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-lg font-semibold">{t("pdfMergeDrop")}</span>
            <span className="text-sm text-muted-foreground">{t("pdfMergeHint")}</span>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">🔒 {t("imgCompPrivacy")}</span>
          <input type="file" accept="application/pdf" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        </label>
      </div>
    )
  }

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {t("imgConvCount", { count: entries.length })} · {t("pdfPages", { count: totalPages })}
        </span>
        <div className="flex items-center gap-2">
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors hover:bg-muted">
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4" />
            {t("imgConvAddMore")}
            <input type="file" accept="application/pdf" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
          </label>
          <button onClick={clearAll} disabled={busy} className="inline-flex h-9 items-center rounded-xl border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50">
            {t("imgConvClear")}
          </button>
        </div>
      </div>

      <LayoutGroup>
        <motion.div layout className="flex flex-col gap-2">
          <AnimatePresence mode="popLayout">
            {entries.map((e, i) => (
              <motion.div
                key={e.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 320, damping: 30 }}
                className="flex items-center gap-3 rounded-2xl border bg-card p-3"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-bold text-muted-foreground">{i + 1}</span>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <HugeiconsIcon icon={Pdf01Icon} strokeWidth={2} className="size-5" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium" title={e.file.name}>{e.file.name}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {e.pages === null ? "…" : t("pdfPages", { count: e.pages })} · {humanSize(e.file.size)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button onClick={() => move(e.id, -1)} disabled={i === 0} className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30" aria-label="Up">
                    <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} className="size-4" />
                  </button>
                  <button onClick={() => move(e.id, 1)} disabled={i === entries.length - 1} className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30" aria-label="Down">
                    <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-4" />
                  </button>
                  <button onClick={() => remove(e.id)} className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted" aria-label="Remove">
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </LayoutGroup>

      <button
        onClick={merge}
        disabled={busy || entries.length < 2}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} className="size-5" />
        {busy ? t("pdfMerging") : t("pdfMergeBtn", { count: entries.length })}
      </button>
    </div>
  )
}
