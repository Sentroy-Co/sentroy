"use client"

// Sahne 2 — Operate (İşlet): horizontal-rail.
//
// 350vh pin boyunca 4 WindowScene (status / meet / whatsapp / linear) tek bir
// translateX scrub'lu ray üzerinde yan yana akar (Mission Control estetiği).
// Merkezdeki pencere scale 1 + parlak; komşular scale 0.9 + opacity 0.55
// (jüri kuralı: blur YOK). Merkeze giren pencere mikro-beat'ini BİR KEZ oynatır;
// beat CSS keyframe'dir (lv2-op- prefix), görünürlük dışında paused,
// prefers-reduced-motion'da tamamen kapalı (son kare gösterilir).
//
// Pin kuralı: ScrollScene'in sticky container'ına transform uygulanmaz —
// tüm koreografi iç katman (ray track + pencere wrapper) üzerindedir.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import {
  motion,
  useInView,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "framer-motion"
import { useTranslations } from "next-intl"
import { cn } from "@workspace/ui/lib/utils"
import { ScrollScene } from "../primitives/scroll-scene"
import { WindowScene } from "../primitives/window-scene"
import { useMotionSafe } from "../primitives/use-motion-safe"
import { productsByTier, type LandingProduct } from "../data/products"
import { useLandingV2 } from "../landing-context"

// Ray geometrisi: pencere 56vw + 8vw boşluk = 64vw adım. İlk pencerenin merkezi
// viewport merkezine otursun diye track left: 22vw (22 + 56/2 = 50).
const WINDOW_VW = 56
const GAP_VW = 8
const STEP_VW = WINDOW_VW + GAP_VW
// Progress'in iki ucunda ölü bölge: ilk/son pencere bir an merkezde "tutunur".
const RAIL_START = 0.06
const RAIL_END = 0.94

export function SceneOperate() {
  const { full } = useMotionSafe()

  // full=false (SSR / mobil / reduced-motion) → pin'siz poster. Hydration güvenli:
  // SSR'da full daima false olduğundan ilk render iki tarafta da poster'dır.
  if (!full) return <OperatePoster />

  return (
    <ScrollScene heightVh={350} id="lv2-operate">
      {(progress) => <OperateRail progress={progress} />}
    </ScrollScene>
  )
}

/* ------------------------------------------------------------------ */
/* Tam koreografi — pinned horizontal rail                             */
/* ------------------------------------------------------------------ */

