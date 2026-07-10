"use client"

// BootHero — "Power On" hero (spec: boot section'ı + kullanıcı revizyonu).
//
// Akış:
// 1) H1 + carousel alt metin + tek CTA her modda anında görünür (SSR default =
//    POSTER, LCP güvenli). Alt metin ~4 sn'de bir carousel'le döner.
// 2) Ekran çerçevesi navbar'ın ALTINDA küçük başlar (scale 0.84 + y %3.5 —
//    scrollTop 0'ken nav pencereye binmez); "biraz scroll"la (progress 0.55)
//    ekranı doldurur (radius 28→0). İçinde valley wallpaper + spotlight.
// 3) 11 ürün ikonu pencerede DAĞINIK YÜZER (iç katman CSS bob — sabit dururken
//    canlılık). Pencere dolunca (0.5-0.8, ikon başına stagger) ikonlar dock
//    slot koordinatlarına uçar; DOCK_REVEAL_AT'te gerçek DockNav belirir ve
//    uçan ikonlar sönümlenir → "ikonlar dock'u kurdu" devri. Çift yönlü:
//    yukarı dönünce dock gizlenir, ikonlar dağılır. Sweep dalgası dock'un
//    İLK belirişinde bir kez oynar.
// 4) sessionStorage "lv2-boot-seen": ikinci ziyarette boot giriş koreografisi
//    atlanır (kurulu hal, duration 0) — scroll koreografisi her zaman canlı.
// 5) Jüri kuralları korunur: pin container'a transform yok, scrub yalnız
//    transform/opacity (+ tek elemanda border-radius istisnası).
//
// Boot'ta ürün beat'i YOKTUR: ikonlar katalog mesajı taşır, hiçbiri anlatılmaz
// — light()/setActiveProduct çağrısı bilinçli olarak yok.

