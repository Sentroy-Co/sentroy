"use client"

// SceneCreate — Sahne 3: "Üret" (camera-dolly zoom).
//
// Spec: 300vh pin, tek sahne düzlemi (kamera wrapper'ı) 3 keyframe arasında scrub
// edilir — 0-33% Studio'ya zoom (waveform CSS loop + progress'e bağlı playhead),
// 33-66% OpenCut'a pan+zoom (klip scaleX ile trim + preview crossfade), 66-100%
// kamera geri açılır ve altta Tools marquee'si belirir (iki satır, zıt yön).
//
// Jüri kuralları burada nasıl uygulanıyor:
// - Pin container'a (ScrollScene sticky div) transform YOK — kamera hareketi iç
//   düzleme (motion.div wrapper) uygulanır.
// - Scrub yalnız transform + opacity: odak dışı pencere WindowScene'in `dimmed`
//   (filter) prop'u yerine wrapper OPACITY'siyle 0.4'e düşürülür.
// - Micro-loop'lar bileşen içi <style> keyframe'leri (lv2cr- prefix); sahne
//   görünür değilken animation-play-state:paused, reduced-motion'da tamamen durur.
// - full=false → poster: 3 kart + statik araç grid'i (SSR default, hydration güvenli).

import { useEffect, useRef } from "react"
import {
  motion,
  useTransform,
  useMotionValueEvent,
  useInView,
  type MotionValue,
} from "framer-motion"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Wrench01Icon,
  FilmRoll01Icon,
  Video01Icon,
  HeadphonesIcon,
  FolderLibraryIcon,
  KeyIcon,
  ChartBarLineIcon,
  Message01Icon,
  Mail01Icon,
  KanbanIcon,
} from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"
import { ScrollScene } from "../primitives/scroll-scene"
import { WindowScene } from "../primitives/window-scene"
import { InfiniteMarquee } from "../primitives/infinite-marquee"
import { Magnetic } from "../primitives/magnetic"
import { useMotionSafe } from "../primitives/use-motion-safe"
import { productById } from "../data/products"
import { useLandingV2 } from "../landing-context"

// ─── Sabitler ────────────────────────────────────────────────────────────────

const STUDIO = productById("studio")!
const OPENCUT = productById("opencut")!
const TOOLS = productById("tools")!

/** Segment sırası — scroll-spy odak değişimi bu tabloyu okur. */
const SEG_IDS = ["studio", "opencut", "tools"] as const

/** Kamera keyframe girişleri: geniş → Studio kilidi → geçiş → OpenCut kilidi → geri açılış. */
const CAM_IN = [0, 0.1, 0.3, 0.38, 0.6, 0.72, 1]

// Deterministik sahte-waveform yükseklikleri (SSR-stabil; Math.random YOK).
const WAVE_BARS = Array.from({ length: 56 }, (_, i) =>
  Math.round(24 + 56 * Math.abs(Math.sin(i * 1.7 + 0.6))),
)

// 30 araç — i18n anahtar listesi (create.marquee.i1 … i30).
const MARQUEE_KEYS = Array.from({ length: 30 }, (_, i) => `i${i + 1}`)

// Chip ikon/renk döngüsü — yalnız repoda kanıtlı core-free-icons isimleri.
const CHIP_ICONS = [
  Wrench01Icon,
  FilmRoll01Icon,
  Video01Icon,
  HeadphonesIcon,
  FolderLibraryIcon,
  KeyIcon,
  ChartBarLineIcon,
  Message01Icon,
  Mail01Icon,
  KanbanIcon,
]
const CHIP_COLORS = ["#6366f1", "#ec4899", "#f97316", "#06b6d4", "#10b981", "#f59e0b", "#a855f7", "#3b82f6"]

// Micro-loop stilleri — lv2cr- prefix'li, bileşen dışına sızmaz.
const LV2CR_STYLE = `
@keyframes lv2cr-wave { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.lv2cr-wave-track { animation: lv2cr-wave 20s linear infinite; }
.lv2cr-paused .lv2cr-wave-track { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) { .lv2cr-wave-track { animation: none; } }
`