function OperateRail({ progress }: { progress: MotionValue<number> }) {
  const t = useTranslations("landingV2")
  const { light, unlight, setActiveProduct } = useLandingV2()
  const litRef = useRef(new Set<string>())
  const products = useMemo(() => productsByTier("operate"), [])
  const count = products.length

  const wrapRef = useRef<HTMLDivElement>(null)
  // Sahne görünür değilken tüm micro-loop'lar paused (CSS class ile).
  const inView = useInView(wrapRef, { amount: 0.25 })

  const [activeIdx, setActiveIdx] = useState(0)
  const idxRef = useRef(0)
  // Beat'ler pencere başına BİR KEZ oynar — bir kez true olan bir daha sönmez.
  const [played, setPlayed] = useState<boolean[]>(() =>
    products.map(() => false)
  )

  // Eşik-geçiş guard'ı: React state'e her frame DEĞİL, yalnız merkez pencere
  // değiştiğinde yazılır. Dock koleksiyonu ÇİFT YÖNLÜ: her pencerenin merkez
  // eşiği progress'in saf fonksiyonu — yukarı scroll'da eşiğin altına inen
  // ikon yeniden söner.
  useMotionValueEvent(progress, "change", (v) => {
    const clamped = Math.min(Math.max(v, RAIL_START), RAIL_END)
    const idx = Math.round(
      ((clamped - RAIL_START) / (RAIL_END - RAIL_START)) * (count - 1)
    )
    if (idx !== idxRef.current) {
      idxRef.current = idx
      setActiveIdx(idx)
    }
    const span = (RAIL_END - RAIL_START) / (count - 1)
    for (let i = 0; i < count; i++) {
      const p = products[i]
      if (!p) continue
      // İlk pencere sahne başlar başlamaz yanar; diğerleri merkeze yaklaşınca.
      const threshold = i === 0 ? 0.02 : RAIL_START + i * span - span * 0.25
      const on = v >= threshold
      if (on && !litRef.current.has(p.id)) {
        litRef.current.add(p.id)
        light(p.id)
      } else if (!on && litRef.current.has(p.id)) {
        litRef.current.delete(p.id)
        unlight(p.id)
      }
    }
  })

  // Merkeze giren pencere: beat'i tetikle + scroll-spy odağı (beat tek yönlü).
  useEffect(() => {
    if (!inView) return
    const p = products[activeIdx]
    if (!p) return
    setActiveProduct(p.id)
    setPlayed((prev) =>
      prev[activeIdx] ? prev : prev.map((v, i) => (i === activeIdx ? true : v))
    )
  }, [activeIdx, inView, products, setActiveProduct])

  // Tek scrub: ray düzleminin translateX'i (transform-only, GPU).
  const railX = useTransform(
    progress,
    [RAIL_START, RAIL_END],
    ["0vw", `-${(count - 1) * STEP_VW}vw`],
    { clamp: true }
  )

  const activeProduct = products[activeIdx] ?? products[0]!
  const activeName = t(`operate.windows.${activeProduct.id}.name`)

  return (
    <div
      ref={wrapRef}
      className={cn(
        "lv2-op-root relative flex h-full flex-col",
        !inView && "lv2-op-paused"
      )}
    >
      <OperateStyles />

      {/* Başlık bloğu — sahne boyunca sabit. */}
      <div className="px-6 pt-[9vh] text-center">
        <p className="text-xs font-medium tracking-[0.22em] text-white/60 uppercase">
          {t("operate.eyebrow")}
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
          {t("operate.title")}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm text-white/55 sm:text-base">
          {t("operate.subtitle")}
        </p>
      </div>

      {/* Ray — tek translateX edilen düzlem. Dikey ortalama framer y ile (Tailwind
          translate class'ı framer'ın inline transform'uyla çakışır). */}
      <div className="relative flex-1">
        <motion.div
          style={{
            x: railX,
            y: "-50%",
            top: "50%",
            left: `${(100 - WINDOW_VW) / 2}vw`,
          }}
          className="absolute flex h-[50vh] max-h-[520px] min-h-[340px] items-stretch will-change-transform"
        >
          {products.map((p, i) => (
            <RailWindow
              key={p.id}
              product={p}
              index={i}
              count={count}
              progress={progress}
              active={activeIdx === i}
            >
              <OperateMock id={p.id} play={played[i] ?? false} />
            </RailWindow>
          ))}
        </motion.div>
      </div>

      {/* Alt kenar: 4 nokta progress (dekoratif) + aria-live bölüm adı. */}
      <div className="flex flex-col items-center gap-3 pb-[6vh]">
        <div aria-hidden className="flex items-center gap-2.5">
          {products.map((p, i) => (
            <span
              key={p.id}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                activeIdx === i ? "w-6" : "w-1.5 bg-white/25"
              )}
              style={activeIdx === i ? { backgroundColor: p.color } : undefined}
            />
          ))}
        </div>
        <p aria-live="polite" className="text-xs text-white/50">
          {t("operate.live", { name: activeName })}
        </p>
      </div>
    </div>
  )
}