import { useEffect, useRef, useState } from "react"
import {
  AnimatePresence,
  motion,
  useInView,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "framer-motion"
import { useLocale, useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { ScrollScene } from "../primitives/scroll-scene"
import { Magnetic } from "../primitives/magnetic"
import { useMotionSafe } from "../primitives/use-motion-safe"
import { LANDING_PRODUCTS, productLogoUrl } from "../data/products"
import { useLandingV2 } from "../landing-context"

/**
 * Yüzen ikonların pencere içi dağınık konumları (% viewport). Merkez (hero
 * metni) boş bırakılır; üst kenar navbar + pencere üst boşluğunun altında kalır.
 */
const FLOAT_POS: Record<string, { x: number; y: number }> = {
  mail: { x: 13, y: 24 },
  storage: { x: 86, y: 20 },
  auth: { x: 19, y: 66 },
  vault: { x: 79, y: 64 },
  status: { x: 7, y: 44 },
  meet: { x: 91, y: 44 },
  whatsapp: { x: 30, y: 17 },
  linear: { x: 70, y: 16 },
  studio: { x: 13, y: 84 },
  opencut: { x: 84, y: 84 },
  tools: { x: 50, y: 14 },
}
const FLOATERS = LANDING_PRODUCTS.filter((p) => p.id !== "os")

/** Dock geometrisi aynası (DockNav ile senkron): pitch = ikon 40 + gap 8. */
const DOCK_PITCH_PX = 48
const DOCK_ICON_CENTER_FROM_BOTTOM = 44 // bottom-4(16) + pb-2(8) + 40/2
/** Pencere ekranı doldurunca ikonlar uçar; dock bu eşikte belirir. */
const DOCK_REVEAL_AT = 0.8

/** Boot koreografisinin oturum içi tek-seferlik flag'i. */
const BOOT_SEEN_KEY = "lv2-boot-seen"

/** Boot durumu: on = kuruldu mu, instant = animasyonsuz mu (ikinci ziyaret). */
interface BootState {
  on: boolean
  instant: boolean
}

export function BootHero() {
  const { full } = useMotionSafe()

  // SSR + mobil + reduced-motion → poster (hero metni ilk HTML'de, LCP güvenli).
  if (!full) return <BootPoster />

  return (
    <ScrollScene heightVh={150} id="boot">
      {(progress) => <BootStage progress={progress} />}
    </ScrollScene>
  )
}

/* ------------------------------------------------------------------ */
/* Full mod: load koreografisi + dolly-in scrub                         */
/* ------------------------------------------------------------------ */

function BootStage({ progress }: { progress: MotionValue<number> }) {
  const t = useTranslations("landingV2")
  const { sweep, setDockHidden } = useLandingV2()
  const rootRef = useRef<HTMLDivElement>(null)
  const spotRaf = useRef<number | null>(null)
  const inView = useInView(rootRef, { amount: 0.1 })
  const [boot, setBoot] = useState<BootState>({ on: false, instant: false })

  // Viewport ölçüsü — yüzen ikonların dağınık→dock uçuş koordinatları için.
  const [vp, setVp] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const update = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  // Dock, boot sekansı bitene dek GİZLİ: pencere ekranı doldurup ikonlar dock
  // pozisyonlarına inince belirir (çift yönlü — yukarı dönünce yine gizlenir).
  // Sweep dalgası dock'un İLK belirişinde oynar (eski t=1.2s zamanlayıcı yerine).
  const dockHiddenRef = useRef(true)
  const sweptRef = useRef(false)
  useEffect(() => {
    setDockHidden(true)
    dockHiddenRef.current = true
    return () => setDockHidden(false) // unmount'ta (resize→poster) dock'u serbest bırak
  }, [setDockHidden])
  useMotionValueEvent(progress, "change", (v) => {
    const hide = v < DOCK_REVEAL_AT
    if (hide !== dockHiddenRef.current) {
      dockHiddenRef.current = hide
      setDockHidden(hide)
      if (!hide && !sweptRef.current) {
        sweptRef.current = true
        sweep()
      }
    }
  })

  // İmleç spotlight'ı — GlassPanel deseni: koordinatlar RAF-throttle ile CSS
  // custom property'lere yazılır (React re-render sıfır); ekran çerçevesi
  // root ile aynı boyutta (inset-0) olduğundan root-relative koordinat yeter.
  function onSpotMove(e: React.PointerEvent) {
    if (spotRaf.current != null) return
    const { clientX, clientY } = e
    spotRaf.current = requestAnimationFrame(() => {
      spotRaf.current = null
      const el = rootRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      el.style.setProperty("--mx", `${clientX - r.left}px`)
      el.style.setProperty("--my", `${clientY - r.top}px`)
    })
  }

  // Boot koreografisi — sessionStorage flag'i ile oturum başına tek sefer.
  useEffect(() => {
    let seen = false
    try {
      seen = window.sessionStorage.getItem(BOOT_SEEN_KEY) === "1"
    } catch {
      // storage engelli (privacy mode) → her ziyarette oynatmak zararsız.
    }
    if (seen) {
      // İkinci ziyaret: koreografi atlanır, doğrudan kurulu hal.
      setBoot({ on: true, instant: true })
      return
    }
    setBoot({ on: true, instant: false })
    try {
      window.sessionStorage.setItem(BOOT_SEEN_KEY, "1")
    } catch {
      /* yazamazsak sorun değil */
    }
  }, [])

  // Dolly-in scrub'ı: H1 yukarı kayıp söner; ekran çerçevesi navbar'ın altında
  // KÜÇÜK başlar (scale 0.84 + hafif aşağı — üst boşluk nav'ı temizler) ve
  // "biraz scroll"la ekranı doldurur (0.55'te tam).
  const heroY = useTransform(progress, [0, 0.4], [0, -64])
  const heroOpacity = useTransform(progress, [0, 0.35], [1, 0])
  // Sönen hero'nun görünmez CTA'sı tıklama yakalamasın.
  const heroPointer = useTransform(heroOpacity, (v) => (v < 0.2 ? "none" : "auto"))
  const hintOpacity = useTransform(progress, [0, 0.12], [1, 0])
  const screenScale = useTransform(progress, [0.02, 0.55], [0.84, 1])
  const screenY = useTransform(progress, [0.02, 0.55], ["3.5%", "0%"])
  const screenRadius = useTransform(progress, [0.02, 0.55], [28, 0])

  return (
    <div ref={rootRef} onPointerMove={onSpotMove} className="relative h-full w-full">
      {/* Ekran çerçevesi — dolly hedefi (tamamen dekoratif) */}
      <motion.div
        aria-hidden
        style={{ scale: screenScale, y: screenY, borderRadius: screenRadius }}
        className="absolute inset-0 overflow-hidden ring-1 ring-white/10 shadow-[0_48px_140px_-48px_rgba(0,0,0,0.95)]"
      >
        {/* Boot girişi — load koreografisi bu iç katmanda (dış katman scrub'ın) */}
        <motion.div
          initial={false}
          animate={{ opacity: boot.on ? 1 : 0, scale: boot.on ? 1 : 0.975 }}
          transition={
            boot.instant ? { duration: 0 } : { duration: 0.7, delay: 0.2, ease: "easeOut" }
          }
          className="h-full w-full"
        >
          <ScreenSurface on={boot.on} instant={boot.instant} />
        </motion.div>
      </motion.div>

      {/* Yüzen uygulama ikonları — pencerede dağınık süzülür (sabit dururken
          canlılık); pencere ekranı doldurunca dock pozisyonlarına uçup dock'u
          "kurarlar" (gerçek DockNav aynı anda altlarında belirir, ikonlar
          sönümlenerek devri tamamlar). Viewport-ankrajlı: frame scale'inden
          bağımsız, uçuş koordinatları stabil. */}
      {vp.w > 0 ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-[5]">
          <style>{`
            @keyframes lv2-boot-float {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-8px); }
            }
          `}</style>
          {FLOATERS.map((p, i) => (
            <FloatingIcon
              key={p.id}
              product={p}
              index={i}
              progress={progress}
              vp={vp}
              on={boot.on}
              instant={boot.instant}
              playing={inView}
            />
          ))}
        </div>
      ) : null}

      {/* Hero metni — dolly başlarken yukarı süzülüp söner */}
      <motion.div
        style={{ y: heroY, opacity: heroOpacity, pointerEvents: heroPointer }}
        className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center"
      >
        <HeroCopy />
      </motion.div>

      {/* Scroll ipucu — global dock'un hemen üstünde, ilk scroll'da söner */}
      <motion.div
        aria-hidden
        style={{ opacity: hintOpacity }}
        className="pointer-events-none absolute inset-x-0 bottom-[7.5rem] z-10 flex flex-col items-center gap-1.5 text-white/45"
      >
        <span className="text-[11px] font-medium uppercase tracking-[0.18em]">
          {t("boot.scrollHint")}
        </span>
        <span
          className="inline-flex"
          style={{
            animation: "lv2-boot-hint 2.2s ease-in-out infinite",
            animationPlayState: inView ? "running" : "paused",
          }}
        >
          <HugeiconsIcon icon={ArrowDown01Icon} className="h-4 w-4" strokeWidth={2} />
        </span>
      </motion.div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Poster: statik hero + kurulu mini ekran (SSR default, mobil/reduced) */
/* ------------------------------------------------------------------ */

function BootPoster() {
  return (
    <section
      id="boot"
      className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-6 pb-24 pt-28"
    >
      <div className="flex w-full max-w-3xl flex-col items-center text-center">
        <HeroCopy />
      </div>

      {/* Kurulu mini ekran görseli — koreografisiz ama ölü değil (saat + drift) */}
      <div
        aria-hidden
        className="mt-14 w-full max-w-3xl overflow-hidden rounded-2xl ring-1 ring-white/10 shadow-[0_36px_110px_-42px_rgba(0,0,0,0.95)]"
      >
        <div className="relative aspect-[16/10]">
          <ScreenSurface on instant />
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Ortak parçalar                                                       */
/* ------------------------------------------------------------------ */

/** H1 + alt metin + tek CTA — hem poster hem full aynı bloğu kullanır. */
function HeroCopy() {
  const t = useTranslations("landingV2")
  const locale = useLocale()

  return (
    <>
      

      <h1 className="mt-6 max-w-4xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
        {t("boot.title")}
      </h1>

      <SubtitleCarousel />

      <div className="mt-9">
        <Magnetic strength={10}>
          <Button
            size="lg"
            className="h-12 rounded-full px-7 text-[15px] font-semibold"
            render={<a href={`/${locale}/signup`} />}
          >
            {t("boot.cta")}
            <HugeiconsIcon icon={ArrowRight01Icon} className="h-4 w-4" strokeWidth={2} />
          </Button>
        </Magnetic>
      </div>
    </>
  )
}

/**
 * ScreenSurface — mini "ekran" içeriği: gece-mavisi duvar kağıdı + aurora
 * drift'i + menü bar (canlı saat). Boot menü barı `on/instant`'a göre düşer.
 */
function ScreenSurface({ on, instant }: { on: boolean; instant: boolean }) {
  const { reducedMotion } = useMotionSafe()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { amount: 0.15 })
  const playing = inView && !reducedMotion

  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden bg-[#05070f]">
      {/* Mikro-loop keyframe'leri — bileşen-lokal, lv2- prefix (çakışma yok) */}
      <style>{`
        @keyframes lv2-boot-kenburns {
          0%, 100% { transform: scale(1.02) translate3d(0, 0, 0); }
          50% { transform: scale(1.09) translate3d(1.5%, -1%, 0); }
        }
        @keyframes lv2-boot-hint {
          0%, 100% { transform: translateY(0); }
          55% { transform: translateY(6px); }
        }
      `}</style>

      {/* Valley duvar kağıdı — gerçek OS wallpaper'ı; çok yavaş Ken Burns drift */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/os-wallpapers/valley.webp"
        srcSet="/os-wallpapers/valley-800.webp 800w, /os-wallpapers/valley.webp 1600w"
        sizes="100vw"
        alt=""
        width={1600}
        height={1035}
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          animation: "lv2-boot-kenburns 44s ease-in-out infinite",
          animationPlayState: playing ? "running" : "paused",
          willChange: "transform",
        }}
      />
      {/* Fotoğraf üstü karartma — hero tipografisinin okunurluğu için */}
      <div className="absolute inset-0 bg-black/35" />

      {/* Alt vinyet — global dock'un görsel oturağı */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/60 to-transparent" />

      {/* Menü bar — boot'ta üstten düşer, saat canlı tiklar (marka rozeti YOK) */}
      <motion.div
        initial={false}
        animate={{ y: on ? 0 : -32, opacity: on ? 1 : 0 }}
        transition={
          instant ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 30, delay: 0.6 }
        }
        className="absolute inset-x-0 top-0 z-10 flex h-8 items-center justify-between border-b border-white/[0.07] bg-black/25 px-4 backdrop-blur-md"
      >
        <span
          className="h-2 w-2 rounded-full bg-gradient-to-br from-blue-400 to-purple-500"
          aria-hidden
        />
        <MenuClock />
      </motion.div>

      {/* İmleç spotlight'ı — BootStage/BootPoster kökünün --mx/--my değişkenlerini okur */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 [@media(pointer:fine)]:opacity-100"
        style={{
          background:
            "radial-gradient(420px circle at var(--mx, 50%) var(--my, 38%), rgba(255,255,255,0.10), transparent 68%)",
        }}
      />
    </div>
  )
}

/**
 * MenuClock — ziyaretçi locale'inde canlı saat. State bu küçük bileşende izole:
 * saniyelik re-render sayfanın geri kalanına sızmaz. SSR/hydration güvenliği
 * için ilk değer effect'te yazılır (placeholder dilsizdir).
 */
function MenuClock() {
  const [now, setNow] = useState<string | null>(null)

  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      )
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <span className="text-[11px] font-medium tabular-nums text-white/60">
      {now ?? "--:--:--"}
    </span>
  )
}

/**
 * FloatingIcon — boot penceresinde süzülen ürün ikonu.
 * Dinlenmede: dağınık pozisyonunda hafif bob (iç katman CSS keyframe —
 * framer'ın dış transform'uyla çakışmaz). Uçuşta: progress [0.5..0.8]
 * bandında (ikon başına ~0.012 stagger) dock slot koordinatına süzülür,
 * inişte dock'un sönük ikon haline uyum için soluklaşıp kaybolur.
 */
function FloatingIcon({
  product,
  index,
  progress,
  vp,
  on,
  instant,
  playing,
}: {
  product: (typeof LANDING_PRODUCTS)[number]
  index: number
  progress: MotionValue<number>
  vp: { w: number; h: number }
  on: boolean
  instant: boolean
  playing: boolean
}) {
  const pos = FLOAT_POS[product.id] ?? { x: 50, y: 50 }
  // OS dock ile ortak özel PNG logo (yüzen ikonların hepsi logolu — os hariç).
  const logoUrl = productLogoUrl(product.id)
  // Dağınık başlangıç (px, sol-üst ankraj) → dock slot hedefi.
  const ICON = 44
  const sx = (pos.x / 100) * vp.w - ICON / 2
  const sy = (pos.y / 100) * vp.h - ICON / 2
  const dx = vp.w / 2 + (product.dockSlot - (LANDING_PRODUCTS.length - 1) / 2) * DOCK_PITCH_PX - ICON / 2
  const dy = vp.h - DOCK_ICON_CENTER_FROM_BOTTOM - ICON / 2

  const start = 0.5 + index * 0.012
  const end = 0.78 + index * 0.012
  const x = useTransform(progress, [start, end], [sx, dx])
  const y = useTransform(progress, [start, end], [sy, dy])
  const scale = useTransform(progress, [start, end], [1, 0.9])
  // İniş devri: dock belirirken uçan ikon sönümlenir. Fade bandı end'e GÖRELİ —
  // sabit üst sınır (0.88) yüksek index'lerde end'in ALTINA düşüp azalan input
  // dizisi üretiyordu (WAAPI 'monotonically non-decreasing' hatası).
  const opacity = useTransform(progress, [end, end + 0.08], [1, 0])

  return (
    <motion.div
      style={{ x, y, scale, opacity }}
      className="absolute left-0 top-0 will-change-transform"
    >
      {/* Bob — iç katmanda (dış framer transform'una dokunmaz) */}
      <motion.div
        initial={false}
        animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.5 }}
        transition={
          instant
            ? { duration: 0 }
            : { type: "spring", stiffness: 320, damping: 22, delay: 0.35 + index * 0.05 }
        }
      >
        <div
          style={{
            animation: `lv2-boot-float ${5.2 + index * 0.4}s ease-in-out infinite`,
            animationDelay: `${-index * 0.8}s`,
            animationPlayState: playing ? "running" : "paused",
          }}
        >
          <span
            className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-[28%] shadow-lg ring-1 ring-white/25"
            style={logoUrl ? undefined : { background: `linear-gradient(150deg, ${product.color}, ${product.color}cc)` }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="size-full object-cover" />
            ) : (
              <HugeiconsIcon icon={product.icon} className="size-[46%] text-white drop-shadow-md" strokeWidth={2} />
            )}
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/35 via-white/5 to-transparent" />
          </span>
        </div>
      </motion.div>
    </motion.div>
  )
}

/**
 * SubtitleCarousel — hero alt metni carousel'i: değer cümleleri ~4 sn'de bir
 * yumuşak fade+slide ile döner. SSR ilk cümleyi (boot.subtitle) render eder
 * (LCP/SEO güvenli); reduced-motion'da dönmez, ilk cümle sabit kalır.
 * Sabit yükseklikli kap → satır değişiminde layout kayması olmaz.
 */
function SubtitleCarousel() {
  const t = useTranslations("landingV2")
  const { reducedMotion } = useMotionSafe()
  const lines = [
    t("boot.subtitle"),
    t("boot.carousel.0"),
    t("boot.carousel.1"),
    t("boot.carousel.2"),
  ]
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (reducedMotion) return
    const id = window.setInterval(() => setIdx((i) => (i + 1) % lines.length), 4000)
    return () => window.clearInterval(id)
  }, [reducedMotion, lines.length])

  return (
    <div className="relative mt-5 flex h-[3.6em] max-w-xl items-start justify-center text-base leading-relaxed md:text-lg">
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={idx}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="text-pretty text-white/60"
        >
          {lines[idx]}
        </motion.p>
      </AnimatePresence>
    </div>
  )
}