// ─── Giriş noktası ───────────────────────────────────────────────────────────

export function SceneCreate() {
  const { full } = useMotionSafe()

  // SSR + mobil + reduced-motion → poster. Pin/scrub yalnız `full` iken kurulur.
  if (!full) return <CreatePoster />

  return (
    <ScrollScene heightVh={300} id="lv2-create" className="bg-[#08080c]">
      {(progress) => <CreateStage progress={progress} />}
    </ScrollScene>
  )
}

// ─── Full sahne (pinned-scrub) ───────────────────────────────────────────────

function CreateStage({ progress }: { progress: MotionValue<number> }) {
  const t = useTranslations("landingV2")
  const { light, unlight, setActiveProduct } = useLandingV2()
  const rootRef = useRef<HTMLDivElement>(null)
  const inView = useInView(rootRef, { amount: 0.05 })

  // Kamera: tek wrapper transform'u — translate önce, scale sonra uygulanır
  // (framer sırası), bu yüzden tx = -scale * hedef-ofset hesabıyla kilitlenir.
  // Studio merkezi ≈ (%29, %40) → ofset (-21vw, -10vh) → tx +34vw / +16vh.
  // OpenCut merkezi ≈ (%74, %53) → ofset (+24vw, +3vh) → tx -38vw / -5vh.
  const camScale = useTransform(progress, CAM_IN, [1, 1.6, 1.6, 1.6, 1.6, 0.9, 0.9])
  const camX = useTransform(progress, CAM_IN, ["0vw", "34vw", "34vw", "-38vw", "-38vw", "0vw", "0vw"])
  const camY = useTransform(progress, CAM_IN, ["0vh", "16vh", "16vh", "-5vh", "-5vh", "-4vh", "-4vh"])

  // Odak dışı pencere: opacity 0.4 (blur/filter YOK — jüri kuralı).
  const studioOp = useTransform(progress, [0, 0.36, 0.42, 0.62, 0.72], [1, 1, 0.4, 0.4, 0.85])
  const opencutOp = useTransform(progress, [0, 0.08, 0.14, 0.36, 0.42, 0.66, 0.72], [1, 1, 0.4, 0.4, 1, 1, 0.85])

  // Geniş plan başlığı: zoom başlar başlamaz çekilir.
  const headOp = useTransform(progress, [0, 0.1], [1, 0])
  const headY = useTransform(progress, [0, 0.1], [0, -40])

  // Beat altyazıları (kamera düzleminin DIŞINDA — zoom'da bulanmaz/ölçeklenmez).
  const capStudioOp = useTransform(progress, [0.08, 0.14, 0.28, 0.35], [0, 1, 1, 0])
  const capStudioY = useTransform(progress, [0.08, 0.14], [16, 0])
  const capOpencutOp = useTransform(progress, [0.38, 0.44, 0.58, 0.66], [0, 1, 1, 0])
  const capOpencutY = useTransform(progress, [0.38, 0.44], [16, 0])

  // Pencere içi scrub'lar: playhead (translateX %), klip trim (scaleX), preview (opacity).
  const playheadX = useTransform(progress, [0.06, 0.33], ["0%", "92%"])
  const clipScale = useTransform(progress, [0.4, 0.62], [1, 0.58])
  const previewB = useTransform(progress, [0.44, 0.58], [0, 1])

  // Tools finali: marquee paneli aşağıdan belirir; görünür olana dek tıklanamaz.
  // Erken netleşir (0.72'de tam opak) ve pin sonuna dek net kalır; aynı anda
  // kamera düzlemi + zemin karartılır — şerit "hep transparan" okunmasın,
  // final sahnenin tek odağı olsun.
  const toolsOp = useTransform(progress, [0.62, 0.72], [0, 1])
  const toolsY = useTransform(progress, [0.62, 0.72], [48, 0])
  const toolsPe = useTransform(progress, (v) => (v > 0.66 ? "auto" : "none"))
  const camDim = useTransform(progress, [0.64, 0.76], [1, 0.15])
  const bgDim = useTransform(progress, [0.64, 0.76], [0, 0.72])

  // Beat tespiti — threshold-crossing guard: React state'e her frame YAZILMAZ;
  // segment yalnız değiştiğinde setActiveProduct, light() ise ref ile tek atımlık.
  const segRef = useRef<number>(-2)
  const litRef = useRef({ studio: false, opencut: false, tools: false })
  useMotionValueEvent(progress, "change", (v) => {
    const seg = v <= 0.02 ? -1 : v < 0.34 ? 0 : v < 0.67 ? 1 : 2
    if (seg !== segRef.current) {
      segRef.current = seg
      setActiveProduct(seg === -1 ? null : SEG_IDS[seg]!)
    }
    // Çift yönlü koleksiyon — eşikler progress'in saf fonksiyonu.
    const thresholds = [
      ["studio", 0.3],
      ["opencut", 0.63],
      ["tools", 0.88],
    ] as const
    for (const [id, tau] of thresholds) {
      const on = v >= tau
      if (on && !litRef.current[id]) {
        litRef.current[id] = true
        light(id)
      } else if (!on && litRef.current[id]) {
        litRef.current[id] = false
        unlight(id)
      }
    }
  })

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative h-full w-full overflow-hidden bg-[#08080c] text-white",
        // Sahne görünür değilken micro-loop'ları durdur (GPU tasarrufu).
        !inView && "lv2cr-paused",
      )}
    >
      <style>{LV2CR_STYLE}</style>

      {/* Dekoratif zemin: radial ışıma + nokta grid */}
      <div aria-hidden className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_20%,rgba(99,102,241,0.10),transparent_70%)]" />
        <div className="absolute inset-0 opacity-[0.35] [background-image:radial-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:28px_28px]" />
      </div>

      {/* Geniş plan başlığı */}
      <motion.div
        style={{ opacity: headOp, y: headY }}
        className="pointer-events-none absolute inset-x-0 top-[9%] z-10 flex flex-col items-center gap-3 px-6 text-center"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/60">{t("create.eyebrow")}</span>
        <h2 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">{t("create.title")}</h2>
        <p className="max-w-xl text-base text-white/55">{t("create.subtitle")}</p>
      </motion.div>

      {/* KAMERA DÜZLEMİ — sahnenin tek transform katmanı; çocuklara dokunulmaz.
          Tools finalinde opacity ile geri çekilir (odak şeride geçer). */}
      <motion.div
        style={{ scale: camScale, x: camX, y: camY, opacity: camDim }}
        className="absolute inset-0 will-change-transform"
      >
        {/* Studio penceresi */}
        <motion.div style={{ opacity: studioOp }} className="absolute left-[6%] top-[13%] h-[54%] w-[46%]">
          <WindowScene product={STUDIO} title={t("create.studio.window")} className="h-full">
            <StudioMock playheadX={playheadX} />
          </WindowScene>
        </motion.div>

        {/* OpenCut penceresi */}
        <motion.div style={{ opacity: opencutOp }} className="absolute left-[54%] top-[28%] h-[50%] w-[40%]">
          <WindowScene product={OPENCUT} title={t("create.opencut.window")} className="h-full">
            <OpencutMock clipScale={clipScale} previewB={previewB} />
          </WindowScene>
        </motion.div>
      </motion.div>

      {/* Beat altyazıları */}
      <motion.div
        style={{ opacity: capStudioOp, y: capStudioY }}
        className="pointer-events-none absolute inset-x-0 bottom-[8%] z-10 flex flex-col items-center gap-1.5 px-6 text-center"
      >
        <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("create.studio.heading")}</h3>
        <p className="max-w-md text-sm text-white/55">{t("create.studio.desc")}</p>
      </motion.div>
      <motion.div
        style={{ opacity: capOpencutOp, y: capOpencutY }}
        className="pointer-events-none absolute inset-x-0 bottom-[8%] z-10 flex flex-col items-center gap-1.5 px-6 text-center"
      >
        <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("create.opencut.heading")}</h3>
        <p className="max-w-md text-sm text-white/55">{t("create.opencut.desc")}</p>
      </motion.div>

      {/* Finale zemin karartması — arkadaki grid/pencereler şeritle yarışmasın */}
      <motion.div
        aria-hidden
        style={{ opacity: bgDim }}
        className="pointer-events-none absolute inset-0 z-[15] bg-[#060609]"
      />

      {/* Tools finali — marquee şeridi (solid zemin: her zaman net okunur) */}
      <motion.div
        style={{ opacity: toolsOp, y: toolsY, pointerEvents: toolsPe }}
        className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-6 bg-gradient-to-t from-[#08080c] from-45% via-[#08080c]/95 via-70% to-transparent pb-10 pt-24"
      >
        <div className="flex flex-col items-center gap-2 px-6 text-center">
          <h3 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("create.tools.heading")}</h3>
          <p className="text-sm text-white/55">{t("create.tools.desc")}</p>
        </div>
        <div className="flex w-full flex-col gap-3" aria-label={t("create.marqueeAria")}>
          <InfiniteMarquee durationSec={44}>
            <ToolChips from={0} to={15} />
          </InfiniteMarquee>
          <InfiniteMarquee durationSec={62} reverse>
            <ToolChips from={15} to={30} />
          </InfiniteMarquee>
        </div>
        <Magnetic strength={8}>
          <a
            href={TOOLS.href}
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.06] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/[0.12] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
          >
            {t("create.tools.cta")}
            <span aria-hidden>→</span>
          </a>
        </Magnetic>
      </motion.div>
    </div>
  )
}