// Ray üzerindeki tek pencere: kendi merkezine göre scale 0.9→1→0.9 ve
// opacity 0.55→1→0.55 scrub'ı (yalnız transform + opacity).
function RailWindow({
  product,
  index,
  count,
  progress,
  active,
  children,
}: {
  product: LandingProduct
  index: number
  count: number
  progress: MotionValue<number>
  active: boolean
  children: ReactNode
}) {
  const t = useTranslations("landingV2")
  const span = (RAIL_END - RAIL_START) / (count - 1)
  const center = RAIL_START + span * index
  const focus = useTransform(progress, (v) => {
    const distance = Math.min(1, Math.abs(v - center) / span)
    return 1 - distance
  })
  const scale = useTransform(focus, (v) => 0.9 + v * 0.1)
  const opacity = useTransform(focus, (v) => 0.55 + v * 0.45)

  return (
    <motion.div
      style={{
        scale,
        opacity,
        marginRight: index === count - 1 ? 0 : `${GAP_VW}vw`,
      }}
      className="h-full shrink-0"
    >
      <WindowScene
        product={product}
        title={t(`operate.windows.${product.id}.title`)}
        dimmed={!active}
        className="h-full"
        style={{ width: `${WINDOW_VW}vw` }}
      >
        {children}
      </WindowScene>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Poster — mobil / reduced-motion / SSR default                       */
/* ------------------------------------------------------------------ */

function OperatePoster() {
  const t = useTranslations("landingV2")
  const products = useMemo(() => productsByTier("operate"), [])

  return (
    <section
      id="lv2-operate"
      className="lv2-op-root relative px-5 py-20 sm:px-8"
    >
      <OperateStyles />
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-medium tracking-[0.22em] text-white/60 uppercase">
          {t("operate.eyebrow")}
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          {t("operate.title")}
        </h2>
        <p className="mt-4 max-w-xl text-sm text-white/55 sm:text-base">
          {t("operate.subtitle")}
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {products.map((p) => (
            <PosterCard key={p.id} product={p} />
          ))}
        </div>
      </div>
    </section>
  )
}

// Kompakt poster kartı: aynı WindowScene kromu + aynı mock. Görünüre girince
// beat bir kez oynar ve dock ikonu yanar; görünür değilken loop'lar paused.
function PosterCard({ product }: { product: LandingProduct }) {
  const t = useTranslations("landingV2")
  const { light } = useLandingV2()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { amount: 0.35 })
  const [played, setPlayed] = useState(false)

  useEffect(() => {
    if (inView && !played) {
      setPlayed(true)
      light(product.id)
    }
  }, [inView, played, light, product.id])

  return (
    <div ref={ref} className={cn(!inView && "lv2-op-paused")}>
      <WindowScene
        product={product}
        title={t(`operate.windows.${product.id}.title`)}
        className="h-[300px]"
      >
        <OperateMock id={product.id} play={played} />
      </WindowScene>
      <p className="mt-3 text-sm text-white/55">
        {t(`operate.windows.${product.id}.desc`)}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Mock'lar — saf sunumsal DOM, beat'ler CSS keyframe                  */
/* ------------------------------------------------------------------ */

function OperateMock({ id, play }: { id: string; play: boolean }) {
  switch (id) {
    case "status":
      return <StatusMock play={play} />
    case "meet":
      return <MeetMock play={play} />
    case "whatsapp":
      return <WhatsappMock play={play} />
    case "linear":
      return <LinearMock play={play} />
    default:
      return null
  }
}

// Ortak yardımcı: keyframe animasyonu play=false iken 0. karede paused bekler,
// play=true olunca akar. (İlk kare = "from" durumu → beat başlamadan gizli hal.)
function beat(
  name: string,
  dur: string,
  delay: string,
  play: boolean
): CSSProperties {
  return {
    animation: `${name} ${dur} cubic-bezier(0.22, 1, 0.36, 1) ${delay} both`,
    animationPlayState: play ? "running" : "paused",
  }
}

/* --- Status: uptime barları soldan dolar + yeşil operational nabzı --- */

const STATUS_ROWS = [
  { key: "mail", uptime: "99.98%" },
  { key: "storage", uptime: "99.99%" },
  { key: "cdn", uptime: "100%" },
  { key: "db", uptime: "99.95%" },
] as const

function StatusMock({ play }: { play: boolean }) {
  const t = useTranslations("landingV2")
  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="relative flex h-2.5 w-2.5">
            <span className="absolute inset-0 rounded-full bg-emerald-400" />
            {/* Sonsuz nabız halkası — reduced-motion'da class'taki opacity-0 kalır. */}
            <span
              className="absolute inset-0 rounded-full bg-emerald-400 opacity-0"
              style={{
                animation: "lv2-op-pulse 2s ease-out infinite",
                animationPlayState: play ? "running" : "paused",
              }}
            />
          </span>
          <span className="text-sm font-medium text-emerald-300">
            {t("operate.windows.status.operational")}
          </span>
        </div>
        <span className="text-[10px] tracking-wide text-white/55 uppercase">
          {t("operate.windows.status.uptime")}
        </span>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-3.5">
        {STATUS_ROWS.map((row, r) => (
          <div key={row.key}>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-xs text-white/70">
                {t(`operate.windows.status.services.${row.key}`)}
              </span>
              <span className="text-[10px] text-white/60 tabular-nums">
                {row.uptime}
              </span>
            </div>
            {/* Bar şeridi: soldan sağa artan delay ile "dolma" hissi. */}
            <div aria-hidden className="flex gap-[3px]">
              {Array.from({ length: 22 }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-4 flex-1 origin-bottom rounded-[2px]",
                    (r === 1 && i === 8) || (r === 3 && i === 15)
                      ? "bg-amber-400/70"
                      : "bg-emerald-400/75"
                  )}
                  style={beat(
                    "lv2-op-bar",
                    "0.45s",
                    `${r * 0.12 + i * 0.02}s`,
                    play
                  )}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* --- Meet: 4 avatar stagger pop + konuşan kişinin halkası --- */

const MEET_TILES = [
  { init: "AY", grad: "from-sky-600/50 to-indigo-700/40", speaking: true },
  { init: "MK", grad: "from-fuchsia-600/40 to-purple-700/40", speaking: false },
  { init: "ZD", grad: "from-emerald-600/40 to-teal-700/40", speaking: false },
  { init: "EC", grad: "from-amber-600/40 to-orange-700/40", speaking: false },
] as const

function MeetMock({ play }: { play: boolean }) {
  const t = useTranslations("landingV2")
  return (
    <div className="flex h-full flex-col p-4">
      <div className="grid flex-1 grid-cols-2 gap-2.5">
        {MEET_TILES.map((tile, i) => (
          <div
            key={tile.init}
            className={cn(
              "relative flex items-center justify-center rounded-xl bg-gradient-to-br",
              tile.grad
            )}
            style={beat("lv2-op-pop", "0.5s", `${0.1 + i * 0.12}s`, play)}
          >
            <span
              aria-hidden
              className="text-lg font-semibold tracking-wide text-white/85"
            >
              {tile.init}
            </span>
            {tile.speaking ? (
              <>
                {/* Konuşma halkası: sonsuz opacity blink (transform/opacity-only). */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-sky-400/90"
                  style={{
                    animation: "lv2-op-ring 1.6s ease-in-out 0.7s infinite",
                    animationPlayState: play ? "running" : "paused",
                  }}
                />
                <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] font-medium text-sky-200">
                  {t("operate.windows.meet.speaking")}
                </span>
              </>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between px-1">
        <span className="text-xs text-white/65">
          {t("operate.windows.meet.room")}
        </span>
        <span className="text-[10px] text-white/60 tabular-nums">24:10</span>
      </div>
    </div>
  )
}

/* --- WhatsApp: 2 mesaj balonu sıralı + ✓✓ tik --- */

function WhatsappMock({ play }: { play: boolean }) {
  const t = useTranslations("landingV2")
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b border-white/[0.06] bg-white/[0.03] px-4 py-2.5">
        <span
          aria-hidden
          className="flex h-7 w-7 items-center justify-center rounded-full bg-[#25d366]/25 text-[10px] font-semibold text-[#25d366]"
        >
          S
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-white/80">
            {t("operate.windows.whatsapp.contact")}
          </p>
          <p className="text-[10px] text-[#25d366]">
            {t("operate.windows.whatsapp.online")}
          </p>
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-end gap-2 p-4">
        <div
          className="max-w-[78%] self-start rounded-xl rounded-bl-sm bg-white/[0.08] px-3 py-2"
          style={beat("lv2-op-bubble", "0.45s", "0.15s", play)}
        >
          <p className="text-xs text-white/85">
            {t("operate.windows.whatsapp.msg1")}
          </p>
          <p className="mt-1 text-right text-[9px] text-white/55">09:41</p>
        </div>
        <div
          className="max-w-[78%] self-end rounded-xl rounded-br-sm bg-[#0d5c46]/80 px-3 py-2"
          style={beat("lv2-op-bubble", "0.45s", "0.85s", play)}
        >
          <p className="text-xs text-white/90">
            {t("operate.windows.whatsapp.msg2")}
          </p>
          <p className="mt-1 flex items-center justify-end gap-1 text-[9px] text-white/60">
            09:42
            <span
              aria-hidden
              className="text-[10px] leading-none text-[#53bdeb]"
              style={beat("lv2-op-tick", "0.3s", "1.5s", play)}
            >
              ✓✓
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}

/* --- Linear: issue kartı In Progress'ten Done'a springvari taşınır --- */

function LinearMock({ play }: { play: boolean }) {
  const t = useTranslations("landingV2")
  return (
    <div className="flex h-full flex-col p-4">
      <div className="grid flex-1 grid-cols-2 gap-3">
        {/* In Progress kolonu */}
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-white/60 uppercase">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-amber-400"
            />
            {t("operate.windows.linear.inProgress")}
          </p>
          <div className="mt-2 space-y-2">
            {/* Taşınan kart: translateX(kolon genişliği + gap), overshoot'lu bezier. */}
            <div
              className="relative z-10 rounded-lg border border-white/[0.09] bg-white/[0.06] p-2.5 shadow-lg"
              style={{
                animation:
                  "lv2-op-issue 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.35s both",
                animationPlayState: play ? "running" : "paused",
              }}
            >
              <p className="font-mono text-[9px] text-white/55">SEN-142</p>
              <p className="mt-0.5 truncate text-xs text-white/85">
                {t("operate.windows.linear.issueMoving")}
              </p>
              {/* Rozet çaprazlaması: amber "In Progress" söner, yeşil "Done" yanar. */}
              <span className="mt-1.5 inline-grid">
                <span
                  className="col-start-1 row-start-1 flex items-center gap-1 text-[9px] text-amber-300"
                  style={beat("lv2-op-swap-out", "0.25s", "0.9s", play)}
                >
                  <span
                    aria-hidden
                    className="h-1 w-1 rounded-full bg-amber-400"
                  />
                  {t("operate.windows.linear.inProgress")}
                </span>
                <span
                  className="col-start-1 row-start-1 flex items-center gap-1 text-[9px] text-emerald-300 opacity-0"
                  style={beat("lv2-op-tick", "0.25s", "0.95s", play)}
                >
                  <span aria-hidden>✓</span>
                  {t("operate.windows.linear.done")}
                </span>
              </span>
            </div>
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.04] p-2.5">
              <p className="font-mono text-[9px] text-white/55">SEN-138</p>
              <p className="mt-0.5 truncate text-xs text-white/70">
                {t("operate.windows.linear.issueSecond")}
              </p>
            </div>
          </div>
        </div>
        {/* Done kolonu */}
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-white/60 uppercase">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-emerald-400"
            />
            {t("operate.windows.linear.done")}
          </p>
          <div className="mt-2 space-y-2">
            {/* Hedef slot: taşınan kartın ineceği boş yuva. */}
            <div
              aria-hidden
              className="h-[68px] rounded-lg border border-dashed border-white/[0.07]"
            />
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.04] p-2.5">
              <p className="font-mono text-[9px] text-white/55">SEN-131</p>
              <p className="mt-0.5 truncate text-xs text-white/70">
                {t("operate.windows.linear.issueDone")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Keyframe'ler — lv2-op- prefix, bileşene gömülü (globals'a sızmaz)    */
/* ------------------------------------------------------------------ */

function OperateStyles() {
  return (
    <style>{`
      @keyframes lv2-op-bar { from { transform: scaleY(0.15); opacity: 0; } to { transform: scaleY(1); opacity: 1; } }
      @keyframes lv2-op-pulse { 0% { transform: scale(1); opacity: 0.55; } 70% { transform: scale(2.4); opacity: 0; } 100% { transform: scale(2.4); opacity: 0; } }
      @keyframes lv2-op-pop { 0% { transform: scale(0.4); opacity: 0; } 70% { transform: scale(1.07); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
      @keyframes lv2-op-ring { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }
      @keyframes lv2-op-bubble { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      @keyframes lv2-op-tick { from { opacity: 0; } to { opacity: 1; } }
      @keyframes lv2-op-issue { from { transform: translateX(0); } to { transform: translateX(calc(100% + 0.75rem)); } }
      @keyframes lv2-op-swap-out { from { opacity: 1; } to { opacity: 0; } }
      /* Görünürlük dışında tüm micro-loop'lar durur (useInView class toggle). */
      .lv2-op-paused * { animation-play-state: paused !important; }
      /* Reduced-motion: animasyon tamamen kapanır; elemanların doğal (class)
         halleri son kareyi temsil eder — barlar dolu, balonlar görünür. */
      @media (prefers-reduced-motion: reduce) {
        .lv2-op-root * { animation: none !important; }
      }
    `}</style>
  )
}
