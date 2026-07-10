"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Copy01Icon, ReloadIcon, Download01Icon } from "@hugeicons/core-free-icons"

/** UUID v4 generator (crypto.randomUUID) — adet + biçim seçenekleri. Saf client. */

const COUNTS = [1, 5, 10, 25, 100]

export function UuidTool() {
  const t = useTranslations("d")
  const [count, setCount] = useState(5)
  const [upper, setUpper] = useState(false)
  const [hyphens, setHyphens] = useState(true)
  const [braces, setBraces] = useState(false)
  const [ids, setIds] = useState<string[]>([])

  const generate = useCallback(() => {
    const list: string[] = []
    for (let i = 0; i < count; i++) list.push(crypto.randomUUID())
    setIds(list)
  }, [count])

  useEffect(() => {
    generate()
  }, [generate])

  const format = (id: string) => {
    let s = id
    if (!hyphens) s = s.replace(/-/g, "")
    if (upper) s = s.toUpperCase()
    if (braces) s = `{${s}}`
    return s
  }
  const text = ids.map(format).join("\n")

  const copy = async () => {
    if (!text) return
    await navigator.clipboard.writeText(text)
    toast.success(t("devCopied"))
  }
  const download = () => {
    const blob = new Blob([text], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "uuids.txt"
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("uuidCount")}</span>
          <div className="flex gap-1">
            {COUNTS.map((c) => (
              <button
                key={c}
                onClick={() => setCount(c)}
                className={
                  "rounded-lg px-2.5 py-1 text-xs transition-colors " +
                  (count === c ? "bg-primary font-medium text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70")
                }
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["upper", upper, setUpper, t("uuidUpper")],
              ["hyphens", hyphens, setHyphens, t("uuidHyphens")],
              ["braces", braces, setBraces, t("uuidBraces")],
            ] as const
          ).map(([key, val, set, label]) => (
            <button
              key={key}
              onClick={() => set((v) => !v)}
              className={
                "rounded-full border px-3 py-1.5 text-xs transition-colors " +
                (val ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ms-auto flex items-center gap-2">
          <button
            onClick={generate}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <HugeiconsIcon icon={ReloadIcon} strokeWidth={2} className="size-4" />
            {t("uuidRegen")}
          </button>
          <button onClick={copy} className="inline-flex size-9 items-center justify-center rounded-xl border transition-colors hover:bg-muted" aria-label="Copy">
            <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} className="size-4" />
          </button>
          <button onClick={download} className="inline-flex size-9 items-center justify-center rounded-xl border transition-colors hover:bg-muted" aria-label="Download">
            <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 rounded-2xl border bg-muted/20 p-4 font-mono text-sm">
        {ids.map((id, i) => (
          <button
            key={i}
            onClick={() => {
              void navigator.clipboard.writeText(format(id))
              toast.success(t("devCopied"))
            }}
            className="truncate rounded px-2 py-1 text-start transition-colors hover:bg-muted"
            title={t("devClickCopy")}
          >
            {format(id)}
          </button>
        ))}
      </div>
    </div>
  )
}
