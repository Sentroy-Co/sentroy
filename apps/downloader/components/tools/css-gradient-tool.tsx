"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Copy01Icon, Add01Icon, Cancel01Icon, ReloadIcon } from "@hugeicons/core-free-icons"

/** CSS gradient generator — linear/radial/conic, renk durakları, canlı önizleme. */

type GType = "linear" | "radial" | "conic"
interface Stop {
  id: number
  color: string
  pos: number
}

const PRESETS: [string, string][] = [
  ["#6366f1", "#ec4899"],
  ["#0ea5e9", "#22c55e"],
  ["#f97316", "#eab308"],
  ["#8b5cf6", "#06b6d4"],
  ["#ef4444", "#f59e0b"],
]

function rand(): string {
  const p = PRESETS[Math.floor(Math.random() * PRESETS.length)]!
  return p[0]
}

export function CssGradientTool() {
  const t = useTranslations("d")
  const [type, setType] = useState<GType>("linear")
  const [angle, setAngle] = useState(135)
  const idRef = useState(() => ({ n: 2 }))[0]
  const [stops, setStops] = useState<Stop[]>([
    { id: 0, color: "#6366f1", pos: 0 },
    { id: 1, color: "#ec4899", pos: 100 },
  ])

  const css = useMemo(() => {
    const sorted = [...stops].sort((a, b) => a.pos - b.pos)
    const list = sorted.map((s) => `${s.color} ${s.pos}%`).join(", ")
    if (type === "linear") return `linear-gradient(${angle}deg, ${list})`
    if (type === "radial") return `radial-gradient(circle, ${list})`
    return `conic-gradient(from ${angle}deg, ${list})`
  }, [type, angle, stops])

  const addStop = () => setStops((p) => [...p, { id: idRef.n++, color: rand(), pos: 50 }])
  const removeStop = (id: number) => setStops((p) => (p.length > 2 ? p.filter((s) => s.id !== id) : p))
  const update = (id: number, patch: Partial<Stop>) => setStops((p) => p.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const randomize = () => {
    const [a, b] = PRESETS[Math.floor(Math.random() * PRESETS.length)]!
    setStops([
      { id: idRef.n++, color: a, pos: 0 },
      { id: idRef.n++, color: b, pos: 100 },
    ])
    setAngle(Math.floor(Math.random() * 360))
  }

  const copy = async () => {
    await navigator.clipboard.writeText(`background: ${css};`)
    toast.success(t("devCopied"))
  }

  return (
    <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_340px]">
      {/* Önizleme + CSS */}
      <div className="flex flex-col gap-3">
        <div className="h-72 w-full rounded-2xl border" style={{ background: css }} />
        <div className="relative">
          <pre className="overflow-x-auto rounded-2xl border bg-card p-4 pe-12 font-mono text-sm">background: {css};</pre>
          <button
            onClick={copy}
            className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-lg border bg-background transition-colors hover:bg-muted"
            aria-label="Copy"
          >
            <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} className="size-4" />
          </button>
        </div>
      </div>

      {/* Ayarlar */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {(["linear", "radial", "conic"] as GType[]).map((g) => (
              <button
                key={g}
                onClick={() => setType(g)}
                className={
                  "rounded-full px-3 py-1.5 text-xs capitalize transition-colors " +
                  (type === g ? "bg-primary font-medium text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70")
                }
              >
                {g}
              </button>
            ))}
          </div>
          <button onClick={randomize} className="inline-flex size-8 items-center justify-center rounded-lg border transition-colors hover:bg-muted" title={t("gradRandom")}>
            <HugeiconsIcon icon={ReloadIcon} strokeWidth={2} className="size-4" />
          </button>
        </div>

        {type !== "radial" ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              {t("gradAngle")}: {angle}°
            </span>
            <input type="range" min={0} max={360} value={angle} onChange={(e) => setAngle(Number(e.target.value))} className="accent-primary" />
          </label>
        ) : null}

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("gradStops")}</span>
            <button onClick={addStop} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-3.5" />
              {t("gradAddStop")}
            </button>
          </div>
          {stops.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-xl border p-2">
              <input type="color" value={s.color} onChange={(e) => update(s.id, { color: e.target.value })} className="size-8 cursor-pointer rounded border-0 bg-transparent p-0" />
              <input
                value={s.color}
                onChange={(e) => update(s.id, { color: e.target.value })}
                className="w-24 bg-transparent font-mono text-xs outline-none"
              />
              <input
                type="range"
                min={0}
                max={100}
                value={s.pos}
                onChange={(e) => update(s.id, { pos: Number(e.target.value) })}
                className="flex-1 accent-primary"
              />
              <span className="w-9 text-end text-xs tabular-nums text-muted-foreground">{s.pos}%</span>
              <button
                onClick={() => removeStop(s.id)}
                disabled={stops.length <= 2}
                className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
                aria-label="Remove"
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
