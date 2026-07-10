"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import QRCode from "qrcode"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Download01Icon, ImageAdd01Icon, Cancel01Icon } from "@hugeicons/core-free-icons"

/**
 * tools.sentroy.com — QR Code Generator (saf client). Metin/URL → QR; renk,
 * boyut, hata düzeltme, kenar boşluğu + ortaya logo. PNG + SVG indir.
 */

type Ecl = "L" | "M" | "Q" | "H"
const ECLS: Ecl[] = ["L", "M", "Q", "H"]
const ECL_TITLE: Record<Ecl, string> = { L: "~7%", M: "~15%", Q: "~25%", H: "~30%" }
const SIZES = [256, 512, 1024, 2048]
const MARGIN = 24 // sabit quiet-zone — kullanıcıya sorulmaz

/** Logo'yu canvas ortasına beyaz yuvarlak zeminle çiz. */
function drawLogo(canvas: HTMLCanvasElement, img: HTMLImageElement, scalePct: number) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  const S = canvas.width
  const box = (S * scalePct) / 100
  const pad = box * 0.14
  const total = box + pad * 2
  const x = (S - total) / 2
  const r = total * 0.2
  ctx.fillStyle = "#ffffff"
  ctx.beginPath()
  ctx.moveTo(x + r, x)
  ctx.arcTo(x + total, x, x + total, x + total, r)
  ctx.arcTo(x + total, x + total, x, x + total, r)
  ctx.arcTo(x, x + total, x, x, r)
  ctx.arcTo(x, x, x + total, x, r)
  ctx.closePath()
  ctx.fill()
  const ratio = Math.min(box / img.width, box / img.height)
  const w = img.width * ratio
  const h = img.height * ratio
  ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h)
}

/** Logo'yu SVG çıktısına gömer (beyaz yuvarlak rect + <image> data URI). */
function svgWithLogo(svg: string, dataUrl: string, scalePct: number): string {
  const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
  const W = m ? parseFloat(m[1]!) : 100
  const box = (W * scalePct) / 100
  const pad = box * 0.14
  const total = box + pad * 2
  const x = (W - total) / 2
  const r = total * 0.2
  const inject =
    `<rect x="${x}" y="${x}" width="${total}" height="${total}" rx="${r}" fill="#ffffff"/>` +
    `<image href="${dataUrl}" x="${(W - box) / 2}" y="${(W - box) / 2}" width="${box}" height="${box}" preserveAspectRatio="xMidYMid meet"/>`
  return svg.replace("</svg>", inject + "</svg>")
}

