"use client"

import { useCallback, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Scissor01Icon, Pdf01Icon, Download01Icon, Cancel01Icon } from "@hugeicons/core-free-icons"

/** PDF Split — PDF'i tek tek sayfalara böl veya bir aralık çıkar (pdf-lib). Saf client. */

type Mode = "each" | "range"

function triggerDownload(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function PdfSplitTool() {
  const t = useTranslations("d")
  const [file, setFile] = useState<File | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [mode, setMode] = useState<Mode>("each")
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(1)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const onPick = useCallback(
    async (f: File | undefined) => {
      if (!f) return
      if (!(f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))) {
        toast.error(t("pdfNotPdf"))
        return
      }
      try {
        const { PDFDocument } = await import("pdf-lib")
        const doc = await PDFDocument.load(await f.arrayBuffer(), { updateMetadata: false })
        const n = doc.getPageCount()
        setFile(f)
        setPageCount(n)
        setFrom(1)
        setTo(n)
      } catch {
        toast.error(t("pdfSplitBad"))
      }
    },
    [t],
  )

  const base = file ? file.name.replace(/\.[^.]+$/, "") : "document"

  const run = useCallback(async () => {
    if (!file) return
    setBusy(true)
    try {
      const { PDFDocument } = await import("pdf-lib")
      const src = await PDFDocument.load(await file.arrayBuffer())
      if (mode === "each") {
        for (let i = 0; i < pageCount; i++) {
          const doc = await PDFDocument.create()
          const [pg] = await doc.copyPages(src, [i])
          doc.addPage(pg!)
          const bytes = await doc.save()
          // tarayıcı çoklu indirmeyi tek izinle yapar; küçük stagger
          setTimeout(() => triggerDownload(bytes, `${base}-page-${i + 1}.pdf`), i * 150)
        }
        toast.success(t("pdfSplitDoneEach", { count: pageCount }))
      } else {
        const f = Math.max(1, Math.min(from, pageCount))
        const tto = Math.max(f, Math.min(to, pageCount))
        const idx = Array.from({ length: tto - f + 1 }, (_, k) => f - 1 + k)
        const doc = await PDFDocument.create()
        const pages = await doc.copyPages(src, idx)
        pages.forEach((p) => doc.addPage(p))
        const bytes = await doc.save()
        triggerDownload(bytes, `${base}-pages-${f}-${tto}.pdf`)
        toast.success(t("pdfSplitDoneRange"))
      }
    } catch {
      toast.error(t("toolGenericError"))
    } finally {
      setBusy(false)
    }
  }, [file, mode, from, to, pageCount, base, t])

  if (!file) {
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
            <span className="text-lg font-semibold">{t("pdfSplitDrop")}</span>
            <span className="text-sm text-muted-foreground">{t("pdfSplitHint")}</span>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">🔒 {t("imgCompPrivacy")}</span>
          <input type="file" accept="application/pdf" className="hidden" onChange={(e) => void onPick(e.target.files?.[0])} />
        </label>
      </div>
    )
  }

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex items-center gap-3 rounded-2xl border bg-card p-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <HugeiconsIcon icon={Pdf01Icon} strokeWidth={2} className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{file.name}</span>
          <span className="text-[11px] text-muted-foreground">{t("pdfPages", { count: pageCount })}</span>
        </div>
        <button onClick={() => setFile(null)} className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Remove">
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-4" />
        </button>
      </div>

      {/* Mod */}
      <div className="flex gap-1.5">
        {(["each", "range"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={
              "flex-1 rounded-xl px-4 py-2.5 text-sm transition-colors " +
              (mode === m ? "bg-primary font-medium text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70")
            }
          >
            {m === "each" ? t("pdfSplitEach") : t("pdfSplitRange")}
          </button>
        ))}
      </div>

      {mode === "range" ? (
        <div className="flex items-end gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">{t("pdfSplitFrom")}</span>
            <input
              type="number"
              min={1}
              max={pageCount}
              value={from}
              onChange={(e) => setFrom(Math.max(1, Math.min(Number(e.target.value) || 1, pageCount)))}
              className="h-11 rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary"
            />
          </label>
          <span className="pb-3 text-muted-foreground">–</span>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">{t("pdfSplitTo")}</span>
            <input
              type="number"
              min={1}
              max={pageCount}
              value={to}
              onChange={(e) => setTo(Math.max(1, Math.min(Number(e.target.value) || 1, pageCount)))}
              className="h-11 rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary"
            />
          </label>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed bg-card/40 px-4 py-3 text-sm text-muted-foreground">
          {t("pdfSplitEachNote", { count: pageCount })}
        </p>
      )}

      <button
        onClick={run}
        disabled={busy}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        <HugeiconsIcon icon={mode === "each" ? Scissor01Icon : Download01Icon} strokeWidth={2} className="size-5" />
        {busy ? t("pdfSplitting") : mode === "each" ? t("pdfSplitBtnEach") : t("pdfSplitBtnRange")}
      </button>
    </div>
  )
}
