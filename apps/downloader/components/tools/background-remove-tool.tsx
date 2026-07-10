"use client"

import { useCallback, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { ImageAdd01Icon, Download01Icon, SparklesIcon, ReloadIcon } from "@hugeicons/core-free-icons"

/**
 * Background Remove (client/WASM, server'a yükleme YOK). transformers.js
 * (Apache-2.0) + Xenova/modnet (Apache-2.0, portre/foreground matting) ile
 * tarayıcıda arka plan kaldırma → şeffaf PNG. Model HF CDN'den ilk kullanımda
 * lazy indirilir (~tek seferlik). transformers.js lazy-import (ortak bundle'a girmez).
 */

// Model + processor modül seviyesinde cache (ikinci görselde yeniden yüklenmez).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let modelPromise: Promise<{ model: any; processor: any; RawImage: any }> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadModel(onProgress: (p: number) => void): Promise<{ model: any; processor: any; RawImage: any }> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const { env, AutoModel, AutoProcessor, RawImage } = await import("@huggingface/transformers")
      env.allowLocalModels = false
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const progress_callback = (e: any) => {
        if (e?.status === "progress" && typeof e.progress === "number") onProgress(Math.round(e.progress))
      }
      const model = await AutoModel.from_pretrained("Xenova/modnet", { progress_callback })
      const processor = await AutoProcessor.from_pretrained("Xenova/modnet", { progress_callback })
      return { model, processor, RawImage }
    })().catch((e) => {
      modelPromise = null
      throw e
    })
  }
  return modelPromise
}

type Status = "idle" | "loading" | "processing" | "done"

export function BackgroundRemoveTool() {
  const t = useTranslations("d")
  const [file, setFile] = useState<File | null>(null)
  const [srcUrl, setSrcUrl] = useState<string | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>("idle")
  const [progress, setProgress] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const resultRef = useRef<string | null>(null)

  const reset = () => {
    if (srcUrl) URL.revokeObjectURL(srcUrl)
    if (resultRef.current) URL.revokeObjectURL(resultRef.current)
    resultRef.current = null
    setFile(null)
    setSrcUrl(null)
    setResultUrl(null)
    setStatus("idle")
  }

  const onPick = useCallback(
    (f: File | undefined) => {
      if (!f) return
      if (!f.type.startsWith("image/")) {
        toast.error(t("bgNotImage"))
        return
      }
      if (srcUrl) URL.revokeObjectURL(srcUrl)
      if (resultRef.current) {
        URL.revokeObjectURL(resultRef.current)
        resultRef.current = null
      }
      setFile(f)
      setSrcUrl(URL.createObjectURL(f))
      setResultUrl(null)
      setStatus("idle")
    },
    [srcUrl, t],
  )

  const run = useCallback(async () => {
    if (!srcUrl || !file) return
    setStatus("loading")
    setProgress(0)
    try {
      const { model, processor, RawImage } = await loadModel(setProgress)
      setStatus("processing")
      const image = await RawImage.fromURL(srcUrl)
      const { pixel_values } = await processor(image)
      const { output } = await model({ input: pixel_values })
      const mask = await RawImage.fromTensor(output[0].mul(255).to("uint8")).resize(image.width, image.height)

      // Orijinali çiz + matte'i alpha olarak uygula → şeffaf PNG
      const canvas = document.createElement("canvas")
      canvas.width = image.width
      canvas.height = image.height
      const ctx = canvas.getContext("2d")!
      const orig = new Image()
      await new Promise<void>((res, rej) => {
        orig.onload = () => res()
        orig.onerror = rej
        orig.src = srcUrl
      })
      ctx.drawImage(orig, 0, 0, canvas.width, canvas.height)
      const pix = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const m = mask.data as Uint8Array
      for (let i = 0; i < m.length; i++) pix.data[4 * i + 3] = m[i]!
      ctx.putImageData(pix, 0, 0)
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), "image/png"))
      if (!blob) throw new Error("encode")
      if (resultRef.current) URL.revokeObjectURL(resultRef.current)
      const url = URL.createObjectURL(blob)
      resultRef.current = url
      setResultUrl(url)
      setStatus("done")
    } catch {
      setStatus("idle")
      toast.error(t("bgFailed"))
    }
  }, [srcUrl, file, t])

  const download = () => {
    if (!resultUrl || !file) return
    const a = document.createElement("a")
    a.href = resultUrl
    a.download = `${file.name.replace(/\.[^.]+$/, "")}-no-bg.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  // Şeffaflık önizlemesi için dama deseni
  const checker: React.CSSProperties = {
    backgroundImage:
      "linear-gradient(45deg,#0003 25%,transparent 25%),linear-gradient(-45deg,#0003 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#0003 75%),linear-gradient(-45deg,transparent 75%,#0003 75%)",
    backgroundSize: "20px 20px",
    backgroundPosition: "0 0,0 10px,10px -10px,-10px 0",
    backgroundColor: "#fff",
  }

  if (!file || !srcUrl) {
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
            onPick(e.dataTransfer.files?.[0])
          }}
          className={
            "flex cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed px-6 py-24 text-center transition-colors " +
            (dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30")
          }
        >
          <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} className="size-8" />
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-lg font-semibold">{t("bgDrop")}</span>
            <span className="text-sm text-muted-foreground">{t("bgHint")}</span>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">🔒 {t("imgCompPrivacy")}</span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
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
          {t("imgResizeNew")}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Orijinal */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("bgOriginal")}</span>
          <div className="overflow-hidden rounded-2xl border bg-black/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={srcUrl} alt="original" className="max-h-[420px] w-full object-contain" />
          </div>
        </div>
        {/* Sonuç */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("bgResult")}</span>
          <div className="relative flex min-h-48 items-center justify-center overflow-hidden rounded-2xl border" style={checker}>
            <AnimatePresence mode="wait">
              {resultUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <motion.img key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }} src={resultUrl} alt="no background" className="max-h-[420px] w-full object-contain" />
              ) : status === "loading" || status === "processing" ? (
                <motion.div key="p" className="flex flex-col items-center gap-3 p-4 text-center bg-background/50 backdrop-blur-sm rounded-2xl">
                  <Spinner />
                  <span className="text-sm text-muted-foreground">
                    {status === "loading" ? t("bgLoadingModel", { p: progress }) : t("bgProcessing")}
                  </span>
                  {status === "loading" ? (
                    <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  ) : null}
                </motion.div>
              ) : (
                <motion.span key="i" className="p-4 text-sm text-foreground/60 bg-background/50 backdrop-blur-sm rounded-2xl">{t("bgResultHint")}</motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <AnimatePresence>
          {resultUrl ? (
            <motion.button
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              onClick={download}
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-primary/40 px-5 font-semibold text-primary transition-colors hover:bg-primary/10"
            >
              <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="size-5" />
              {t("bgDownload")}
            </motion.button>
          ) : null}
        </AnimatePresence>
        <button
          onClick={run}
          disabled={status === "loading" || status === "processing"}
          className="inline-flex h-12 min-w-48 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} className="size-5" />
          {status === "loading" ? t("bgLoadingShort") : status === "processing" ? t("bgProcessing") : resultUrl ? t("bgRedo") : t("bgRemove")}
        </button>
      </div>

      <p className="text-center text-xs text-muted-foreground/70">{t("bgNote")}</p>
    </div>
  )
}

function Spinner() {
  return (
    <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, ease: "linear", duration: 0.8 }} className="inline-block size-7">
      <svg viewBox="0 0 24 24" fill="none" className="size-full">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </motion.span>
  )
}
