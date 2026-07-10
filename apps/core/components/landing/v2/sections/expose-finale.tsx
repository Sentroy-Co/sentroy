"use client"

// ExposeFinale — "Exposé: Tek Oturum" finali (spec: one-session + jüri graft'ı "12. ikon").
//
// Koreografi (ScrollScene 250vh, progress 0→1):
//   0.03-0.35  11 ürünün BASİTLEŞTİRİLMİŞ snapshot kartı (tam WindowScene mock'u DEĞİL:
//              mini titlebar + ikon + tek satır; [content-visibility:auto]) Exposé grid'ine
//              stagger ile dizilir. Üstte başlık: "Hepsi. Tek oturumda."
//   0.36-0.70  Kartlar dock sırasıyla genie-minimize olur — SAF transform:
//              scale → 0.08 + x/y kendi dock slot hedefine; opacity yalnız pencerenin
//              son %10'unda düşer. (skew / clip-path / blur YOK — jüri kararı.)
//   0.50-0.76  12. ikon (Sentroy OS) merkezde belirir ve dock'taki 11. slota "düşer".
//   0.72       light("os") + sweep() BİR KEZ tetiklenir (threshold-crossing guard) —
//              koleksiyon tamamlandı sinyali, dock fisheye dalgası.
//   0.80-1.00  Boş nefes alanı: tek satır punchline + 3 mikro-stat (CountUp).
//
// Dock hedef koordinatları YAKLAŞIKTIR (viewport alt-ortası, slot başına ~56px).
// DockNav ileride gerçek ikon rect registry'si sunarsa yalnız measure() içindeki
// slotX/dockY hesabı değiştirilir — kart koreografisi dokunulmadan kalır.
//
// Kural uyumu: pin container'a transform uygulanmaz (tüm hareket iç motion katmanlarında);
// scrub yalnız transform + opacity; poster hali SSR default'udur (useMotionSafe).

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import {
  motion,
  animate,
  useInView,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "framer-motion"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"

import { ScrollScene } from "../primitives/scroll-scene"
import { GlassPanel } from "../primitives/glass-panel"
import { useMotionSafe } from "../primitives/use-motion-safe"
import { useLandingV2 } from "../landing-context"
import { LANDING_PRODUCTS, productById, productLogoUrl, type LandingProduct } from "../data/products"

// ─────────────────────────────────────────────────────────────────────────────
// Sabitler — zaman çizelgesi (progress yüzdeleri) + dock geometri yaklaşımı
// ─────────────────────────────────────────────────────────────────────────────

/** Exposé grid'inde gösterilen 11 ürün (os hariç — o finalde düşer). */
const SNAPSHOT_PRODUCTS = LANDING_PRODUCTS.filter((p) => p.sceneTier !== "os")
const OS_PRODUCT = productById("os")!

// Giriş: 0.03 → son kart ~0.32'de yerleşir (spec: 0-35%).
const ENTRY_START = 0.03
const ENTRY_STAGGER = 0.02
const ENTRY_DUR = 0.09
// Genie çıkışı: 0.36 → son kart 0.70'te dock'a iner (spec: 35-70%).
const EXIT_START = 0.36
const EXIT_STAGGER = 0.024
const EXIT_DUR = 0.1
// 12. ikon: belirme + düşüş.
const OS_IN_START = 0.5
const OS_IN_END = 0.58
const OS_DROP_START = 0.62
const OS_DROP_END = 0.76
// Tek-seferlik beat eşikleri.
const LIGHT_AT = 0.72
const STATS_AT = 0.78
// Dock geometri yaklaşımı: alt-orta hizalı, slot başına ~56px, alt boşluk ~52px.
const DOCK_SLOT_PX = 56
const DOCK_BOTTOM_PX = 52

type TFn = ReturnType<typeof useTranslations>
interface GenieTarget {
  dx: number
  dy: number
}

// Mikro-loop: kart satırındaki canlılık noktası — bileşen-içi keyframe (lv2- prefix),
// reduced-motion'da tek karede durur; görünürlük dışında play-state paused.
const PULSE_CSS = `
@keyframes lv2-expose-pulse { 0%, 100% { transform: scale(1); opacity: .9; } 50% { transform: scale(1.45); opacity: .4; } }
@media (prefers-reduced-motion: reduce) { .lv2-expose-dot { animation: none !important; } }
`

// ─────────────────────────────────────────────────────────────────────────────
// Easing + aralık yardımcıları (scrub deterministik kalsın diye saf fonksiyon)
// ─────────────────────────────────────────────────────────────────────────────

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInCubic = (t: number) => t * t * t
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
// Hafif overshoot'lu giriş — "spring stagger" hissi, ekstra spring maliyeti yok.
const easeOutBack = (t: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

/** v'yi [a,b] penceresinde ease'leyip [from,to] aralığına haritalar (clamp'li). */
function mapRange(
  v: number,
  a: number,
  b: number,
  from: number,
  to: number,
  ease: (t: number) => number = (t) => t,
): number {
  const p = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return from + (to - from) * ease(p)
}

// ─────────────────────────────────────────────────────────────────────────────
// CountUp — useInView/progress tetiğiyle bir kez sayar; DOM'a doğrudan yazar
// (her frame React state YOK). Reduced-motion'da hedefe anında oturur.
// ─────────────────────────────────────────────────────────────────────────────

function CountUp({
  to,
  start,
  prefix = "",
  suffix = "",
}: {
  to: number
  start: boolean
  prefix?: string
  suffix?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const { reducedMotion } = useMotionSafe()

  useEffect(() => {
    const el = ref.current
    if (!el || !start) return
    if (reducedMotion) {
      el.textContent = `${prefix}${to}${suffix}`
      return
    }
    const controls = animate(0, to, {
      duration: 1.1,
      ease: "easeOut",
      onUpdate: (v) => {
        el.textContent = `${prefix}${Math.round(v)}${suffix}`
      },
    })
    return () => controls.stop()
  }, [start, to, prefix, suffix, reducedMotion])

  return (
    <span ref={ref} className="tabular-nums">
      {`${prefix}0${suffix}`}
    </span>
  )
}

/** 3 mikro-stat: 12 ürün / 1 ortak oturum / ~2 dk kurulum. */
function StatsRow({ start, t }: { start: boolean; t: TFn }) {
  return (
    <dl className="flex items-start justify-center gap-10 sm:gap-16">
      <Stat value={12} label={t("expose.stats.products.label")} start={start} />
      <Stat value={1} label={t("expose.stats.session.label")} start={start} />
      <Stat
        value={2}
        prefix="~"
        suffix={t("expose.stats.setup.suffix")}
        label={t("expose.stats.setup.label")}
        start={start}
      />
    </dl>
  )
}

function Stat({
  value,
  label,
  start,
  prefix,
  suffix,
}: {
  value: number
  label: string
  start: boolean
  prefix?: string
  suffix?: string
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <dd className="order-1 m-0 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
        <CountUp to={value} start={start} prefix={prefix} suffix={suffix} />
      </dd>
      <dt className="order-2 text-[11px] uppercase tracking-[0.16em] text-white/60">{label}</dt>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SnapshotCard — WindowScene'in ağır mock'u DEĞİL: mini titlebar + ikon + tek satır.
// Giriş (stagger) ve genie çıkışı tek fonksiyonel useTransform zincirinde birleşir.
// ─────────────────────────────────────────────────────────────────────────────

function SnapshotCard({
  product,
  index,
  progress,
  targetsRef,
  setCell,
  title,
  line,
  playing,
}: {
  product: LandingProduct
  index: number
  progress: MotionValue<number>
  targetsRef: RefObject<(GenieTarget | null)[]>
  setCell: (el: HTMLDivElement | null) => void
  title: string
  line: string
  playing: boolean
}) {
  // OS dock ile ortak özel PNG logo (snapshot ürünlerinin hepsi logolu).
  const logoUrl = productLogoUrl(product.id)
  // Kartın kendi zaman pencereleri (giriş + çıkış).
  const es = ENTRY_START + index * ENTRY_STAGGER
  const ee = es + ENTRY_DUR
  const xs = EXIT_START + index * EXIT_STAGGER
  const xe = xs + EXIT_DUR

  const x = useTransform(progress, (v) => {
    if (v <= xs) return 0
    const tgt = targetsRef.current?.[index]
    return mapRange(v, xs, xe, 0, tgt ? tgt.dx : 0, easeInOutCubic)
  })
  const y = useTransform(progress, (v) => {
    if (v <= xs) return mapRange(v, es, ee, 36, 0, easeOutCubic)
    const tgt = targetsRef.current?.[index]
    return mapRange(v, xs, xe, 0, tgt ? tgt.dy : 360, easeInCubic)
  })
  const scale = useTransform(progress, (v) => {
    if (v <= xs) return mapRange(v, es, ee, 0.86, 1, easeOutBack)
    return mapRange(v, xs, xe, 1, 0.08, easeInCubic)
  })
  // Opacity: girişte 0→1; genie sırasında görünür kalır, yalnız SON %10'da söner (spec).
  const opacity = useTransform(progress, (v) => {
    if (v <= xs) return mapRange(v, es, ee, 0, 1)
    const fadeStart = xs + EXIT_DUR * 0.9
    if (v < fadeStart) return 1
    return mapRange(v, fadeStart, xe, 1, 0)
  })

  return (
    // Dış hücre TRANSFORM ALMAZ — genie hedef ölçümü bu hücreden yapılır.
    <div ref={setCell} className="w-52">
      <motion.div
        style={{ x, y, scale, opacity }}
        className="overflow-hidden rounded-xl border border-white/[0.1] bg-[#101014]/90 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.8)] will-change-transform"
      >
        {/* Mini titlebar — OS kromunun özeti */}
        <div className="flex h-7 items-center gap-1.5 border-b border-white/[0.06] bg-white/[0.04] px-2.5">
          <span aria-hidden className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
            <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
            <span className="h-2 w-2 rounded-full bg-[#28c840]" />
          </span>
          <span
            aria-hidden
            className="ml-1 flex h-4 w-4 items-center justify-center overflow-hidden rounded"
            style={logoUrl ? undefined : { background: `linear-gradient(150deg, ${product.color}, ${product.color}cc)` }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="size-full object-cover" />
            ) : (
              <HugeiconsIcon icon={product.icon} className="h-2.5 w-2.5 text-white" strokeWidth={2} />
            )}
          </span>
          <h3 className="truncate text-[11px] font-medium text-white/70">{title}</h3>
        </div>
        {/* Tek satır içerik — ağır mock yerine öz + mikro-loop nabız noktası */}
        <div className="flex items-center gap-2 px-2.5 py-2.5 [content-visibility:auto]">
          <span
            aria-hidden
            className="lv2-expose-dot h-1.5 w-1.5 shrink-0 rounded-full"
            style={{
              background: product.color,
              animation: "lv2-expose-pulse 2.4s ease-in-out infinite",
              animationPlayState: playing ? "running" : "paused",
            }}
          />
          <p className="truncate text-[11px] text-white/55">{line}</p>
        </div>
      </motion.div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ExposeStage — pinned sahnenin iç katmanı (tüm hook'lar burada; pin'e transform yok)
// ─────────────────────────────────────────────────────────────────────────────

function ExposeStage({ progress, t }: { progress: MotionValue<number>; t: TFn }) {
  const { light, unlight, sweep, setActiveProduct } = useLandingV2()
  // Dinamik i18n anahtarları (expose.cards.<id>.*) için gevşek imza.
  const tKey = t as unknown as (key: string) => string

  const cellRefs = useRef<(HTMLDivElement | null)[]>([])
  const osCellRef = useRef<HTMLDivElement | null>(null)
  const targetsRef = useRef<(GenieTarget | null)[]>([])
  const osTargetRef = useRef<GenieTarget | null>(null)
  const measuredRef = useRef(false)
  const firedRef = useRef(false) // 12. ikon lit durumu (çift yönlü eşik guard'ı)
  const sweptRef = useRef(false) // sweep dalgası yalnız İLK yanışta (tek seferlik)
  const statsFiredRef = useRef(false) // setState'i frame başına değil, eşikte bir kez
  const [statsArmed, setStatsArmed] = useState(false)

  const gridRef = useRef<HTMLDivElement>(null)
  // Mikro-loop nabızları yalnız sahne görünürken oynar.
  const gridInView = useInView(gridRef, { amount: 0.15 })

  // Genie hedef ölçümü: hücreler transform almadığından pin süresince her an geçerli.
  // Dock konumu yaklaşık: viewport alt-ortası + dockSlot ofseti (bkz. dosya başı notu).
  const measure = useCallback(() => {
    if (typeof window === "undefined") return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const dockY = vh - DOCK_BOTTOM_PX
    const slotX = (slot: number) =>
      vw / 2 + (slot - (LANDING_PRODUCTS.length - 1) / 2) * DOCK_SLOT_PX
    SNAPSHOT_PRODUCTS.forEach((p, i) => {
      const el = cellRefs.current[i]
      if (!el) return
      const r = el.getBoundingClientRect()
      targetsRef.current[i] = {
        dx: slotX(p.dockSlot) - (r.left + r.width / 2),
        dy: dockY - (r.top + r.height / 2),
      }
    })
    const osEl = osCellRef.current
    if (osEl) {
      const r = osEl.getBoundingClientRect()
      osTargetRef.current = {
        dx: slotX(OS_PRODUCT.dockSlot) - (r.left + r.width / 2),
        dy: dockY - (r.top + r.height / 2),
      }
    }
    measuredRef.current = true
  }, [])

  // Resize'da hedefler bayatlar — bir sonraki progress değişiminde yeniden ölçülür.
  useEffect(() => {
    const onResize = () => {
      measuredRef.current = false
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // Threshold-crossing guard'lı beat tetikleri — React state'e her frame YAZILMAZ.
  useMotionValueEvent(progress, "change", (v) => {
    // Genie başlamadan hemen önce ölç (sahne pin'liyken, kartlar yerleşikken).
    if (v >= 0.3 && !measuredRef.current) measure()
    // 12. ikon beat'i — ÇİFT YÖNLÜ: yukarı scroll'da ikon dock'tan geri çekilir.
    // Sweep dalgası yalnız İLK yanışta oynar (her geçişte kutlama yorucu olur).
    if (v >= LIGHT_AT && !firedRef.current) {
      firedRef.current = true
      light("os")
      setActiveProduct("os")
      if (!sweptRef.current) {
        sweptRef.current = true
        sweep()
      }
    } else if (v < LIGHT_AT && firedRef.current) {
      firedRef.current = false
      unlight("os")
    }
    // Punchline istatistikleri — BİR KEZ arm edilir.
    if (v >= STATS_AT && !statsFiredRef.current) {
      statsFiredRef.current = true
      setStatsArmed(true)
    }
  })

  // Başlık: erken girer, genie başlarken sahneyi punchline'a bırakır.
  const titleOpacity = useTransform(progress, [0.02, 0.1, 0.44, 0.56], [0, 1, 1, 0])
  const titleY = useTransform(progress, [0.02, 0.1], [24, 0])

  // 12. ikon: belir → düş → dock'a karış (son %10 opacity).
  const osOpacity = useTransform(progress, (v) => {
    if (v < OS_IN_START) return 0
    if (v < OS_IN_END) return mapRange(v, OS_IN_START, OS_IN_END, 0, 1, easeOutCubic)
    const fadeStart = OS_DROP_START + (OS_DROP_END - OS_DROP_START) * 0.9
    if (v < fadeStart) return 1
    return mapRange(v, fadeStart, OS_DROP_END, 1, 0)
  })
  const osScale = useTransform(progress, (v) => {
    if (v < OS_DROP_START) return mapRange(v, OS_IN_START, OS_IN_END, 0.5, 1, easeOutBack)
    return mapRange(v, OS_DROP_START, OS_DROP_END, 1, 0.22, easeInCubic)
  })
  const osX = useTransform(progress, (v) => {
    if (v <= OS_DROP_START) return 0
    const tgt = osTargetRef.current
    return mapRange(v, OS_DROP_START, OS_DROP_END, 0, tgt ? tgt.dx : 0, easeInOutCubic)
  })
  const osY = useTransform(progress, (v) => {
    if (v < OS_DROP_START) return mapRange(v, OS_IN_START, OS_IN_END, -24, 0, easeOutCubic)
    const tgt = osTargetRef.current
    return mapRange(v, OS_DROP_START, OS_DROP_END, 0, tgt ? tgt.dy : 320, easeInCubic)
  })

  // Punchline + stat'lar: boş masaüstünde nefes.
  // Punchline erken girer ve pin sonuna dek TAM OPAK bekler — eskiden [0.8,0.9]
  // + 250vh pin'de yalnız ~15vh görünür kalıyordu; kullanıcı "metin okunmadan
  // yukarıda kaldı" diye raporladı. 330vh pin + [0.74,0.82] ≈ 41vh net bekleme.
  const punchOpacity = useTransform(progress, [0.74, 0.82], [0, 1])
  const punchY = useTransform(progress, [0.74, 0.82], [28, 0])

  return (
    <div className="relative flex h-full flex-col items-center justify-center px-6">
      <style>{PULSE_CSS}</style>

      <motion.h2
        style={{ opacity: titleOpacity, y: titleY }}
        className="mb-10 text-center text-3xl font-semibold tracking-tight text-white sm:text-5xl"
      >
        {t("expose.title")}
      </motion.h2>

      {/* Exposé grid — 11 snapshot kartı, dock sırasıyla */}
      <div ref={gridRef} className="flex w-full max-w-[1040px] flex-wrap justify-center gap-4">
        {SNAPSHOT_PRODUCTS.map((p, i) => (
          <SnapshotCard
            key={p.id}
            product={p}
            index={i}
            progress={progress}
            targetsRef={targetsRef}
            setCell={(el) => {
              cellRefs.current[i] = el
            }}
            title={tKey(`expose.cards.${p.id}.title`)}
            line={tKey(`expose.cards.${p.id}.line`)}
            playing={gridInView}
          />
        ))}
      </div>

      {/* 12. ikon — dekoratif (dock'taki gerçek durumu light("os") taşır) */}
      <div ref={osCellRef} aria-hidden className="absolute left-1/2 top-[36%] -translate-x-1/2">
        <motion.div
          style={{ x: osX, y: osY, scale: osScale, opacity: osOpacity }}
          className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.16] bg-gradient-to-b from-white/[0.14] to-white/[0.04] shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] will-change-transform"
        >
          <HugeiconsIcon icon={OS_PRODUCT.icon} className="h-7 w-7 text-white" strokeWidth={1.8} />
        </motion.div>
      </div>

      {/* Punchline — görsel sessizlik anı */}
      <motion.div
        style={{ opacity: punchOpacity, y: punchY }}
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-10 px-6 text-center"
      >
        <p className="text-2xl font-semibold tracking-tight text-white sm:text-4xl">
          {t("expose.punchline")}
        </p>
        <StatsRow start={statsArmed} t={t} />
      </motion.div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Poster — SSR default + mobil/reduced-motion hali. Kompakt "hepsi tek oturumda"
// kartı: 11 ürün çipi + punchline + 3 stat (CountUp useInView'da sayar).
// ─────────────────────────────────────────────────────────────────────────────

function ExposePoster({ t }: { t: TFn }) {
  const { light } = useLandingV2()
  const tKey = t as unknown as (key: string) => string
  const rootRef = useRef<HTMLElement>(null)
  const seen = useInView(rootRef, { once: true, amount: 0.35 })
  const alive = useInView(rootRef, { amount: 0.2 }) // nabız noktası görünürken oynar

  // Poster'da da koleksiyon tamamlanır (dock/lit state tutarlılığı); sweep dalgası
  // mobil statik ikon şeridinde anlamsız olduğundan tetiklenmez.
  useEffect(() => {
    if (seen) light("os")
  }, [seen, light])

  return (
    <section ref={rootRef} id="one-session" className="relative px-6 py-20 sm:py-28">
      <style>{PULSE_CSS}</style>
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-10% 0px" }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="mx-auto max-w-3xl"
      >
        <GlassPanel className="p-7 sm:p-10">
          <h2 className="flex items-center justify-center gap-2.5 text-center text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            <span
              aria-hidden
              className="lv2-expose-dot h-2 w-2 rounded-full bg-emerald-400"
              style={{
                animation: "lv2-expose-pulse 2.4s ease-in-out infinite",
                animationPlayState: alive ? "running" : "paused",
              }}
            />
            {t("expose.title")}
          </h2>

          {/* 11 ürün çipi — dock sırasıyla, marka renkli mini ikon */}
          <ul className="mt-7 flex flex-wrap justify-center gap-2">
            {SNAPSHOT_PRODUCTS.map((p) => {
              const logoUrl = productLogoUrl(p.id)
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5"
                >
                  <span
                    aria-hidden
                    className="flex h-4 w-4 items-center justify-center overflow-hidden rounded"
                    style={logoUrl ? undefined : { background: `linear-gradient(150deg, ${p.color}, ${p.color}cc)` }}
                  >
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <HugeiconsIcon icon={p.icon} className="h-2.5 w-2.5 text-white" strokeWidth={2} />
                    )}
                  </span>
                  <span className="text-xs text-white/70">{tKey(`expose.cards.${p.id}.title`)}</span>
                </li>
              )
            })}
          </ul>

          <p className="mt-9 text-center text-xl font-semibold tracking-tight text-white sm:text-2xl">
            {t("expose.punchline")}
          </p>

          <PosterStats t={t} />
        </GlassPanel>
      </motion.div>
    </section>
  )
}

function PosterStats({ t }: { t: TFn }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  return (
    <div ref={ref} className="mt-8">
      <StatsRow start={inView} t={t} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Dışa açılan bileşen — motion gate: full ise 250vh pinned sahne, değilse poster.
// SSR'da full daima false → poster SSR default'u (hydration güvenli).
// ─────────────────────────────────────────────────────────────────────────────

export function ExposeFinale() {
  const t = useTranslations("landingV2")
  const { full } = useMotionSafe()

  if (!full) return <ExposePoster t={t} />

  return (
    <ScrollScene heightVh={330} id="one-session" className="relative">
      {(progress) => <ExposeStage progress={progress} t={t} />}
    </ScrollScene>
  )
}
