"use client"

import { useCallback, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { File01Icon, ReloadIcon, Download01Icon } from "@hugeicons/core-free-icons"

/**
 * Tablo dönüştürücü (CLIENT-side, cihazda kalır). XLSX/XLS/CSV → CSV / JSON /
 * XLSX. SheetJS (Apache-2.0) lazy-import (ağır lib ortak bundle'a girmez).
 * Excel↔PDF gibi fidelity gerektirenler ayrı (server, OfficeConvertTool).
 */

type Out = "csv" | "json" | "xlsx"

interface Loaded {
  name: string
  sheetNames: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wb: any
}

export function SpreadsheetTool() {
  const t = useTranslations("d")
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [sheet, setSheet] = useState(0)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const onPick = useCallback(
    async (f: File | undefined) => {
      if (!f) return
      setBusy(true)
      try {
        const XLSX = await import("xlsx")
        const isCsv = /\.csv$/i.test(f.name) || f.type === "text/csv"
        const wb = isCsv
          ? XLSX.read(await f.text(), { type: "string" })
          : XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array" })
        setLoaded({ name: f.name, sheetNames: wb.SheetNames, wb })
        setSheet(0)
      } catch {
        toast.error(t("sheetFailed"))
      } finally {
        setBusy(false)
      }
    },
    [t],
  )

  const convert = useCallback(
    async (out: Out) => {
      if (!loaded) return
      setBusy(true)
      try {
        const XLSX = await import("xlsx")
        const base = loaded.name.replace(/\.[^.]+$/, "") || "data"
        let blob: Blob
        let ext: string
        if (out === "xlsx") {
          const arr = XLSX.write(loaded.wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer
          blob = new Blob([arr], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
          ext = "xlsx"
        } else {
          const ws = loaded.wb.Sheets[loaded.sheetNames[sheet]!]
          if (out === "csv") {
            blob = new Blob([XLSX.utils.sheet_to_csv(ws)], { type: "text/csv;charset=utf-8" })
            ext = "csv"
          } else {
            const json = XLSX.utils.sheet_to_json(ws)
            blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" })
            ext = "json"
          }
        }
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${base}.${ext}`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      } catch {
        toast.error(t("sheetFailed"))
      } finally {
        setBusy(false)
      }
    },
    [loaded, sheet, t],
  )

  if (!loaded) {
    return (
      <div className="mx-auto mt-8 flex max-w-2xl flex-col gap-3">
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
            "flex cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed px-6 py-20 text-center transition-colors " +
            (dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30")
          }
        >
          <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <HugeiconsIcon icon={File01Icon} strokeWidth={2} className="size-8" />
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-lg font-semibold">{t("sheetDrop")}</span>
            <span className="text-sm text-muted-foreground">XLSX · XLS · CSV</span>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">🔒 {t("sheetPrivacy")}</span>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,text/csv" className="hidden" onChange={(e) => void onPick(e.target.files?.[0])} />
        </label>
      </div>
    )
  }

  return (
    <div className="mx-auto mt-8 flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <HugeiconsIcon icon={File01Icon} strokeWidth={2} className="size-5 shrink-0 text-primary" />
          <span className="truncate text-sm font-medium">{loaded.name}</span>
        </span>
        <button
          onClick={() => setLoaded(null)}
          disabled={busy}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          <HugeiconsIcon icon={ReloadIcon} strokeWidth={2} className="size-4" />
          {t("officeNew")}
        </button>
      </div>

      {/* Çok sayfalı dosyada CSV/JSON için sayfa seçimi */}
      {loaded.sheetNames.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">{t("sheetSelect")}</span>
          <div className="flex flex-wrap gap-1.5">
            {loaded.sheetNames.map((sn, i) => (
              <button
                key={sn + i}
                onClick={() => setSheet(i)}
                className={
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
                  (i === sheet ? "bg-primary text-primary-foreground" : "border bg-card text-muted-foreground hover:border-primary/50")
                }
              >
                {sn}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t("sheetOutput")}</span>
        <div className="grid grid-cols-3 gap-2">
          {(["csv", "json", "xlsx"] as Out[]).map((o) => (
            <button
              key={o}
              onClick={() => convert(o)}
              disabled={busy}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border font-semibold transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50"
            >
              <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="size-4" />
              {o.toUpperCase()}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground/70">{t("sheetXlsxNote")}</p>
      </div>
    </div>
  )
}