// ─── Pencere mock'ları (statik DOM — iframe YASAK) ──────────────────────────

function StudioMock({ playheadX }: { playheadX: MotionValue<string> }) {
  const t = useTranslations("landingV2")
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {/* Transport çubuğu */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="h-2 w-2 rounded-full bg-white/25" />
          <span className="h-2 w-2 rounded-full bg-white/25" />
          <span className="h-2 w-2 rounded-full" style={{ background: STUDIO.color }} />
        </div>
        <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium tabular-nums text-white/60">
          {t("create.studio.bpm")}
        </span>
      </div>

      {/* Track alanı + progress'e bağlı playhead */}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-white/[0.06] bg-black/30 p-2">
        <div className="flex h-full flex-col gap-2">
          <TrackRow label={t("create.studio.track1")} color={STUDIO.color} animated />
          <TrackRow label={t("create.studio.track2")} color="#8b5cf6" />
          <TrackRow label={t("create.studio.track3")} color="#06b6d4" />
        </div>
        {/* Playhead — full-width wrapper'ın kendi genişliğine göre translateX(%) → saf transform */}
        <motion.div aria-hidden style={{ x: playheadX }} className="pointer-events-none absolute inset-y-2 left-2 w-full">
          <div className="h-full w-[2px] rounded-full bg-white/85 shadow-[0_0_12px_rgba(255,255,255,0.55)]" />
        </motion.div>
      </div>
    </div>
  )
}

