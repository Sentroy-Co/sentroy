"use client"

import { useCallback, useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft02Icon, ArrowRight02Icon, Cancel01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { useTourStore, type TourStep } from "./tour-store"

/** Overlay kroması (adım metni DEĞİL) — her app kendi i18n'inden geçirir.
 *  Geçilmezse İngilizce varsayılanlar kullanılır. */
export interface TourLabels {
  next: string
  back: string
  skip: string
  done: string
}

const DEFAULT_LABELS: TourLabels = {
  next: "Next",
  back: "Back",
  skip: "Skip",
  done: "Done",
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const PAD = 8
const CARD_W = 320
const GAP = 14

/** Dock DOM'a dokunulamadığından bölge rect'i hesaplanır (alt-orta şerit). */
function regionRect(region: "dock"): Rect | null {
  if (typeof window === "undefined") return null
  if (region === "dock") {
    const w = Math.min(460, window.innerWidth - 40)
    return { x: (window.innerWidth - w) / 2, y: window.innerHeight - 96, width: w, height: 76 }
  }
  return null
}

function resolveRect(step: TourStep | undefined): Rect | null {
  if (!step) return null
  if (step.placement === "center") return null
  if (step.targetSelector) {
    const el = document.querySelector(step.targetSelector)
    if (el) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) {
        return { x: r.left - PAD, y: r.top - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }
      }
    }
  }
  if (step.region) return regionRect(step.region)
  return null
}

/**
 * Paylaşılan tur/ipucu overlay'i — viewport-relative (`fixed inset-0`, z-[80]),
 * OS iframe embed'inde de çalışır. Aktif adımın hedefini runtime'da çözer;
 * hedef varsa etrafına 4 karartma paneli + parlayan halka (delik hedefi
 * gösterir), yoksa ortalı modal kart. Cam tooltip kartı hedefe göre alta/üste
 * konumlanır. İleri/Geri/Atla + adım noktaları. Resize/scroll'da yeniden
 * hesaplar. Krom metni `labels` prop'undan gelir (i18n çağıran app'te).
 */
export function TourOverlay({ labels }: { labels?: Partial<TourLabels> }) {
  const l: TourLabels = { ...DEFAULT_LABELS, ...labels }
  const active = useTourStore((s) => s.active)
  const steps = useTourStore((s) => s.steps)
  const index = useTourStore((s) => s.index)
  const next = useTourStore((s) => s.next)
  const prev = useTourStore((s) => s.prev)
  const goTo = useTourStore((s) => s.goTo)
  const stop = useTourStore((s) => s.stop)

  const step = steps[index]
  const [rect, setRect] = useState<Rect | null>(null)

  const recompute = useCallback(() => {
    setRect(resolveRect(step))
  }, [step])

  useEffect(() => {
    if (!active) return
    recompute()
    // Hedef geç mount olabilir / pencere hareket edebilir → periyodik + event.
    const id = setInterval(recompute, 400)
    window.addEventListener("resize", recompute)
    window.addEventListener("scroll", recompute, true)
    return () => {
      clearInterval(id)
      window.removeEventListener("resize", recompute)
      window.removeEventListener("scroll", recompute, true)
    }
  }, [active, recompute])

  // Esc → kapat; ok tuşlarıyla gezinme.
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop()
      else if (e.key === "ArrowRight") next()
      else if (e.key === "ArrowLeft") prev()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [active, next, prev, stop])

  if (!active || !step) return null

  const vw = typeof window !== "undefined" ? window.innerWidth : 1440
  const vh = typeof window !== "undefined" ? window.innerHeight : 900

  // Kart konumu: hedef varsa alt/üst tercih; yoksa ekran ortası.
  let cardStyle: React.CSSProperties
  if (rect) {
    const below = rect.y + rect.height + GAP
    const preferTop = step.placement === "top" || below + 180 > vh
    const left = Math.min(Math.max(rect.x + rect.width / 2 - CARD_W / 2, 12), vw - CARD_W - 12)
    cardStyle = preferTop
      ? { left, bottom: vh - rect.y + GAP, width: CARD_W }
      : { left, top: below, width: CARD_W }
  } else {
    cardStyle = { left: vw / 2 - CARD_W / 2, top: vh / 2 - 90, width: CARD_W }
  }

  const isLast = index >= steps.length - 1
  const isFirst = index === 0

  return (
    <div className="fixed inset-0 z-[80]">
      {/* Karartma — hedef varsa 4 panel (delik hedefi açık bırakır); yoksa tam ekran. */}
      {rect ? (
        <>
          <div className="absolute inset-x-0 top-0 bg-black/55 backdrop-blur-[2px]" style={{ height: Math.max(0, rect.y) }} onClick={stop} />
          <div className="absolute inset-x-0 bg-black/55 backdrop-blur-[2px]" style={{ top: rect.y + rect.height, bottom: 0 }} onClick={stop} />
          <div className="absolute bg-black/55 backdrop-blur-[2px]" style={{ top: rect.y, left: 0, width: Math.max(0, rect.x), height: rect.height }} onClick={stop} />
          <div className="absolute bg-black/55 backdrop-blur-[2px]" style={{ top: rect.y, left: rect.x + rect.width, right: 0, height: rect.height }} onClick={stop} />
          {/* Parlayan halka */}
          <div
            className="pointer-events-none absolute rounded-2xl ring-2 ring-primary/80 shadow-[0_0_0_4px_rgba(255,255,255,0.12)]"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={stop} />
      )}

      {/* Tooltip kartı */}
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute overflow-hidden rounded-2xl border border-white/20 bg-background/95 p-4 shadow-[0_24px_70px_-12px_rgba(0,0,0,0.6)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10"
          style={cardStyle}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/20" />
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
            <button
              type="button"
              onClick={stop}
              aria-label={l.skip}
              className="-mr-1 -mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-foreground/10 hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" strokeWidth={2} />
            </button>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{step.body}</p>

          {step.action ? (
            <Button
              size="sm"
              className="mt-3 h-7 w-full text-xs"
              onClick={() => {
                step.action?.run()
                stop()
              }}
            >
              {step.action.label}
            </Button>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-2">
            {/* Adım noktaları (birden çok adım varsa) */}
            {steps.length > 1 ? (
              <div className="flex items-center gap-1">
                {steps.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`${i + 1}`}
                    onClick={() => goTo(i)}
                    className={
                      "size-1.5 rounded-full transition-all " +
                      (i === index ? "w-3 bg-foreground/70" : "bg-foreground/25 hover:bg-foreground/45")
                    }
                  />
                ))}
              </div>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-1.5">
              {!isFirst ? (
                <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={prev}>
                  <HugeiconsIcon icon={ArrowLeft02Icon} className="size-3.5" strokeWidth={2} />
                  {l.back}
                </Button>
              ) : null}
              {steps.length > 1 && !isLast ? (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={stop}>
                  {l.skip}
                </Button>
              ) : null}
              <Button size="sm" className="h-7 gap-1 px-2.5 text-xs" onClick={next}>
                {isLast ? l.done : l.next}
                {!isLast ? <HugeiconsIcon icon={ArrowRight02Icon} className="size-3.5" strokeWidth={2} /> : null}
              </Button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
