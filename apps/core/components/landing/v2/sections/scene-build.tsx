"use client"

// SceneBuild — Sahne 1 "Build": 4 temel ürün (mail → storage → auth → vault),
// 400vh pin boyunca sticky-stack pencereler olarak yaşar. Segment şablonu (her %25):
//   [0-30%]   pencere spring hissiyle açılır (opacity 0→1, scale 0.97→1)
//   [30-80%]  pencere içi 2-3 beat scrub edilir (YALNIZ transform + opacity)
//   [80-100%] pencere sola park eder (x → -%34..-%42 + scale 0.86) — parlaklık
//             düşüşü filter scrub'ı DEĞİL, WindowScene `dimmed` prop'u (state) ile.
// Sağda sticky CopyRail: aktif segmentin başlığı + 3 madde + docs linki crossfade.
// Segment geçişinde setActiveProduct, beat tamamlanınca light() → dock koleksiyonu.
// full=false (SSR / mobil / reduced-motion) → poster: 4 kompakt GlassPanel kart.

import { useEffect, useRef, useState } from "react"
import {
  motion,
  useInView,
  useMotionValueEvent,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  File01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"
import { ScrollScene } from "../primitives/scroll-scene"
import { GlassPanel } from "../primitives/glass-panel"
import { WindowScene } from "../primitives/window-scene"
import { useMotionSafe } from "../primitives/use-motion-safe"
import { productsByTier, productLogoUrl, type LandingProduct } from "../data/products"
import { useLandingV2 } from "../landing-context"

// Sahne ürünleri — sıra products.ts'teki dockSlot'tan gelir (mail→storage→auth→vault).
const BUILD_PRODUCTS = productsByTier("build")
// Her ürün toplam progress'in eşit dilimini alır (4 ürün → 0.25).
const SEG = 1 / BUILD_PRODUCTS.length

// Park pozları: pencereler sahneden çekilirken kademeli "çalışan masaüstü"
// natürmortu için index'e göre hafif farklı ofsetler. Son pencere park etmez.
const PARKED: { x: string; y: number }[] = [
  { x: "-42%", y: -30 },
  { x: "-38%", y: 0 },
  { x: "-34%", y: 30 },
]

// Micro-loop keyframe'leri — bileşene gömülü, lv2-build önekli (global sızıntı yok).
// Kök element .lv2-build-paused sınıfını alınca loop'lar durur (offscreen);
// prefers-reduced-motion'da tamamen kapalı.
const LOOP_CSS = `
@keyframes lv2-build-pulse { 0%, 100% { transform: scale(1); opacity: 0.9; } 50% { transform: scale(1.4); opacity: 0.4; } }
@keyframes lv2-build-caret { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
.lv2-build-paused .lv2-build-anim { animation-play-state: paused !important; }
@media (prefers-reduced-motion: reduce) { .lv2-build-anim { animation: none !important; } }
`

export function SceneBuild() {
  const { full } = useMotionSafe()
  // SSR + mobil + reduced-motion → poster (hydration güvenli varsayılan).
  if (!full) return <BuildPoster />
  return (
    <ScrollScene heightVh={400} id="lv2-build">
      {(progress) => <BuildStage progress={progress} />}
    </ScrollScene>
  )
}

/* ---------------------------------- FULL ---------------------------------- */

function BuildStage({ progress }: { progress: MotionValue<number> }) {
  const t = useTranslations("landingV2")
  const { light, unlight, setActiveProduct } = useLandingV2()
  const [activeIndex, setActiveIndex] = useState(0)
  // Threshold-crossing guard'ları — React state'e her frame DEĞİL, yalnız eşik
  // aşımında yazılır. activeRef -1 başlar ki ilk change event'i mail'i aktive etsin.
  const activeRef = useRef(-1)
  const litRef = useRef(new Set<string>())
  const rootRef = useRef<HTMLDivElement>(null)
  // Sahne görünür değilken micro-loop'lar durur.
  const inView = useInView(rootRef, { amount: 0.1 })

  useMotionValueEvent(progress, "change", (v) => {
    const idx = Math.min(BUILD_PRODUCTS.length - 1, Math.max(0, Math.floor(v / SEG)))
    const current = BUILD_PRODUCTS[idx]
    if (current && idx !== activeRef.current) {
      activeRef.current = idx
      setActiveIndex(idx)
      setActiveProduct(current.id)
    }
    // Dock koleksiyonu ÇİFT YÖNLÜ: beat eşiği (segmentin %80'i) progress'in saf
    // fonksiyonu — yukarı scroll'da eşiğin altına inen ikon yeniden söner.
    for (let i = 0; i < BUILD_PRODUCTS.length; i++) {
      const p = BUILD_PRODUCTS[i]
      if (!p) continue
      const on = v >= i * SEG + SEG * 0.8
      if (on && !litRef.current.has(p.id)) {
        litRef.current.add(p.id)
        light(p.id)
      } else if (!on && litRef.current.has(p.id)) {
        litRef.current.delete(p.id)
        unlight(p.id)
      }
    }
  })

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative flex h-full w-full flex-col px-6 pb-8 pt-24 lg:px-12",
        !inView && "lv2-build-paused",
      )}
    >
      <style>{LOOP_CSS}</style>

      {/* Sahne başlığı — erişilebilir ad. */}
      <div className="shrink-0">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/60">
          {t("build.kicker")}
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white lg:text-4xl">
          {t("build.heading")}
        </h2>
      </div>

      <div className="relative mt-6 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(280px,360px)] gap-10">
        {/* Pencere sahnesi — pin container'a değil İÇ katmanlara transform (kural 3). */}
        <div className="relative h-full">
          {BUILD_PRODUCTS.map((product, i) => (
            <BuildWindow
              key={product.id}
              product={product}
              index={i}
              progress={progress}
              dimmed={activeIndex !== i}
            />
          ))}
        </div>
        <CopyRail activeIndex={activeIndex} />
      </div>
    </div>
  )
}

