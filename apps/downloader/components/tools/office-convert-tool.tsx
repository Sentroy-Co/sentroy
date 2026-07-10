"use client"

import { useCallback, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { File01Icon, Download01Icon, ReloadIcon, ServerStack01Icon } from "@hugeicons/core-free-icons"

/**
 * Office/ODF ↔ PDF dönüştürücü (SERVER-SIDE — LibreOffice worker). Parametreli:
 * tool-page.tsx her dönüşüm için (Word→PDF, Excel→PDF, PPT→PDF, PDF→Word…) bir
 * instance tanımlar. Diğer araçlardan FARKLI: dosya sunucuda işlenir → bunu
 * kullanıcıya net söyler (anında silinir, saklanmaz).
 */
export function OfficeConvertTool({
  accept,
  to,
  inputHint,
  fidelityNoteKey,
}: {
  accept: string
  to: string
  inputHint: string
  fidelityNoteKey?: string
}) {
  const t = useTranslations("d")
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const onConvert = useCallback(async () => {
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("to", to)
      const res = await fetch("/api/office/convert", { method: "POST", body: fd })
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null
        toast.error(j?.error === "too_large" ? t("officeTooLarge") : t("officeFailed"))
        return
      }
      const blob = await res.blob()
      const base = file.name.replace(/\.[^.]+$/, "") || "document"
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${base}.${to}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success(t("officeDone"))
    } catch {
      toast.error(t("officeFailed"))
    } finally {
      setBusy(false)
    }
  }, [file, to, t])

  return (
    <div className="mx-auto mt-8 flex max-w-2xl flex-col gap-4">
      {!file ? (
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const f = e.dataTransfer.files?.[0]
            if (f) setFile(f)
          }}
          className={
            "flex cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed px-6 py-20 text-center transition-colors " +
            (dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30")
          }
        >
          <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <HugeiconsIcon icon={File01Icon} strokeWidth={2} className="size-8" />
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-lg font-semibold">{t("officeDrop")}</span>
            <span className="text-sm text-muted-foreground">{inputHint}</span>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) setFile(f)
            }}
          />
        </label>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
            <span className="flex min-w-0 items-center gap-2.5">
              <HugeiconsIcon icon={File01Icon} strokeWidth={2} className="size-5 shrink-0 text-primary" />
              <span className="flex flex-col min-w-0">
                <span className="truncate text-sm font-medium">{file.name}</span>
                <span className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB → {to.toUpperCase()}</span>
              </span>
            </span>
            <button
              onClick={() => setFile(null)}
              disabled={busy}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              <HugeiconsIcon icon={ReloadIcon} strokeWidth={2} className="size-4" />
              {t("officeNew")}
            </button>
          </div>
          <button
            onClick={onConvert}
            disabled={busy}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <AnimatePresence mode="wait">
              {busy ? (
                <motion.span key="b" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="inline-flex items-center gap-2">
                  <Spinner /> {t("officeConverting")}
                </motion.span>
              ) : (
                <motion.span key="i" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="inline-flex items-center gap-2">
                  <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="size-5" />
                  {t("officeConvert")} → {to.toUpperCase()}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      )}

      {fidelityNoteKey ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
          {t(fidelityNoteKey)}
        </p>
      ) : null}

      {/* Sunucu-işleme şeffaflığı — diğer araçların "cihazda kalır" notundan FARKLI */}
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <HugeiconsIcon icon={ServerStack01Icon} strokeWidth={2} className="mt-0.5 size-4 shrink-0" />
        {t("officeServerNote")}
      </p>
    </div>
  )
}

function Spinner() {
  return (
    <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, ease: "linear", duration: 0.8 }} className="inline-block size-5">
      <svg viewBox="0 0 24 24" fill="none" className="size-full">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </motion.span>
  )
}
