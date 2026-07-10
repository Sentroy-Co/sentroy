"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CheckmarkCircle02Icon,
  Alert02Icon,
  Copy01Icon,
  Download01Icon,
  SortByDown01Icon,
  CodeSquareIcon,
} from "@hugeicons/core-free-icons"

/**
 * tools.sentroy.com — JSON Formatter / Validator / Minifier (saf client, dep
 * yok). Canlı doğrulama (satır/sütun hatası), güzelleştir/küçült, anahtar
 * sırala, kopyala/indir. Tümü tarayıcıda.
 */

type Indent = "2" | "4" | "tab"

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeysDeep((value as Record<string, unknown>)[k])
        return acc
      }, {})
  }
  return value
}

function lineColOf(text: string, pos: number): { line: number; col: number } {
  const upto = text.slice(0, pos)
  const lines = upto.split("\n")
  return { line: lines.length, col: (lines[lines.length - 1]?.length ?? 0) + 1 }
}

const SAMPLE = `{"name":"Sentroy","tools":["resize","convert",{"paid":false}],"meta":{"version":2,"active":true}}`

export function JsonFormatterTool() {
  const t = useTranslations("d")
  const [text, setText] = useState("")
  const [indent, setIndent] = useState<Indent>("2")
  const [sort, setSort] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const indentStr = indent === "tab" ? "\t" : Number(indent)

  // Canlı doğrulama (debounce'lu)
  useEffect(() => {
    if (!text.trim()) {
      setError(null)
      return
    }
    const timer = setTimeout(() => {
      try {
        JSON.parse(text)
        setError(null)
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Invalid JSON"
        const m = msg.match(/position (\d+)/)
        if (m) {
          const { line, col } = lineColOf(text, parseInt(m[1]!, 10))
          setError(`${msg} (${t("jsonLine")} ${line}, ${t("jsonCol")} ${col})`)
        } else {
          setError(msg)
        }
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [text, t])

  const transform = useCallback(
    (mode: "pretty" | "min") => {
      if (!text.trim()) return
      try {
        let obj = JSON.parse(text)
        if (sort) obj = sortKeysDeep(obj)
        setText(mode === "pretty" ? JSON.stringify(obj, null, indentStr) : JSON.stringify(obj))
      } catch {
        toast.error(t("jsonInvalid"))
      }
    },
    [text, sort, indentStr, t],
  )

  const copy = useCallback(async () => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t("jsonCopied"))
    } catch {
      toast.error(t("toolGenericError"))
    }
  }, [text, t])

  const download = useCallback(() => {
    if (!text) return
    const blob = new Blob([text], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "data.json"
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [text])

  const stats = useMemo(() => {
    const bytes = new Blob([text]).size
    const lines = text ? text.split("\n").length : 0
    return { bytes, lines }
  }, [text])

  const valid = text.trim().length > 0 && !error

  return (
    <div className="mt-6 flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3">
        <button
          onClick={() => transform("pretty")}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <HugeiconsIcon icon={CodeSquareIcon} strokeWidth={2} className="size-4" />
          {t("jsonFormat")}
        </button>
        <button
          onClick={() => transform("min")}
          className="inline-flex h-9 items-center rounded-xl border px-4 text-sm font-medium transition-colors hover:bg-muted"
        >
          {t("jsonMinify")}
        </button>

        {/* Indent */}
        <div className="flex items-center gap-1 rounded-xl border p-0.5">
          {(["2", "4", "tab"] as Indent[]).map((i) => (
            <button
              key={i}
              onClick={() => setIndent(i)}
              className={
                "rounded-lg px-2.5 py-1 text-xs transition-colors " +
                (indent === i ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:bg-muted")
              }
            >
              {i === "tab" ? t("jsonTab") : i}
            </button>
          ))}
        </div>

        <button
          onClick={() => setSort((v) => !v)}
          className={
            "inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors " +
            (sort ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")
          }
        >
          <HugeiconsIcon icon={SortByDown01Icon} strokeWidth={2} className="size-4" />
          {t("jsonSortKeys")}
        </button>

        <div className="ms-auto flex items-center gap-2">
          <button onClick={() => setText(SAMPLE)} className="text-xs text-muted-foreground hover:text-foreground">
            {t("jsonSample")}
          </button>
          <button
            onClick={() => setText("")}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {t("imgConvClear")}
          </button>
          <button
            onClick={copy}
            disabled={!text}
            className="inline-flex size-9 items-center justify-center rounded-xl border transition-colors hover:bg-muted disabled:opacity-40"
            aria-label="Copy"
          >
            <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} className="size-4" />
          </button>
          <button
            onClick={download}
            disabled={!text}
            className="inline-flex size-9 items-center justify-center rounded-xl border transition-colors hover:bg-muted disabled:opacity-40"
            aria-label="Download"
          >
            <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="size-4" />
          </button>
        </div>
      </div>

      {/* Editör */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        placeholder={t("jsonPlaceholder")}
        className="min-h-[420px] w-full resize-y rounded-2xl border bg-card p-4 font-mono text-sm leading-relaxed outline-none focus:border-primary"
      />

      {/* Durum çubuğu */}
      <div className="flex min-h-6 items-center justify-between gap-3 text-xs">
        <AnimatePresence mode="wait">
          {!text.trim() ? (
            <motion.span key="empty" className="text-muted-foreground/60">
              {t("jsonReady")}
            </motion.span>
          ) : valid ? (
            <motion.span
              key="valid"
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="inline-flex items-center gap-1.5 font-medium text-emerald-500"
            >
              <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="size-4" />
              {t("jsonValid")}
            </motion.span>
          ) : (
            <motion.span
              key="error"
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="inline-flex items-start gap-1.5 font-medium text-destructive"
            >
              <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </motion.span>
          )}
        </AnimatePresence>
        <span className="shrink-0 tabular-nums text-muted-foreground/70">
          {stats.lines} {t("jsonLines")} · {stats.bytes} B
        </span>
      </div>
    </div>
  )
}