function TrackRow({ label, color, animated = false }: { label: string; color: string; animated?: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 items-center gap-2">
      <span className="w-12 shrink-0 truncate text-[9px] font-medium uppercase tracking-wide text-white/60">{label}</span>
      <div className="relative h-full min-h-0 flex-1 overflow-hidden rounded-md bg-white/[0.03]">
        <WaveLane color={color} animated={animated} />
      </div>
    </div>
  )
}

/**
 * WaveLane — sahte waveform. animated=true iken içerik iki kez render edilip
 * translateX(-50%) döngüsüyle dikişsiz kayar (lv2cr-wave keyframe'i).
 */
function WaveLane({ color, animated = false }: { color: string; animated?: boolean }) {
  const copies = animated ? [0, 1] : [0]
  return (
    <div aria-hidden className={cn("flex h-full w-max items-center gap-[3px] px-1", animated && "lv2cr-wave-track")}>
      {copies.map((copy) => (
        <div key={copy} className="flex h-full shrink-0 items-center gap-[3px]">
          {WAVE_BARS.map((h, i) => (
            <span
              key={i}
              className="w-[3px] shrink-0 rounded-full"
              style={{ height: `${h}%`, background: color, opacity: 0.8 }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function OpencutMock({
  clipScale,
  previewB,
}: {
  clipScale: MotionValue<number>
  previewB: MotionValue<number>
}) {
  const t = useTranslations("landingV2")
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {/* Önizleme — scrub ile kare crossfade (yalnız opacity) */}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-white/[0.06]">
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(135deg,#1e1b4b,#0f172a_55%,#312e81)]" />
        <motion.div
          aria-hidden
          style={{ opacity: previewB }}
          className="absolute inset-0 bg-[linear-gradient(135deg,#431407,#0c0a09_55%,#7c2d12)]"
        />
        <span className="absolute left-2 top-2 rounded bg-black/50 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white/60">
          {t("create.opencut.preview")}
        </span>
        <div aria-hidden className="absolute bottom-2 right-2 h-1.5 w-16 rounded-full bg-white/15">
          <div className="h-full w-1/3 rounded-full bg-white/50" />
        </div>
      </div>

      {/* Timeline — klip scaleX ile trim edilir; etiket ölçeklenmesin diye scaled blok DIŞINDA */}
      <div className="flex shrink-0 flex-col gap-1.5 rounded-lg border border-white/[0.06] bg-black/30 p-2">
        <div className="relative h-7 overflow-hidden rounded-md bg-white/[0.03]">
          <motion.div
            aria-hidden
            style={{ scaleX: clipScale }}
            className="absolute inset-y-0.5 left-0.5 w-[85%] origin-left rounded-[5px] border border-orange-400/40 bg-gradient-to-r from-orange-500/70 to-orange-400/45"
          />
          <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-[9px] font-medium text-white/85">
            {t("create.opencut.clip")}
          </span>
        </div>
        <div className="relative h-5 overflow-hidden rounded-md bg-white/[0.03]">
          <div aria-hidden className="absolute inset-y-0.5 left-0.5 w-[70%] rounded-[5px] border border-sky-400/30 bg-sky-500/25" />
          <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-[9px] font-medium text-white/55">
            {t("create.opencut.audio")}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Araç chip'leri ──────────────────────────────────────────────────────────

function ToolChips({ from, to, compact = false }: { from: number; to: number; compact?: boolean }) {
  const t = useTranslations("landingV2")
  return (
    <>
      {MARQUEE_KEYS.slice(from, to).map((k, i) => {
        const gi = from + i
        return (
          <span
            key={k}
            className={cn(
              // Solid koyu zemin + yüksek kontrast — cam üstünde bile net okunur.
              "flex shrink-0 items-center gap-2 rounded-full border border-white/[0.16] bg-[#14141c] text-white/90 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.6)]",
              compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
            )}
          >
            <HugeiconsIcon
              icon={CHIP_ICONS[gi % CHIP_ICONS.length]!}
              className={compact ? "h-3.5 w-3.5" : "h-4 w-4"}
              style={{ color: CHIP_COLORS[gi % CHIP_COLORS.length] }}
              strokeWidth={1.8}
              aria-hidden
            />
            {t(`create.marquee.${k}`)}
          </span>
        )
      })}
    </>
  )
}

// ─── Poster (SSR / mobil / reduced-motion) ───────────────────────────────────

function CreatePoster() {
  const t = useTranslations("landingV2")
  const { light } = useLandingV2()
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { amount: 0.15 })
  const litRef = useRef(false)

  // Poster'da beat scrub'ı yok — bölüm görüldüğünde üç ürün birden "yanar".
  useEffect(() => {
    if (inView && !litRef.current) {
      litRef.current = true
      light("studio")
      light("opencut")
      light("tools")
    }
  }, [inView, light])

  return (
    <section
      ref={ref}
      id="lv2-create"
      className={cn(
        "relative overflow-hidden bg-[#08080c] px-4 py-20 text-white sm:px-6",
        !inView && "lv2cr-paused",
      )}
    >
      <style>{LV2CR_STYLE}</style>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_50%_at_50%_0%,rgba(99,102,241,0.10),transparent_70%)]" />

      <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-3 text-center">
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/60">{t("create.eyebrow")}</span>
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("create.title")}</h2>
        <p className="max-w-xl text-sm text-white/55 sm:text-base">{t("create.subtitle")}</p>
      </div>

      {/* 3 kart — pencere kromu korunur, koreografi yok (hafif hover kaldırması serbest) */}
      <div className="relative mx-auto mt-10 grid max-w-5xl gap-4 md:grid-cols-3">
        <PosterCard
          product={STUDIO}
          windowTitle={t("create.studio.window")}
          heading={t("create.studio.heading")}
          desc={t("create.studio.desc")}
        >
          <div className="flex h-full flex-col gap-2 p-3">
            <span className="self-end rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium tabular-nums text-white/60">
              {t("create.studio.bpm")}
            </span>
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border border-white/[0.06] bg-black/30 p-1.5">
              <WaveLane color={STUDIO.color} animated />
              {/* Statik playhead — poster'da scrub yok */}
              <div aria-hidden className="absolute inset-y-1.5 left-[42%] w-[2px] rounded-full bg-white/80" />
            </div>
          </div>
        </PosterCard>

        <PosterCard
          product={OPENCUT}
          windowTitle={t("create.opencut.window")}
          heading={t("create.opencut.heading")}
          desc={t("create.opencut.desc")}
        >
          <div className="flex h-full flex-col gap-2 p-3">
            <div aria-hidden className="min-h-0 flex-1 rounded-md border border-white/[0.06] bg-[linear-gradient(135deg,#1e1b4b,#0f172a_55%,#312e81)]" />
            <div className="relative h-6 shrink-0 overflow-hidden rounded-md bg-white/[0.03]">
              <div aria-hidden className="absolute inset-y-0.5 left-0.5 w-[58%] rounded-[5px] border border-orange-400/40 bg-gradient-to-r from-orange-500/70 to-orange-400/45" />
              <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-[9px] font-medium text-white/85">
                {t("create.opencut.clip")}
              </span>
            </div>
          </div>
        </PosterCard>

        <PosterCard
          product={TOOLS}
          windowTitle={t("create.tools.heading")}
          heading={t("create.tools.heading")}
          desc={t("create.tools.desc")}
        >
          <div aria-hidden className="grid h-full grid-cols-4 place-items-center gap-2 p-4">
            {CHIP_ICONS.slice(0, 8).map((icon, i) => (
              <span key={i} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04]">
                <HugeiconsIcon icon={icon} className="h-4 w-4" style={{ color: CHIP_COLORS[i % CHIP_COLORS.length] }} strokeWidth={1.8} />
              </span>
            ))}
          </div>
        </PosterCard>
      </div>

      {/* Statik araç grid'i (marquee'nin poster karşılığı) */}
      <div className="relative mx-auto mt-10 flex max-w-4xl flex-wrap justify-center gap-2" aria-label={t("create.marqueeAria")}>
        <ToolChips from={0} to={18} compact />
        <a
          href={TOOLS.href}
          className="flex shrink-0 items-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/[0.14] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
        >
          {t("create.tools.more")}
          <span aria-hidden>→</span>
        </a>
      </div>
    </section>
  )
}

function PosterCard({
  product,
  windowTitle,
  heading,
  desc,
  children,
}: {
  product: NonNullable<ReturnType<typeof productById>>
  windowTitle: string
  heading: string
  desc: string
  children: React.ReactNode
}) {
  return (
    <a
      href={product.href}
      className="group block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/60"
    >
      <WindowScene
        product={product}
        title={windowTitle}
        className="h-44 transition-transform duration-300 group-hover:-translate-y-1"
      >
        {children}
      </WindowScene>
      <div className="mt-3 px-1">
        <h3 className="text-base font-semibold">{heading}</h3>
        <p className="mt-1 text-sm text-white/55">{desc}</p>
      </div>
    </a>
  )
}
