"use client"

import { useMemo, useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import cronstrue from "cronstrue/i18n"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Copy01Icon } from "@hugeicons/core-free-icons"

/** Cron expression generator — alan bazlı + presetler + insan-okunur açıklama (cronstrue). */

const FIELDS: { key: string; labelKey: string; hint: string }[] = [
  { key: "min", labelKey: "cronMin", hint: "0-59" },
  { key: "hour", labelKey: "cronHour", hint: "0-23" },
  { key: "dom", labelKey: "cronDom", hint: "1-31" },
  { key: "month", labelKey: "cronMonth", hint: "1-12" },
  { key: "dow", labelKey: "cronDow", hint: "0-6" },
]

const PRESETS: { labelKey: string; expr: string }[] = [
  { labelKey: "cronEveryMin", expr: "* * * * *" },
  { labelKey: "cronEvery5", expr: "*/5 * * * *" },
  { labelKey: "cronHourly", expr: "0 * * * *" },
  { labelKey: "cronDaily", expr: "0 0 * * *" },
  { labelKey: "cronWeekly", expr: "0 0 * * 0" },
  { labelKey: "cronMonthly", expr: "0 0 1 * *" },
  { labelKey: "cronWeekdays", expr: "0 9 * * 1-5" },
]

export function CronTool() {
  const t = useTranslations("d")
  const lang = useLocale()
  const [parts, setParts] = useState<string[]>(["*/5", "*", "*", "*", "*"])
  const expr = parts.join(" ")

  const LBL: Record<string, string> = {
    cronMin: t("cronMin"),
    cronHour: t("cronHour"),
    cronDom: t("cronDom"),
    cronMonth: t("cronMonth"),
    cronDow: t("cronDow"),
    cronEveryMin: t("cronEveryMin"),
    cronEvery5: t("cronEvery5"),
    cronHourly: t("cronHourly"),
    cronDaily: t("cronDaily"),
    cronWeekly: t("cronWeekly"),
    cronMonthly: t("cronMonthly"),
    cronWeekdays: t("cronWeekdays"),
  }

  const desc = useMemo(() => {
    try {
      return cronstrue.toString(expr, { locale: lang, use24HourTimeFormat: true, throwExceptionOnParseError: true })
    } catch {
      try {
        return cronstrue.toString(expr, { use24HourTimeFormat: true, throwExceptionOnParseError: true })
      } catch {
        return null
      }
    }
  }, [expr, lang])

  const setPart = (i: number, v: string) => setParts((p) => p.map((x, idx) => (idx === i ? v : x)))
  const applyPreset = (e: string) => setParts(e.split(" "))

  const copy = async () => {
    await navigator.clipboard.writeText(expr)
    toast.success(t("devCopied"))
  }

  return (
    <div className="mt-6 flex flex-col gap-5">
      {/* Alanlar */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {FIELDS.map((f, i) => (
          <label key={f.key} className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">{LBL[f.labelKey]}</span>
            <input
              value={parts[i]}
              onChange={(e) => setPart(i, e.target.value.trim() || "*")}
              spellCheck={false}
              className="h-10 rounded-xl border bg-card px-3 text-center font-mono text-sm outline-none focus:border-primary"
            />
            <span className="text-center text-[10px] text-muted-foreground/60">{f.hint}</span>
          </label>
        ))}
      </div>

      {/* Expression + açıklama */}
      <div className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <code className="flex-1 rounded-lg bg-muted/40 px-3 py-2 font-mono text-lg tracking-wider">{expr}</code>
          <button onClick={copy} className="inline-flex size-9 items-center justify-center rounded-xl border transition-colors hover:bg-muted" aria-label="Copy">
            <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} className="size-4" />
          </button>
        </div>
        <p className={"text-sm " + (desc ? "text-foreground/90" : "text-destructive")}>
          {desc ?? t("cronInvalid")}
        </p>
      </div>

      {/* Presetler */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("cronPresets")}</span>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.expr}
              onClick={() => applyPreset(p.expr)}
              className={
                "rounded-full border px-3 py-1.5 text-xs transition-colors " +
                (expr === p.expr ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")
              }
            >
              {LBL[p.labelKey]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
