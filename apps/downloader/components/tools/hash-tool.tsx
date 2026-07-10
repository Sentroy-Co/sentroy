"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import SparkMD5 from "spark-md5"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Copy01Icon, File01Icon, Cancel01Icon } from "@hugeicons/core-free-icons"

/** Hash generator — MD5 (spark-md5) + SHA-1/256/512 (WebCrypto). Metin veya dosya. Saf client. */

const ALGOS = ["MD5", "SHA-1", "SHA-256", "SHA-512"] as const
type Algo = (typeof ALGOS)[number]

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

async function digest(algo: Algo, bytes: Uint8Array): Promise<string> {
  if (algo === "MD5") return SparkMD5.ArrayBuffer.hash(bytes.buffer as ArrayBuffer)
  const buf = await crypto.subtle.digest(algo, bytes as unknown as BufferSource)
  return toHex(buf)
}

export function HashTool() {
  const t = useTranslations("d")
  const [text, setText] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [upper, setUpper] = useState(false)
  const [hashes, setHashes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)

  const compute = useCallback(async () => {
    const token = ++seq.current
    let bytes: Uint8Array | null = null
    if (file) {
      setBusy(true)
      bytes = new Uint8Array(await file.arrayBuffer())
    } else if (text) {
      bytes = new TextEncoder().encode(text)
    }
    if (!bytes) {
      setHashes({})
      setBusy(false)
      return
    }
    const out: Record<string, string> = {}
    for (const a of ALGOS) {
      try {
        out[a] = await digest(a, bytes)
      } catch {
        out[a] = ""
      }
    }
    if (token === seq.current) {
      setHashes(out)
      setBusy(false)
    }
  }, [text, file])

  useEffect(() => {
    const timer = setTimeout(() => void compute(), file ? 0 : 200)
    return () => clearTimeout(timer)
  }, [compute, file])

  const copy = async (v: string) => {
    if (!v) return
    await navigator.clipboard.writeText(upper ? v.toUpperCase() : v)
    toast.success(t("devCopied"))
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {/* Girdi: metin veya dosya */}
      {file ? (
        <div className="flex items-center gap-3 rounded-2xl border bg-card p-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <HugeiconsIcon icon={File01Icon} strokeWidth={2} className="size-5" />
          </span>
          <span className="flex-1 truncate text-sm font-medium">{file.name}</span>
          <button onClick={() => setFile(null)} className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Remove">
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-4" />
          </button>
        </div>
      ) : (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          placeholder={t("hashPh")}
          className="min-h-32 w-full resize-y rounded-2xl border bg-card p-4 font-mono text-sm outline-none focus:border-primary"
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors hover:bg-muted">
          <HugeiconsIcon icon={File01Icon} strokeWidth={2} className="size-4" />
          {t("hashFile")}
          <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button
          onClick={() => setUpper((v) => !v)}
          className={
            "rounded-full border px-3 py-1.5 text-xs transition-colors " +
            (upper ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")
          }
        >
          {t("uuidUpper")}
        </button>
        {busy ? <span className="text-xs text-muted-foreground">{t("hashComputing")}</span> : null}
      </div>

      {/* Sonuçlar */}
      <div className="flex flex-col gap-2">
        {ALGOS.map((a) => {
          const v = hashes[a] ?? ""
          const shown = upper ? v.toUpperCase() : v
          return (
            <div key={a} className="flex items-start gap-3 rounded-2xl border bg-card p-3">
              <span className="mt-0.5 w-20 shrink-0 font-mono text-xs font-semibold text-primary">{a}</span>
              <span className="flex-1 break-all font-mono text-xs text-muted-foreground">{shown || "—"}</span>
              <button
                onClick={() => copy(v)}
                disabled={!v}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg border transition-colors hover:bg-muted disabled:opacity-40"
                aria-label="Copy"
              >
                <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} className="size-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
