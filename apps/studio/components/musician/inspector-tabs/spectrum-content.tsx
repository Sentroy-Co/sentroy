"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@workspace/ui/lib/utils"
import {
  getMasterFFT,
  getMasterWaveform,
  getSampleRate,
} from "@/lib/musician-engine"

/**
 * Spectrum analyzer — InspectorPanel sekmesi. Master output FFT (frequency)
 * + waveform (oscilloscope) iki ayrı canvas. Toolbar'da view toggle +
 * dB range + smoothing.
 *
 * Tone.FFT 2048 sample → 1024 bin; bin Hz = (binIdx * sampleRate) / 2048.
 * Logaritmik X-axis (insan kulağı log skalada algılar — düşük freq
 * yüksek detay, yüksek freq sıkışmış). Y-axis dB (-100..0, smoothed).
 *
 * Waveform: 2048 sample stereo aggregate → -1..+1, lineer X.
 */
export function SpectrumContent() {
  const [view, setView] = useState<"spectrum" | "waveform" | "both">("both")
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-800 px-4 py-2">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
          <span>Spectrum analyzer</span>
          <span className="font-mono text-neutral-700">
            master · 2048 FFT
          </span>
        </div>
        <div className="flex items-center gap-1">
          {(["spectrum", "waveform", "both"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "rounded border px-2 py-1 text-[9px] font-bold uppercase tracking-widest transition",
                view === v
                  ? "border-cyan-500/60 bg-cyan-500/20 text-cyan-300"
                  : "border-neutral-800 text-neutral-500 hover:text-neutral-200",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div
        className={cn(
          "min-h-0 flex-1 p-3",
          view === "both" ? "grid grid-rows-2 gap-3" : "flex",
        )}
      >
        {(view === "spectrum" || view === "both") && (
          <SpectrumCanvas />
        )}
        {(view === "waveform" || view === "both") && (
          <WaveformCanvas />
        )}
      </div>
    </div>
  )
}

// ─── SpectrumCanvas — log-x dB FFT bars ──────────────────────────────────

function SpectrumCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    let raf = 0
    const sampleRate = getSampleRate()
    const draw = () => {
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)
      // Background grid + dB markers
      ctx.fillStyle = "#0a0a0a"
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = "#1f1f1f"
      ctx.lineWidth = 1
      // dB horizontal lines: -100, -80, -60, -40, -20, 0
      ctx.font = "9px monospace"
      ctx.fillStyle = "#525252"
      for (let db = 0; db >= -100; db -= 20) {
        const y = ((db + 100) / 100) * h
        const yFlipped = h - y
        ctx.beginPath()
        ctx.moveTo(0, yFlipped)
        ctx.lineTo(w, yFlipped)
        ctx.stroke()
        ctx.fillText(`${db}`, 2, yFlipped + 8)
      }
      // Frequency vertical lines (log scale): 50, 100, 200, 500, 1k, 2k, 5k, 10k, 20k
      const freqLabels = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
      const fMin = 20
      const fMax = sampleRate / 2
      const logFMin = Math.log10(fMin)
      const logFMax = Math.log10(fMax)
      const freqToX = (hz: number) =>
        ((Math.log10(hz) - logFMin) / (logFMax - logFMin)) * w
      ctx.fillStyle = "#525252"
      for (const hz of freqLabels) {
        if (hz > fMax) continue
        const x = freqToX(hz)
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.stroke()
        const label = hz >= 1000 ? `${hz / 1000}k` : `${hz}`
        ctx.fillText(label, x + 2, h - 2)
      }
      // FFT bars
      const fft = getMasterFFT()
      if (fft.length > 0) {
        const binCount = fft.length
        // Group bins per pixel column — log-x mapping
        const cols = Math.min(w, 256)
        const colWidth = w / cols
        for (let i = 0; i < cols; i++) {
          // Map column x → frequency (log)
          const xRatio = i / (cols - 1 || 1)
          const fLow = Math.pow(10, logFMin + xRatio * (logFMax - logFMin))
          const fHigh =
            i < cols - 1
              ? Math.pow(
                  10,
                  logFMin + ((i + 1) / (cols - 1)) * (logFMax - logFMin),
                )
              : fMax
          const binLow = Math.max(
            0,
            Math.floor((fLow * 2 * binCount) / sampleRate),
          )
          const binHigh = Math.min(
            binCount - 1,
            Math.ceil((fHigh * 2 * binCount) / sampleRate),
          )
          let maxDb = -Infinity
          for (let b = binLow; b <= binHigh; b++) {
            const v = fft[b] ?? -Infinity
            if (v > maxDb) maxDb = v
          }
          if (!Number.isFinite(maxDb)) continue
          // dB → bar height (0 dB → top, -100 dB → bottom)
          const norm = Math.max(0, Math.min(1, (maxDb + 100) / 100))
          const barH = norm * h
          // Gradient color per dB range
          if (norm > 0.85) ctx.fillStyle = "#ef4444"
          else if (norm > 0.65) ctx.fillStyle = "#eab308"
          else ctx.fillStyle = "#22c55e"
          ctx.fillRect(i * colWidth, h - barH, Math.max(1, colWidth - 0.5), barH)
        }
      }
      raf = requestAnimationFrame(draw)
    }
    // Resize observer — canvas px width/height device pixel
    const ro = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    })
    ro.observe(canvas)
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])
  return (
    <div className="relative w-full overflow-hidden rounded-md border border-neutral-800 bg-neutral-950">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}

// ─── WaveformCanvas — oscilloscope (lineer time) ─────────────────────────

function WaveformCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    let raf = 0
    const draw = () => {
      const w = canvas.width
      const h = canvas.height
      ctx.fillStyle = "#0a0a0a"
      ctx.fillRect(0, 0, w, h)
      // Center zero line
      ctx.strokeStyle = "#1f1f1f"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, h / 2)
      ctx.lineTo(w, h / 2)
      ctx.stroke()
      // Waveform path
      const wf = getMasterWaveform()
      if (wf.length > 0) {
        ctx.strokeStyle = "#06b6d4"
        ctx.lineWidth = 1.5
        ctx.beginPath()
        for (let i = 0; i < wf.length; i++) {
          const x = (i / (wf.length - 1)) * w
          const v = wf[i] ?? 0
          const y = h / 2 - (v * h) / 2
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
      raf = requestAnimationFrame(draw)
    }
    const ro = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    })
    ro.observe(canvas)
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])
  return (
    <div className="relative w-full overflow-hidden rounded-md border border-neutral-800 bg-neutral-950">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}
