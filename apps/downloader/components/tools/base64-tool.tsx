"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Copy01Icon } from "@hugeicons/core-free-icons"

/** Base64 encode/decode — UTF-8 güvenli, opsiyonel URL-safe. Saf client. */

function utf8ToB64(str: string, urlSafe: boolean): string {
  const bytes = new TextEncoder().encode(str)
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  let out = btoa(bin)
  if (urlSafe) out = out.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  return out
}
function b64ToUtf8(b64: string): string {
  let s = b64.trim().replace(/-/g, "+").replace(/_/g, "/")
  while (s.length % 4) s += "="
  const bin = atob(s)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export function Base64Tool() {
  const t = useTranslations("d")
  const [mode, setMode] = useState<"encode" | "decode">("encode")
  const [urlSafe, setUrlSafe] = useState(false)
  const [input, setInput] = useState("")

  const { output, error } = useMemo(() => {
    if (!input) return { output: "", error: false }
    try {
      return { output: mode === "encode" ? utf8ToB64(input, urlSafe) : b64ToUtf8(input), error: false }
    } catch {
      return { output: "", error: true }
    }
  }, [input, mode, urlSafe])

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
          onClick={() => setUrlSafe((v) => !v)}
          className={
            "rounded-full border px-3 py-1.5 text-xs transition-colors " +
            (urlSafe ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")
          }
        >
          {t("b64UrlSafe")}
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
        placeholder={mode === "encode" ? t("b64PhText") : t("b64PhB64")}
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
      {error ? <span className="text-xs text-destructive">{t("b64Invalid")}</span> : null}
    </div>
  )
}
