"use client"

import { useCallback, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { motion, AnimatePresence, LayoutGroup } from "framer-motion"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { ImageAdd01Icon, Cancel01Icon, Add01Icon, Pdf01Icon } from "@hugeicons/core-free-icons"

/**
 * tools.sentroy.com — JPG to PDF (client, server'a yükleme YOK). Çoklu görsel
 * → tek PDF (pdf-lib). Tüm girişler Canvas ile JPEG'e normalize edilip embed
 * edilir (webp/png dahil). Sayfa: görsele sığdır / A4 / Letter. Tarayıcıda.
 */

type PageMode = "fit" | "a4" | "letter"
const PAGE_SIZES: Record<"a4" | "letter", [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
}

interface Entry {
  id: number
  file: File
  srcUrl: string
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

async function toJpeg(url: string): Promise<{ bytes: Uint8Array; w: number; h: number }> {
  const img = await loadImage(url)
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), "image/jpeg", 0.92))
  const buf = await blob!.arrayBuffer()
  return { bytes: new Uint8Array(buf), w: canvas.width, h: canvas.height }
}

export function JpgToPdfTool() {
  const t = useTranslations("d")
  const idRef = useRef(0)
  const [entries, setEntries] = useState<Entry[]>([])
  const [pageMode, setPageMode] = useState<PageMode>("fit")
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)

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
        ...imgs.map((file) => ({ id: ++idRef.current, file, srcUrl: URL.createObjectURL(file) })),
      ])
    },
    [t],
  )

  const removeEntry = useCallback((id: number) => {
    setEntries((prev) => {
      const e = prev.find((x) => x.id === id)
      if (e) URL.revokeObjectURL(e.srcUrl)
      return prev.filter((x) => x.id !== id)
    })
  }, [])

  const clearAll = useCallback(() => {
    setEntries((prev) => {
      prev.forEach((e) => URL.revokeObjectURL(e.srcUrl))
      return []
    })
  }, [])

  const createPdf = useCallback(async () => {
    if (entries.length === 0) return
    setBusy(true)
    try {
      const { PDFDocument } = await import("pdf-lib")
      const doc = await PDFDocument.create()
      for (const e of entries) {
        const { bytes, w, h } = await toJpeg(e.srcUrl)
        const img = await doc.embedJpg(bytes)
        if (pageMode === "fit") {
          const page = doc.addPage([w, h])
          page.drawImage(img, { x: 0, y: 0, width: w, height: h })
        } else {
          const [pw, ph] = PAGE_SIZES[pageMode]
          const margin = 24
          const aw = pw - margin * 2
          const ah = ph - margin * 2
          const scale = Math.min(aw / w, ah / h)
          const dw = w * scale
          const dh = h * scale
          const page = doc.addPage([pw, ph])
          page.drawImage(img, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh })
        }
      }
      const pdfBytes = await doc.save()
      const blob = new Blob([pdfBytes as BlobPart], { type: "application/pdf" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "images.pdf"
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success(t("jpgPdfDone", { count: entries.length }))
    } catch {
      toast.error(t("toolGenericError"))
    } finally {
      setBusy(false)
    }
  }, [entries, pageMode, t])

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
            <span className="text-lg font-semibold">{t("jpgPdfDrop")}</span>
            <span className="text-sm text-muted-foreground">{t("jpgPdfHint")}</span>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">🔒 {t("imgCompPrivacy")}</span>
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        </label>
      </div>
    )
  }

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("jpgPdfPage")}</span>
          <div className="flex gap-1.5">
            {(["fit", "a4", "letter"] as PageMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setPageMode(m)}
                className={
                  "rounded-full px-3 py-1.5 text-xs transition-colors " +
                  (pageMode === m
                    ? "bg-primary font-medium text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70")
                }
              >
                {m === "fit" ? t("jpgPdfFit") : m.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors hover:bg-muted">
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4" />
            {t("imgConvAddMore")}
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
          </label>
          <button
            onClick={clearAll}
            disabled={busy}
            className="inline-flex h-9 items-center rounded-xl border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {t("imgConvClear")}
          </button>
        </div>
      </div>

      <LayoutGroup>
        <motion.div layout className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <AnimatePresence mode="popLayout">
            {entries.map((e, i) => (
              <motion.div
                key={e.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
                className="group relative aspect-[3/4] overflow-hidden rounded-xl border bg-black/40"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.srcUrl} alt={e.file.name} className="size-full object-cover" />
                <span className="absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-[10px] font-bold text-white">
                  {i + 1}
                </span>
                <button
                  onClick={() => removeEntry(e.id)}
                  className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur transition-opacity hover:bg-black/70 group-hover:opacity-100"
                  aria-label="Remove"
                >
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </LayoutGroup>

      <button
        onClick={createPdf}
        disabled={busy}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        <HugeiconsIcon icon={Pdf01Icon} strokeWidth={2} className="size-5" />
        {busy ? t("jpgPdfCreating") : t("jpgPdfCreate", { count: entries.length })}
      </button>
    </div>
  )
}
