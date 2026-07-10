"use client"

// GlassPanel — Sentroy OS "liquid glass" yüzeyi + imleç-takipli spotlight kenar.
//
// Spotlight, jüri kuralı gereği React re-render ÜRETMEZ: pointer koordinatları
// RAF-throttle ile CSS custom property'lere (--mx/--my) yazılır; ışıma
// radial-gradient bu değişkenlerden okur.

import { useRef, type ReactNode, type CSSProperties } from "react"
import { cn } from "@workspace/ui/lib/utils"

export function GlassPanel({
  children,
  className,
  spotlight = true,
  style,
}: {
  children: ReactNode
  className?: string
  /** İmleç-takipli kenar ışıması (pointer:fine cihazlarda görünür). */
  spotlight?: boolean
  style?: CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)
  const raf = useRef<number | null>(null)

  function onPointerMove(e: React.PointerEvent) {
    if (!spotlight || raf.current != null) return
    const el = ref.current
    if (!el) return
    const { clientX, clientY } = e
    raf.current = requestAnimationFrame(() => {
      raf.current = null
      const r = el.getBoundingClientRect()
      el.style.setProperty("--mx", `${clientX - r.left}px`)
      el.style.setProperty("--my", `${clientY - r.top}px`)
    })
  }

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      style={style}
      className={cn(
        "group/glass relative overflow-hidden rounded-3xl border border-white/[0.08]",
        "bg-gradient-to-b from-white/[0.07] to-white/[0.02] backdrop-blur-2xl",
        "shadow-[0_24px_80px_-32px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.06)]",
        className,
      )}
    >
      {/* Üst kenar glint çizgisi — cam imzası. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"
      />
      {spotlight ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover/glass:opacity-100 [@media(pointer:coarse)]:hidden"
          style={{
            background:
              "radial-gradient(280px circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.08), transparent 65%)",
          }}
        />
      ) : null}
      {children}
    </div>
  )
}
