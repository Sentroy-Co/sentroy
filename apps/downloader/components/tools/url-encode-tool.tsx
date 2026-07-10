"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Copy01Icon } from "@hugeicons/core-free-icons"

/** URL encode/decode — component (encodeURIComponent) veya full URI. Saf client. */
export function UrlEncodeTool() {
  const t = useTranslations("d")
  const [mode, setMode] = useState<"encode" | "decode">("encode")
  const [whole, setWhole] = useState(false) // tüm URI mı (encodeURI) yoksa component mı
  const [input, setInput] = useState("")

  const { output, error } = useMemo(() => {
    if (!input) return { output: "", error: false }
    try {
      let out: string
      if (mode === "encode") out = whole ? encodeURI(input) : encodeURIComponent(input)
      else out = whole ? decodeURI(input) : decodeURIComponent(input)
      return { output: out, error: false }
    } catch {
      return { output: "", error: true }
    }
  }, [input, mode, whole])

  const copy = async () => {
    if (!output) return
    await navigator.clipboard.writeText(output)
    toast.success(t("devCopied"))
  }

  return (
    <div className="mt-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border p-0.5">
          {(["encode", "decode"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={
                "rounded-lg px-4 py-1.5 text-sm transition-colors " +
                (mode === m ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:bg-muted")
              }
            >
              {m === "encode" ? t("b64Encode") : t("b64Decode")}
            </button>
          ))}
        </div>
        <button
          onClick={() => setWhole((v) => !v)}
          className={
            "rounded-full border px-3 py-1.5 text-xs transition-colors " +
            (whole ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")
          }
        >
          {whole ? t("urlWhole") : t("urlComponent")}
        </button>
        <button onClick={() => setInput(output)} disabled={!output} className="ms-auto text-xs text-muted-foreground hover:text-foreground disabled:opacity-40">
          {t("devSwap")}
        </button>
        <button onClick={() => setInput("")} className="text-xs text-muted-foreground hover:text-foreground">
          {t("imgConvClear")}
        </button>
      </div>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        spellCheck={false}
        placeholder={t("urlPh")}
        className="min-h-40 w-full resize-y rounded-2xl border bg-card p-4 font-mono text-sm outline-none focus:border-primary"
      />
      <div className="relative">
        <textarea
          value={error ? "" : output}
          readOnly
          placeholder={t("devOutput")}
          className="min-h-40 w-full resize-y rounded-2xl border bg-muted/30 p-4 pe-12 font-mono text-sm outline-none"
        />
        <button
          onClick={copy}
          disabled={!output}
          className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-lg border bg-background transition-colors hover:bg-muted disabled:opacity-40"
          aria-label="Copy"
        >
          <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} className="size-4" />
        </button>
      </div>
      {error ? <span className="text-xs text-destructive">{t("urlInvalid")}</span> : null}
    </div>
  )
}