function BuildWindow({
  product,
  index,
  progress,
  dimmed,
}: {
  product: LandingProduct
  index: number
  progress: MotionValue<number>
  dimmed: boolean
}) {
  const t = useTranslations("landingV2")
  const start = index * SEG
  const isLast = index === BUILD_PRODUCTS.length - 1
  const parked = PARKED[index] ?? { x: "0%", y: 0 }

  // Giriş: opacity 0→1 + scale 0.97→1; useSpring scrub üstüne bindirilir —
  // window-frame.tsx'in 380'lik spring hissi, geri sarımda da doğal.
  const opacityRaw = useTransform(progress, [start, start + SEG * 0.22], [0, 1])
  const opacity = useSpring(opacityRaw, { stiffness: 380, damping: 34 })

  const scaleRaw = useTransform(
    progress,
    isLast
      ? [start, start + SEG * 0.3]
      : [start, start + SEG * 0.3, start + SEG * 0.8, start + SEG],
    isLast ? [0.97, 1] : [0.97, 1, 1, 0.86],
  )
  const scale = useSpring(scaleRaw, { stiffness: 380, damping: 34 })

  // Park: segmentin son %20'sinde sola çekilme. x yüzde string olduğundan
  // spring'lenmez (useSpring sayısal ister) — düz scrub yeterince yumuşak.
  const x = useTransform(
    progress,
    isLast ? [0, 1] : [start + SEG * 0.8, start + SEG],
    isLast ? ["0%", "0%"] : ["0%", parked.x],
  )
  const yRaw = useTransform(
    progress,
    isLast ? [0, 1] : [start + SEG * 0.8, start + SEG],
    isLast ? [0, 0] : [0, parked.y],
  )
  const y = useSpring(yRaw, { stiffness: 380, damping: 34 })

  // Pencere içi beat scrub'ı: segmentin %30-%80 aralığı → lokal 0-1.
  const beat = useTransform(progress, [start + SEG * 0.3, start + SEG * 0.8], [0, 1])

  return (
    <motion.div
      style={{ opacity, scale, x, y, zIndex: 10 + index }}
      className="absolute inset-0 m-auto h-[min(58vh,520px)] w-[min(52vw,720px)] will-change-transform"
    >
      {/* Marka rengiyle zemin ışıması — pencerenin opacity'sini miras alır. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-16 -z-10 rounded-[48px]"
        style={{ background: `radial-gradient(closest-side, ${product.color}22, transparent)` }}
      />
      <WindowScene
        product={product}
        title={t(`build.${product.id}.window`)}
        dimmed={dimmed}
        className="h-full w-full"
      >
        {product.id === "mail" && <MailMock beat={beat} />}
        {product.id === "storage" && <StorageMock beat={beat} />}
        {product.id === "auth" && <AuthMock beat={beat} />}
        {product.id === "vault" && <VaultMock beat={beat} />}
      </WindowScene>
    </motion.div>
  )
}

/* ------------------------------- COPY RAIL -------------------------------- */

function CopyRail({ activeIndex }: { activeIndex: number }) {
  const t = useTranslations("landingV2")
  return (
    <div className="relative self-center" aria-live="polite">
      {/* Sabit yükseklik rezervi — TR metinler ~%20 uzun (i18n çakışma riski). */}
      <div className="relative min-h-[300px]">
        {BUILD_PRODUCTS.map((product, i) => {
          const active = i === activeIndex
          const logoUrl = productLogoUrl(product.id)
          return (
            <motion.div
              key={product.id}
              initial={false}
              animate={{ opacity: active ? 1 : 0, y: active ? 0 : 16 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              aria-hidden={!active}
              className={cn("absolute inset-x-0 top-0", !active && "pointer-events-none")}
            >
              <span
                className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg"
                style={logoUrl ? undefined : { background: `linear-gradient(150deg, ${product.color}, ${product.color}b3)` }}
                aria-hidden
              >
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="size-full object-cover" />
                ) : (
                  <HugeiconsIcon icon={product.icon} className="h-4 w-4 text-white" strokeWidth={2} />
                )}
              </span>
              <h3 className="mt-4 text-xl font-semibold tracking-tight text-white">
                {t(`build.${product.id}.rail`)}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {(["p1", "p2", "p3"] as const).map((k) => (
                  <li key={k} className="flex items-start gap-2.5 text-sm text-white/60">
                    <span className="mt-0.5 shrink-0" style={{ color: product.color }} aria-hidden>
                      <HugeiconsIcon icon={Tick02Icon} className="h-4 w-4" strokeWidth={2.5} />
                    </span>
                    <span>{t(`build.${product.id}.${k}`)}</span>
                  </li>
                ))}
              </ul>
              <a
                href="/docs"
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-white/80 transition-colors hover:text-white"
              >
                {t("build.docsCta")}
                <span aria-hidden>
                  <HugeiconsIcon icon={ArrowRight01Icon} className="h-4 w-4" strokeWidth={2} />
                </span>
              </a>
            </motion.div>
          )
        })}
      </div>
      {/* Segment göstergesi — dekoratif ilerleme çizgileri. */}
      <div className="mt-8 flex gap-2" aria-hidden>
        {BUILD_PRODUCTS.map((p, i) => (
          <span
            key={p.id}
            className="h-1 flex-1 rounded-full transition-colors duration-300"
            style={{ background: i === activeIndex ? p.color : "rgba(255,255,255,0.12)" }}
          />
        ))}
      </div>
    </div>
  )
}

/* ------------------------------ PENCERE MOCK'LARI ------------------------------ */
// Hepsi statik DOM (iframe YOK); scrub yalnız transform + opacity. Tek istisna:
// auth JWT satırındaki width scrub — spec'in açıkça izin verdiği typewriter hissi.

function MailMock({ beat }: { beat: MotionValue<number> }) {
  const t = useTranslations("landingV2")
  // Beat 1: şablon listesi önde. Beat 2: compose kartı girince liste geri çekilir.
  const listOpacity = useTransform(beat, [0.3, 0.5], [1, 0.45])
  const composeOpacity = useTransform(beat, [0.28, 0.48], [0, 1])
  const composeY = useTransform(beat, [0.28, 0.48], [24, 0])
  // Beat 3: yeşil "Teslim edildi" rozeti.
  const badgeOpacity = useTransform(beat, [0.68, 0.82], [0, 1])
  const badgeScale = useTransform(beat, [0.68, 0.82], [0.85, 1])

  return (
    <div className="relative flex h-full gap-4 p-5">
      <motion.div style={{ opacity: listOpacity }} className="w-[38%] shrink-0">
        <p className="text-[11px] font-medium uppercase tracking-wider text-white/55">
          {t("build.mail.mock.templates")}
        </p>
        <ul className="mt-3 space-y-2">
          {(["tpl1", "tpl2", "tpl3"] as const).map((k) => (
            <li
              key={k}
              className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5"
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-[#3b82f6]" aria-hidden />
              <span className="truncate text-xs text-white/70">{t(`build.mail.mock.${k}`)}</span>
            </li>
          ))}
        </ul>
      </motion.div>

      <motion.div
        style={{ opacity: composeOpacity, y: composeY }}
        className="relative min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] p-4"
      >
        <p className="text-xs font-medium text-white/60">{t("build.mail.mock.compose")}</p>
        <div className="mt-3 space-y-2 text-xs">
          <div className="flex gap-2">
            <span className="w-12 shrink-0 text-white/55">{t("build.mail.mock.to")}</span>
            <code className="truncate text-white/70">ada@acme.dev</code>
          </div>
          <div className="flex gap-2">
            <span className="w-12 shrink-0 text-white/55">{t("build.mail.mock.subject")}</span>
            <span className="truncate text-white/70">{t("build.mail.mock.subjectValue")}</span>
          </div>
        </div>
        {/* Gövde iskeleti — dekoratif. */}
        <div className="mt-4 space-y-2" aria-hidden>
          <div className="h-2 w-[85%] rounded bg-white/[0.07]" />
          <div className="h-2 w-[70%] rounded bg-white/[0.07]" />
          <div className="h-2 w-[55%] rounded bg-white/[0.07]" />
        </div>
        <motion.div
          style={{ opacity: badgeOpacity, scale: badgeScale }}
          className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/15 py-1 pl-2 pr-2.5"
        >
          <span className="relative flex h-1.5 w-1.5" aria-hidden>
            <span
              className="lv2-build-anim absolute inset-0 rounded-full bg-emerald-400"
              style={{ animation: "lv2-build-pulse 2s ease-in-out infinite" }}
            />
          </span>
          <span className="text-[11px] font-medium text-emerald-300">
            {t("build.mail.mock.delivered")}
          </span>
        </motion.div>
      </motion.div>
    </div>
  )
}

function StorageMock({ beat }: { beat: MotionValue<number> }) {
  const t = useTranslations("landingV2")
  // Beat 1: dosya kartı + "yükleniyor". Beat 2: progress bar (scaleX — transform).
  const pctOpacity = useTransform(beat, [0.15, 0.3], [0, 1])
  const barScale = useTransform(beat, [0.15, 0.6], [0, 1])
  // Beat 3: CDN URL satırı.
  const urlOpacity = useTransform(beat, [0.68, 0.85], [0, 1])
  const urlY = useTransform(beat, [0.68, 0.85], [10, 0])

  return (
    <div className="flex h-full flex-col justify-center gap-4 p-6">
      <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] p-4">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#a855f7]/[0.12] text-[#a855f7]"
          aria-hidden
        >
          <HugeiconsIcon icon={File01Icon} className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <code className="block truncate text-xs text-white/80">hero-4k.png</code>
          <span className="text-[11px] text-white/55">2.4 MB</span>
        </div>
        <motion.span style={{ opacity: pctOpacity }} className="shrink-0 text-[11px] text-white/60">
          {t("build.storage.mock.uploading")}
        </motion.span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]" aria-hidden>
        <motion.div
          style={{ scaleX: barScale }}
          className="h-full w-full origin-left rounded-full bg-[#a855f7]"
        />
      </div>
      <motion.div
        style={{ opacity: urlOpacity, y: urlY }}
        className="flex items-center gap-2.5 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3"
      >
        <span className="shrink-0 text-emerald-400" aria-hidden>
          <HugeiconsIcon icon={CheckmarkCircle02Icon} className="h-4 w-4" strokeWidth={2} />
        </span>
        <code className="truncate text-xs text-emerald-200">cdn.sentroy.com/f/9f2a41c7</code>
        <span className="ml-auto shrink-0 text-[11px] text-emerald-300/80">
          {t("build.storage.mock.ready")}
        </span>
      </motion.div>
    </div>
  )
}

function AuthMock({ beat }: { beat: MotionValue<number> }) {
  const t = useTranslations("landingV2")
  // Beat 1: login mock. Beat 2: JWT satırı belirir + typewriter width scrub'ı.
  const formOpacity = useTransform(beat, [0.35, 0.55], [1, 0.4])
  const tokenOpacity = useTransform(beat, [0.42, 0.55], [0, 1])
  const tokenWidth = useTransform(beat, [0.5, 0.95], ["0%", "100%"])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-6">
      <motion.div
        style={{ opacity: formOpacity }}
        className="w-full max-w-[300px] rounded-xl border border-white/[0.08] bg-white/[0.04] p-5"
      >
        <p className="text-sm font-medium text-white/80">{t("build.auth.mock.signIn")}</p>
        <div className="mt-4 space-y-2.5">
          <div className="rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-xs text-white/60">
            {t("build.auth.mock.email")}
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-xs text-white/60">
            {t("build.auth.mock.password")}
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-[#10b981] py-2 text-center text-xs font-medium text-white">
          {t("build.auth.mock.continue")}
        </div>
      </motion.div>
      {/* JWT satırı — typewriter hissi width scrub'ıyla (spec'in açık izni). */}
      <motion.div
        style={{ opacity: tokenOpacity }}
        className="w-full max-w-[300px] rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2.5"
      >
        <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/80">
          {t("build.auth.mock.token")}
        </p>
        <div className="mt-1 flex items-center font-mono text-[11px] text-white/70">
          <motion.span style={{ width: tokenWidth }} className="overflow-hidden whitespace-nowrap">
            eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c3JfOGYyYSJ9.x1kq…
          </motion.span>
          <span
            className="lv2-build-anim -ml-px inline-block h-3 w-[2px] shrink-0 bg-emerald-400"
            style={{ animation: "lv2-build-caret 1s steps(1) infinite" }}
            aria-hidden
          />
        </div>
      </motion.div>
    </div>
  )
}

// Env satırları — sunumsal sahte anahtarlar (gerçek secret DEĞİL, sadece isim).
const VAULT_ROWS = ["DATABASE_URL", "REDIS_URL", "S3_BUCKET", "SMTP_HOST"]

function VaultMock({ beat }: { beat: MotionValue<number> }) {
  const t = useTranslations("landingV2")
  // Beat 1: env listesi. Beat 2: tek satır highlight. Beat 3: getEnv() kod satırı.
  const highlightOpacity = useTransform(beat, [0.35, 0.55], [0, 1])
  const codeOpacity = useTransform(beat, [0.62, 0.8], [0, 1])
  const codeY = useTransform(beat, [0.62, 0.8], [10, 0])

  return (
    <div className="flex h-full flex-col justify-center gap-4 p-6">
      <p className="text-[11px] font-medium uppercase tracking-wider text-white/55">
        {t("build.vault.mock.title")}
      </p>
      <ul className="space-y-1.5">
        {VAULT_ROWS.map((name, i) => (
          <li
            key={name}
            className="relative flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2"
          >
            {i === 0 && (
              <motion.span
                aria-hidden
                style={{ opacity: highlightOpacity }}
                className="absolute inset-0 rounded-lg border border-amber-400/30 bg-amber-500/10"
              />
            )}
            <code className="relative text-xs text-white/75">{name}</code>
            <span className="relative font-mono text-xs tracking-widest text-white/30" aria-hidden>
              ••••••••
            </span>
          </li>
        ))}
      </ul>
      <motion.div
        style={{ opacity: codeOpacity, y: codeY }}
        className="flex items-center gap-2.5 rounded-lg bg-black/40 px-3 py-2.5"
      >
        <code className="font-mono text-xs text-amber-300">{'getEnv("DATABASE_URL")'}</code>
        <span className="ml-auto text-[11px] text-white/60">{t("build.vault.mock.injected")}</span>
      </motion.div>
    </div>
  )
}

/* --------------------------------- POSTER --------------------------------- */
// SSR + mobil + reduced-motion varsayılanı: pin yok, 4 kompakt kart. Micro-loop
// nabız noktaları kartları canlı tutar (jüri graft'ı); offscreen'de paused.

function BuildPoster() {
  const t = useTranslations("landingV2")
  const rootRef = useRef<HTMLElement>(null)
  const inView = useInView(rootRef, { amount: 0.1 })

  return (
    <section
      ref={rootRef}
      id="lv2-build"
      className={cn("relative px-6 py-20", !inView && "lv2-build-paused")}
    >
      <style>{LOOP_CSS}</style>
      <div className="mx-auto w-full max-w-xl">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/60">
          {t("build.kicker")}
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">
          {t("build.heading")}
        </h2>
        <div className="mt-8 flex flex-col gap-4">
          {BUILD_PRODUCTS.map((product) => (
            <PosterCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  )
}

function PosterCard({ product }: { product: LandingProduct }) {
  const t = useTranslations("landingV2")
  const { light } = useLandingV2()
  const ref = useRef<HTMLDivElement>(null)
  const seen = useInView(ref, { once: true, amount: 0.5 })
  // OS dock ile ortak özel PNG logo (build ürünlerinin hepsi logolu).
  const logoUrl = productLogoUrl(product.id)

  // Kart görüldüğünde dock koleksiyonunda ürün "yanar" (full sahnenin eşleniği).
  useEffect(() => {
    if (seen) light(product.id)
  }, [seen, light, product.id])

  return (
    <div ref={ref}>
      <GlassPanel className="p-5" spotlight={false}>
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg"
            style={logoUrl ? undefined : { background: `linear-gradient(150deg, ${product.color}, ${product.color}b3)` }}
            aria-hidden
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="size-full object-cover" />
            ) : (
              <HugeiconsIcon icon={product.icon} className="h-4 w-4 text-white" strokeWidth={2} />
            )}
          </span>
          <h3 className="text-base font-semibold text-white">{t(`build.${product.id}.rail`)}</h3>
          <span className="relative ml-auto flex h-1.5 w-1.5" aria-hidden>
            <span
              className="lv2-build-anim absolute inset-0 rounded-full"
              style={{ background: product.color, animation: "lv2-build-pulse 2.4s ease-in-out infinite" }}
            />
          </span>
        </div>
        <ul className="mt-3.5 space-y-2">
          {(["p1", "p2"] as const).map((k) => (
            <li key={k} className="flex items-start gap-2 text-sm text-white/60">
              <span className="mt-0.5 shrink-0" style={{ color: product.color }} aria-hidden>
                <HugeiconsIcon icon={Tick02Icon} className="h-4 w-4" strokeWidth={2.5} />
              </span>
              <span>{t(`build.${product.id}.${k}`)}</span>
            </li>
          ))}
        </ul>
      </GlassPanel>
    </div>
  )
}
