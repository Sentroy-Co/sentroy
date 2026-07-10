"use client"

import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Idea01Icon,
  CursorPointer01Icon,
  SquareLock02Icon,
  Link04Icon,
  PuzzleIcon,
  Download04Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Header ipucu paneli — iki sekme:
 *  1) "URL kısayolu": adres çubuğu maketinde cursor animasyonu, www.youtube.com
 *     → youtube.sentroy.com dönüşümünü öğretir.
 *  2) "Chrome eklentisi": .zip indirme linki + step-carousel ile manuel kurulum
 *     (mağazada yayınlanmadığı için sideload).
 *
 * Başlangıçta açık (autoOpen teaser, 2 döngü sonra kapanır). Hover'da açık kalır;
 * 💡 butonuna tıklayınca pinlenir (dışarı tıklayana / tekrar tıklayana kadar).
 */
export function UrlTrickButton({
  platform,
  domain,
}: {
  platform: string
  domain: string
}) {
  const t = useTranslations("d")
  const [tab, setTab] = useState<"url" | "ext">("url")
  const [autoOpen, setAutoOpen] = useState(true)
  const [hovering, setHovering] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [morphed, setMorphed] = useState(false)
  const [step, setStep] = useState(0)
  const cyclesRef = useRef(0)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const open = autoOpen || hovering || pinned

  const STEPS = [
    t("extStep1", { platform }),
    t("extStep2"),
    t("extStep3"),
    t("extStep4"),
    t("extStep5", { platform }),
  ]

  // URL sekmesinde adres dönüşüm döngüsü; teaser sırasında 2 döngü sonra kapat.
  useEffect(() => {
    if (!open || tab !== "url") {
      setMorphed(false)
      return
    }
    const id = setInterval(() => {
      setMorphed((m) => {
        const next = !m
        if (!next) {
          cyclesRef.current += 1
          if (cyclesRef.current >= 2 && !pinned) setAutoOpen(false)
        }
        return next
      })
    }, 1900)
    return () => clearInterval(id)
  }, [open, tab, pinned])

  // Pinliyken dışarı tıklama → kapat.
  useEffect(() => {
    if (!pinned) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setPinned(false)
        setHovering(false)
      }
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [pinned])

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setHovering(true)
  }
  const hide = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setHovering(false), 140)
  }

  const switchTab = (next: "url" | "ext") => {
    setAutoOpen(false) // kullanıcı etkileşti → teaser bitti
    setPinned(true) // sekme gezerken açık kal
    setTab(next)
  }

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <button
        type="button"
        aria-label={t("urlTrickAria")}
        aria-expanded={open}
        onClick={() => {
          setAutoOpen(false)
          setPinned((p) => !p)
        }}
        className="flex size-9 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
      >
        <HugeiconsIcon icon={Idea01Icon} strokeWidth={2} className="size-4" />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            role="dialog"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border bg-popover shadow-xl"
          >
            {/* Sekmeler */}
            <div className="flex gap-1 border-b p-1.5">
              {(
                [
                  { id: "url", label: t("trickTabUrl"), icon: Link04Icon },
                  { id: "ext", label: t("trickTabExt"), icon: PuzzleIcon },
                ] as const
              ).map((tb) => (
                <button
                  key={tb.id}
                  type="button"
                  onClick={() => switchTab(tb.id)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                    tab === tb.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <HugeiconsIcon icon={tb.icon} strokeWidth={2} className="size-3.5" />
                  {tb.label}
                </button>
              ))}
            </div>

            <div className="p-4">
              {tab === "url" ? (
                <UrlTab
                  morphed={morphed}
                  t={t}
                  platform={platform}
                  domain={domain}
                  base={domain.split(".")[0] || "youtube"}
                  pathExample={
                    domain.startsWith("instagram")
                      ? "/reel/DCx9AbZkQ12"
                      : "/watch?v=NxcmMrdT_aU"
                  }
                />
              ) : (
                <ExtTab
                  t={t}
                  platform={platform}
                  step={step}
                  setStep={setStep}
                  steps={STEPS}
                />
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

// ── URL kısayolu sekmesi ─────────────────────────────────────────────────────
function UrlTab({
  morphed,
  t,
  platform,
  domain,
  base,
  pathExample,
}: {
  morphed: boolean
  t: ReturnType<typeof useTranslations>
  platform: string
  domain: string
  /** Platform alan adı kökü — "youtube" / "instagram". */
  base: string
  /** Adres çubuğundaki örnek yol (youtube: /watch?v=…, instagram: /reel/…). */
  pathExample: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold">{t("urlTrickTitle")}</span>
      <span className="text-xs leading-relaxed text-muted-foreground">
        {t("urlTrickDesc", { platform, domain })}
      </span>

      <div className="relative mt-3 h-20 overflow-hidden rounded-xl bg-muted/60 p-3">
        <div className="flex h-9 items-center gap-2 rounded-lg border bg-background px-3">
          <HugeiconsIcon
            icon={SquareLock02Icon}
            strokeWidth={2}
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          <div className="flex min-w-0 items-center whitespace-nowrap font-mono text-[11px]">
            <span className="text-muted-foreground">https://</span>
            <span className="relative inline-flex">
              <AnimatePresence mode="popLayout" initial={false}>
                {morphed ? (
                  <motion.span
                    key="after"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                    className="text-foreground"
                  >
                    {base}.
                    <motion.span
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.1, type: "spring", stiffness: 400, damping: 18 }}
                      className="font-semibold text-primary"
                    >
                      sentroy
                    </motion.span>
                    .com
                  </motion.span>
                ) : (
                  <motion.span
                    key="before"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                    className="text-foreground"
                  >
                    www.{base}.com
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            <span className="text-muted-foreground">{pathExample}</span>
          </div>
        </div>

        <motion.div
          className="pointer-events-none absolute text-foreground"
          initial={false}
          animate={morphed ? { left: 92, top: 14, rotate: -8 } : { left: 232, top: 52, rotate: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
        >
          <motion.div
            animate={morphed ? { scale: [1, 0.82, 1] } : { scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <HugeiconsIcon icon={CursorPointer01Icon} strokeWidth={2} className="size-5 drop-shadow" />
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}

// ── Chrome eklentisi sekmesi ─────────────────────────────────────────────────
function ExtTab({
  t,
  platform,
  step,
  setStep,
  steps,
}: {
  t: ReturnType<typeof useTranslations>
  platform: string
  step: number
  setStep: (n: number) => void
  steps: string[]
}) {
  const total = steps.length
  const go = (d: number) => setStep((step + d + total) % total)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold">{t("extTitle")}</span>
        <span className="text-xs leading-relaxed text-muted-foreground">
          {t("extDesc", { platform })}
        </span>
      </div>

      <a
        href="/sentroy-downloader-extension.zip"
        download
        className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <HugeiconsIcon icon={Download04Icon} strokeWidth={2} className="size-4" />
        {t("extDownload")}
      </a>

      {/* Kurulum carousel'i */}
      <div className="rounded-xl border bg-muted/40 p-3">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("extStepLabel", { n: step + 1, total })}
        </span>
        <div className="mt-1.5 flex min-h-[52px] items-start gap-2.5">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {step + 1}
          </span>
          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.p
                key={step}
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.2 }}
                className="text-xs leading-relaxed text-foreground"
              >
                {steps[step]}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label={t("extPrev")}
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-4" />
          </button>
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`${i + 1}`}
                onClick={() => setStep(i)}
                className={cn(
                  "size-1.5 rounded-full transition-all",
                  i === step ? "w-4 bg-primary" : "bg-muted-foreground/30 hover:bg-muted-foreground/60",
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label={t("extNext")}
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          >
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