export function QrCodeTool() {
  const t = useTranslations("d")
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [text, setText] = useState("https://sentroy.com")
  const [size, setSize] = useState(512)
  const [ecl, setEcl] = useState<Ecl>("M")
  const [dark, setDark] = useState("#000000")
  const [light, setLight] = useState("#ffffff")
  const [err, setErr] = useState(false)
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null)
  const [logoScale, setLogoScale] = useState(22)

  // Canlı önizleme (debounce'lu) + logo overlay
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const value = text.trim()
    if (!value) {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height)
      setErr(false)
      return
    }
    const timer = setTimeout(() => {
      QRCode.toCanvas(canvas, value, { width: 1024, margin: MARGIN, errorCorrectionLevel: ecl, color: { dark, light } }, (e) => {
        setErr(!!e)
        if (!e && logoImg) drawLogo(canvas, logoImg, logoScale)
      })
    }, 200)
    return () => clearTimeout(timer)
  }, [text, ecl, dark, light, logoImg, logoScale])

  const onLogo = useCallback(
    (file: File | undefined) => {
      if (!file || !file.type.startsWith("image/")) return
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        setLogoDataUrl(dataUrl)
        const img = new Image()
        img.onload = () => setLogoImg(img)
        img.src = dataUrl
      }
      reader.readAsDataURL(file)
      setEcl("H") // logo merkezi kapatır → en yüksek hata düzeltme
    },
    [],
  )
  const removeLogo = () => {
    setLogoDataUrl(null)
    setLogoImg(null)
  }

  const downloadPng = useCallback(async () => {
    const value = text.trim()
    if (!value) return
    const tmp = document.createElement("canvas")
    await QRCode.toCanvas(tmp, value, { width: size, margin: MARGIN, errorCorrectionLevel: ecl, color: { dark, light } })
    if (logoImg) drawLogo(tmp, logoImg, logoScale)
    const a = document.createElement("a")
    a.href = tmp.toDataURL("image/png")
    a.download = `qr-${size}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }, [text, size, ecl, dark, light, logoImg, logoScale])

  const downloadSvg = useCallback(async () => {
    const value = text.trim()
    if (!value) return
    try {
      let svg = await QRCode.toString(value, { type: "svg", margin: MARGIN, errorCorrectionLevel: ecl, color: { dark, light } })
      if (logoDataUrl) svg = svgWithLogo(svg, logoDataUrl, logoScale)
      const blob = new Blob([svg], { type: "image/svg+xml" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "qr.svg"
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error(t("toolGenericError"))
    }
  }, [text, ecl, dark, light, logoDataUrl, logoScale, t])

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
      {/* Önizleme */}
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border bg-card p-6">
        <div className="flex aspect-square w-full max-w-sm items-center justify-center overflow-hidden rounded-xl bg-white p-3">
          <canvas ref={canvasRef} className="h-auto w-full" style={{ imageRendering: "pixelated" }} />
        </div>
        {err ? <span className="text-xs text-destructive">{t("qrTooLong")}</span> : null}
        <div className="flex w-full max-w-sm gap-2">
          <button
            onClick={downloadPng}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="size-5" />
            PNG
          </button>
          <button
            onClick={downloadSvg}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-primary/40 px-4 font-semibold text-primary transition-colors hover:bg-primary/10"
          >
            <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="size-5" />
            SVG
          </button>
        </div>
      </div>

      {/* Ayarlar */}
      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("qrContent")}</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="https://…"
            className="resize-y rounded-xl border bg-background p-3 text-sm outline-none focus:border-primary"
          />
        </label>

        {/* Logo */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("qrLogo")}</span>
          {logoDataUrl ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 rounded-xl border p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoDataUrl} alt="logo" className="size-9 rounded object-contain" />
                <span className="flex-1 text-xs text-muted-foreground">{t("qrLogoAdded")}</span>
                <button onClick={removeLogo} className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Remove logo">
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-4" />
                </button>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">
                  {t("qrLogoSize")}: {logoScale}%
                </span>
                <input type="range" min={10} max={32} value={logoScale} onChange={(e) => setLogoScale(Number(e.target.value))} className="accent-primary" />
              </label>
            </div>
          ) : (
            <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/30">
              <HugeiconsIcon icon={ImageAdd01Icon} strokeWidth={2} className="size-4" />
              {t("qrLogoAdd")}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
            </label>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("qrPngSize")}</span>
          <div className="flex gap-1.5">
            {SIZES.map((s, i) => {
              const active = size === s
              const boxPx = 12 + i * 6 // 256→12 … 2048→30, göreli boyut önizlemesi
              return (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={
                    "flex flex-1 flex-col items-center gap-1 rounded-xl border px-1 py-2 transition-colors " +
                    (active ? "border-primary bg-primary/10" : "border-border hover:border-primary/40 hover:bg-muted/40")
                  }
                >
                  <span className="flex h-8 items-center justify-center">
                    <span
                      className={"rounded-[3px] " + (active ? "bg-primary" : "bg-muted-foreground/50")}
                      style={{ width: boxPx, height: boxPx }}
                    />
                  </span>
                  <span className={"text-[11px] tabular-nums " + (active ? "font-medium text-primary" : "text-muted-foreground")}>
                    {s}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("qrEcl")}</span>
            {logoImg && ecl !== "H" ? <span className="text-[10px] text-amber-500">{t("qrEclLogoHint")}</span> : null}
          </div>
          <div className="flex gap-1.5">
            {ECLS.map((e) => (
              <button
                key={e}
                onClick={() => setEcl(e)}
                title={`${e} · ${ECL_TITLE[e]}`}
                className={
                  "flex-1 rounded-xl px-3 py-2 text-xs transition-colors " +
                  (ecl === e ? "bg-primary font-medium text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70")
                }
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2">
            <span className="text-xs text-muted-foreground">{t("qrFg")}</span>
            <input type="color" value={dark} onChange={(e) => setDark(e.target.value)} className="size-7 cursor-pointer rounded border-0 bg-transparent p-0" />
          </label>
          <label className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2">
            <span className="text-xs text-muted-foreground">{t("qrBg")}</span>
            <input type="color" value={light} onChange={(e) => setLight(e.target.value)} className="size-7 cursor-pointer rounded border-0 bg-transparent p-0" />
          </label>
        </div>

      </div>
    </div>
  )
}
