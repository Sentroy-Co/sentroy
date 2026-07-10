"use client"

import { useCallback, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { zipSync, strToU8 } from "fflate"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { ImageAdd01Icon, Download01Icon, ReloadIcon } from "@hugeicons/core-free-icons"

/**
 * Favicon Generator (client, server'a yükleme YOK). Tek görsel → tüm favicon
 * boyutları (Canvas, contain), çok boyutlu PNG-in-ICO, site.webmanifest +
 * HTML snippet → fflate ile ZIP. Tümü tarayıcıda.
 */

const PNG_OUTPUTS: { name: string; size: number; label: string }[] = [
  { name: "favicon-16x16.png", size: 16, label: "16×16" },
  { name: "favicon-32x32.png", size: 32, label: "32×32" },
  { name: "favicon-48x48.png", size: 48, label: "48×48" },
  { name: "apple-touch-icon.png", size: 180, label: "Apple 180" },
  { name: "android-chrome-192x192.png", size: 192, label: "Android 192" },
  { name: "android-chrome-512x512.png", size: 512, label: "Android 512" },
]
const ICO_SIZES = [16, 32, 48]

const MANIFEST = JSON.stringify(
  {
    name: "",
    short_name: "",
    icons: [
      { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    theme_color: "#ffffff",
    background_color: "#ffffff",
    display: "standalone",
  },
  null,
  2,
)

const HTML_SNIPPET = `<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">`

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

async function makePng(img: HTMLImageElement, size: number): Promise<Uint8Array> {
  const c = document.createElement("canvas")
  c.width = size
  c.height = size
  const ctx = c.getContext("2d")!
  const r = Math.min(size / img.width, size / img.height)
  const w = img.width * r
  const h = img.height * r
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
  const blob = await new Promise<Blob | null>((res) => c.toBlob((b) => res(b), "image/png"))
  return new Uint8Array(await blob!.arrayBuffer())
}

/** Çok boyutlu ICO (her giriş bir PNG — modern tarayıcı/OS destekler). */
function buildIco(entries: { size: number; data: Uint8Array }[]): Uint8Array {
  const headerLen = 6 + entries.length * 16
  let offset = headerLen
  const offsets = entries.map((e) => {
    const o = offset
    offset += e.data.length
    return o
  })
  const out = new Uint8Array(offset)
  const view = new DataView(out.buffer)
  view.setUint16(0, 0, true) // reserved
  view.setUint16(2, 1, true) // type = icon
  view.setUint16(4, entries.length, true)
  let p = 6
  entries.forEach((e, i) => {
    out[p] = e.size >= 256 ? 0 : e.size // width
    out[p + 1] = e.size >= 256 ? 0 : e.size // height
    out[p + 2] = 0 // palette
    out[p + 3] = 0 // reserved
    view.setUint16(p + 4, 1, true) // color planes
    view.setUint16(p + 6, 32, true) // bpp
    view.setUint32(p + 8, e.data.length, true) // size
    view.setUint32(p + 12, offsets[i]!, true) // offset
    p += 16
  })
  entries.forEach((e, i) => out.set(e.data, offsets[i]!))
  return out
}

interface Result {
  name: string
  label: string
  size: number
  data: Uint8Array
  preview?: string
}

export function FaviconGeneratorTool() {
  const t = useTranslations("d")
  const [file, setFile] = useState<File | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const urlsRef = useRef<string[]>([])

  const cleanup = () => {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u))
    urlsRef.current = []
  }

  const reset = () => {
    cleanup()
    setFile(null)
    setResults([])
  }

  const onPick = useCallback(
    async (f: File | undefined) => {
      if (!f) return
      if (!f.type.startsWith("image/")) {
        toast.error(t("favNotImage"))
        return
      }
      cleanup()
      setFile(f)
      setResults([])
      setBusy(true)
      try {
        const url = URL.createObjectURL(f)
        const img = await loadImage(url)
        const out: Result[] = []
        const bySize: Record<number, Uint8Array> = {}
        for (const o of PNG_OUTPUTS) {
          const data = await makePng(img, o.size)
          bySize[o.size] = data
          const pUrl = URL.createObjectURL(new Blob([data as BlobPart], { type: "image/png" }))
          urlsRef.current.push(pUrl)
          out.push({ name: o.name, label: o.label, size: o.size, data, preview: pUrl })
        }
        const ico = buildIco(ICO_SIZES.map((s) => ({ size: s, data: bySize[s]! })))
        const icoUrl = URL.createObjectURL(new Blob([ico as BlobPart], { type: "image/x-icon" }))
        urlsRef.current.push(icoUrl)
        out.unshift({ name: "favicon.ico", label: "ICO", size: 48, data: ico, preview: icoUrl })
        URL.revokeObjectURL(url)
        setResults(out)
      } catch {
        toast.error(t("favFailed"))
      } finally {
        setBusy(false)
      }
    },
    [t],
  )

  const downloadZip = () => {
    if (results.length === 0) return
    const files: Record<string, Uint8Array> = {}
    for (const r of results) files[r.name] = r.data
    files["site.webmanifest"] = strToU8(MANIFEST)
    files["README.txt"] = strToU8(`Sentroy Favicon Generator\n\nAdd to your <head>:\n\n${HTML_SNIPPET}\n`)
    const zipped = zipSync(files, { level: 0 })
    const blob = new Blob([zipped as BlobPart], { type: "application/zip" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "favicons.zip"
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

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
            <HugeiconsIcon icon={ImageAdd01Icon} strokeWidth={2} className="size-8" />
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-lg font-semibold">{t("favDrop")}</span>
            <span className="text-sm text-muted-foreground">{t("favHint")}</span>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">🔒 {t("imgCompPrivacy")}</span>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => void onPick(e.target.files?.[0])} />
        </label>
      </div>
    )
  }

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-medium">{file.name}</span>
        <button onClick={reset} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors hover:bg-muted">
          <HugeiconsIcon icon={ReloadIcon} strokeWidth={2} className="size-4" />
          {t("favNew")}
        </button>
      </div>

      {busy ? (
        <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">{t("favGenerating")}</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {results.map((r) => (
              <div key={r.name} className="flex flex-col items-center gap-2 rounded-xl border bg-card p-3">
                <span className="flex h-16 w-16 items-center justify-center rounded-lg" style={{ backgroundColor: "#fff" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.preview} alt={r.label} style={{ width: Math.min(r.size, 56), height: Math.min(r.size, 56) }} className="object-contain" />
                </span>
                <span className="text-[10px] font-medium tabular-nums text-muted-foreground">{r.label}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground/70">{t("favIncludes")}</p>
          <button
            onClick={downloadZip}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="size-5" />
            {t("favDownload")}
          </button>
        </>
      )}
    </div>
  )
}
