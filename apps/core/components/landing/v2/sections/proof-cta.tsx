"use client"

// Proof + Final CTA — landing v2'nin güven katmanı ve duygusal kapanışı.
//
// ProofFaq  : pin'siz sakin bölge. 4 CountUp istatistik (useInView'da bir kez
//             animate(0→değer)) + dogfood status köprüsü + 5 soruluk FAQ
//             (mevcut shadcn Accordion, dark zemine renk override'ları ile).
// YourDesktop: "Bu masaüstü senin." final CTA — ortalanmış yazı + kareli-defter
//             grid zemini; imleç spotlight'ı içeriğin ALTINDAKİ katmanda yalnız
//             grid çizgilerini aydınlatır (yazı/buton soluklaşmaz). Bölüme
//             varış + CTA tıklaması dock'ta sweep() dalgası tetikler.
//
// Not: bu iki bölümde ürün beat'i yok → light()/setActiveProduct çağrısı
// bilinçli olarak YOK (dock koleksiyonu sahnelerde tamamlanır).

import { useEffect, useRef } from "react"
import { motion, useInView, animate } from "framer-motion"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@workspace/ui/components/accordion"
import { cn } from "@workspace/ui/lib/utils"
import { Magnetic } from "../primitives/magnetic"
import { useMotionSafe } from "../primitives/use-motion-safe"
import { useLandingV2 } from "../landing-context"

// ═══════════════════════════════════════════════════════════════════════
// CountUp — görünür olunca BİR KEZ 0→değer sayar (animate() tabanlı).
// SSR/no-JS'de nihai değer render edilir (SEO + progressive enhancement);
// sayma yalnız DOM textContent'e yazar → React re-render sıfır.
// ═══════════════════════════════════════════════════════════════════════

function CountUp({
  value,
  decimals = 0,
  className,
}: {
  value: number
  decimals?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: "-80px 0px" })
  const { reducedMotion } = useMotionSafe()

  useEffect(() => {
    const el = ref.current
    if (!el || !inView) return
    // Reduced-motion: sayaç tek karede nihai değere oturur.
    if (reducedMotion) {
      el.textContent = value.toFixed(decimals)
      return
    }
    const controls = animate(0, value, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = v.toFixed(decimals)
      },
    })
    return () => controls.stop()
  }, [inView, value, decimals, reducedMotion])

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {value.toFixed(decimals)}
    </span>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// ProofFaq — istatistik şeridi + dogfood status satırı + SSS accordion'u.
// ═══════════════════════════════════════════════════════════════════════

const PROOF_STATS: {
  key: "products" | "session" | "tools" | "uptime"
  value: number
  decimals?: number
  suffix?: string
}[] = [
  { key: "products", value: 12 },
  { key: "session", value: 1 },
  { key: "tools", value: 30, suffix: "+" },
  { key: "uptime", value: 99.9, decimals: 1, suffix: "%" },
]

const FAQ_KEYS = ["session", "alacarte", "sdk", "free", "data"] as const

export function ProofFaq() {
  const t = useTranslations("landingV2")
  const { reducedMotion } = useMotionSafe()

  // Yeşil nabız yalnız görünürken oynar (sonsuz animasyon doz kuralı).
  const pulseRef = useRef<HTMLDivElement>(null)
  const pulseInView = useInView(pulseRef, { margin: "-40px 0px" })

  return (
    <section id="proof" className="relative border-t border-white/[0.06]">
      {/* Bileşen-yerel keyframe'ler — lv2- prefix, dışarı sızmaz. */}
      <style>{`
        @keyframes lv2-proof-pulse {
          0%   { transform: scale(1);   opacity: 0.7; }
          70%  { transform: scale(2.4); opacity: 0; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .lv2-proof-pulse-ring { animation: none !important; opacity: 0; }
        }
      `}</style>

      <div className="mx-auto max-w-6xl px-6 py-28 sm:py-36">
        {/* Başlık bloğu */}
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-80px 0px" }}
            transition={{ duration: 0.5 }}
            className="mb-3 text-sm font-medium tracking-wider text-white/60 uppercase"
          >
            {t("proof.eyebrow")}
          </motion.p>
          <motion.h2
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-80px 0px" }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl"
          >
            {t("proof.title")}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-80px 0px" }}
            transition={{ duration: 0.5, delay: 0.16 }}
            className="mt-4 text-balance text-lg text-white/50"
          >
            {t("proof.description")}
          </motion.p>
        </div>

        {/* İstatistik şeridi — 4 CountUp */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-12 lg:grid-cols-4">
          {PROOF_STATS.map((s, i) => (
            <motion.div
              key={s.key}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-80px 0px" }}
              transition={{ duration: 0.5, delay: i * 0.07 }}
              className="flex flex-col items-center gap-2 text-center"
            >
              <div className="text-5xl font-semibold tracking-tight text-white sm:text-6xl">
                <CountUp value={s.value} decimals={s.decimals} />
                {s.suffix ? (
                  <span className="text-white/60">{s.suffix}</span>
                ) : null}
              </div>
              <div className="text-sm text-white/50">
                {t(`proof.stats.${s.key}`)}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Dogfood köprüsü — Status Pages kendi güvenilirliğini kanıtlar. */}
        <div
          ref={pulseRef}
          className="mt-14 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-white/50"
        >
          <span className="relative flex h-2.5 w-2.5" aria-hidden>
            <span
              className="lv2-proof-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-400/60"
              style={{
                animation: "lv2-proof-pulse 2s cubic-bezier(0, 0, 0.2, 1) infinite",
                animationPlayState:
                  pulseInView && !reducedMotion ? "running" : "paused",
              }}
            />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </span>
          <span>{t("proof.statusNote")}</span>
          <a
            href="https://status.sentroy.com"
            className="inline-flex items-center gap-1 font-medium text-white/80 transition-colors hover:text-white"
          >
            {t("proof.statusCta")}
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              strokeWidth={2}
              className="size-3.5"
              aria-hidden
            />
          </a>
        </div>

        {/* FAQ — normal akış, açılışa ek süs yok (jüri: sakin bölge). */}
        <div className="mx-auto mt-24 max-w-3xl sm:mt-32">
          <div className="mx-auto mb-10 max-w-xl text-center">
            <h3 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {t("proof.faqTitle")}
            </h3>
            <p className="mt-3 text-white/50">{t("proof.faqDescription")}</p>
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-80px 0px" }}
            transition={{ duration: 0.5 }}
          >
            <Accordion className="border-white/[0.08] bg-white/[0.02]">
              {FAQ_KEYS.map((key) => (
                <AccordionItem
                  key={key}
                  value={key}
                  className="border-white/[0.06] data-open:bg-white/[0.04]"
                >
                  <AccordionTrigger className="text-white/85 hover:text-white">
                    {t(`proof.faq.${key}.q`)}
                  </AccordionTrigger>
                  <AccordionContent className="text-white/55">
                    {t(`proof.faq.${key}.a`)}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </div>
      </div>
    </section>
  )
}// ═══════════════════════════════════════════════════════════════════════
// YourDesktop — final CTA: "Bu masaüstü senin."
// Ortalanmış yazı + CTA (cihaz mockup'ları kaldırıldı — kullanıcı kararı).
// Zemin: kareli-defter grid'i; imleç spotlight'ı İÇERİĞİN ALTINDAKİ katmanda
// yalnız GRID ÇİZGİLERİNİ aydınlatır (mask ile) — yazı/butonların üstüne
// hiçbir ışık overlay'i binmez, soluklaşma olmaz.
// ═══════════════════════════════════════════════════════════════════════

export function YourDesktop({ lang }: { lang: string }) {
  const { sweep } = useLandingV2()
  const sectionRef = useRef<HTMLElement>(null)
  const spotRaf = useRef<number | null>(null)

  // Bölüme varış: dock son kez tam kadro parlar (tek seferlik sweep dalgası).
  const arrived = useInView(sectionRef, { once: true, amount: 0.45 })
  useEffect(() => {
    if (arrived) sweep()
  }, [arrived, sweep])

  // İmleç koordinatları → CSS var (RAF-throttle, re-render sıfır). Spotlight
  // yalnız zemindeki parlak-grid katmanının mask'ini sürer.
  function onSpotMove(e: React.PointerEvent) {
    if (spotRaf.current != null) return
    const { clientX, clientY } = e
    spotRaf.current = requestAnimationFrame(() => {
      spotRaf.current = null
      const el = sectionRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      el.style.setProperty("--mx", `${clientX - r.left}px`)
      el.style.setProperty("--my", `${clientY - r.top}px`)
    })
  }

  return (
    <section
      ref={sectionRef}
      id="your-desktop"
      onPointerMove={onSpotMove}
      className="relative flex min-h-[92svh] items-center justify-center overflow-hidden px-6"
    >
      {/* ── Zemin katmanları (içeriğin ALTINDA — aria-hidden, pointer-events yok) ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* Kareli defter grid'i — sabit, kısık */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(120% 90% at 50% 45%, black 40%, transparent 78%)",
            WebkitMaskImage: "radial-gradient(120% 90% at 50% 45%, black 40%, transparent 78%)",
          }}
        />
        {/* Parlak grid — yalnız imleç çevresinde görünür (spotlight = grid aydınlanır;
            içerik üstüne ışık overlay'i BİNMEZ) */}
        <div
          className="absolute inset-0 opacity-0 [@media(pointer:fine)]:opacity-100"
          style={{
            backgroundImage:
              "linear-gradient(rgba(129,140,248,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(129,140,248,0.35) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage:
              "radial-gradient(260px circle at var(--mx, 50%) var(--my, 50%), black, transparent 72%)",
            WebkitMaskImage:
              "radial-gradient(260px circle at var(--mx, 50%) var(--my, 50%), black, transparent 72%)",
          }}
        />
        {/* Çok kısık merkez ışıma — nefes alan sahne (içerikten bağımsız, sabit) */}
        <div
          className="absolute left-1/2 top-1/2 h-[70vmin] w-[110vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: "radial-gradient(closest-side, rgba(99,102,241,0.10), transparent 70%)",
          }}
        />
      </div>

      {/* ── İçerik — zeminden bağımsız, hiçbir overlay altında değil ── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px 0px" }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 mx-auto flex max-w-4xl flex-col items-center py-24 text-center"
      >
        <CtaCopy lang={lang} />
      </motion.div>
    </section>
  )
}

/** Başlık + CTA'lar — final bölümün içerik bloğu. */
function CtaCopy({ lang }: { lang: string }) {
  const t = useTranslations("landingV2")
  const { sweep } = useLandingV2()
  return (
    <>
      <h2 className="text-balance text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
        {t("cta.title")}
      </h2>
      <p className="mx-auto mt-6 max-w-xl text-balance text-lg text-white/55">{t("cta.subtitle")}</p>
      <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
        {/* Birincil CTA — düz <a> (cross-locale); tıklama = son mikro-ödül: sweep */}
        <Magnetic strength={12}>
          <a
            href={`/${lang}/signup`}
            onClick={() => sweep()}
            className="group inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-semibold text-black shadow-[0_8px_40px_-10px_rgba(255,255,255,0.4)] transition-shadow duration-200 hover:shadow-[0_10px_52px_-10px_rgba(255,255,255,0.55)] active:scale-[0.97]"
          >
            {t("cta.primary")}
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              strokeWidth={2}
              className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden
            />
          </a>
        </Magnetic>
        <a
          href="/docs"
          className="inline-flex items-center gap-2 rounded-full border border-white/[0.14] px-8 py-4 text-base font-medium text-white/75 transition-colors duration-200 hover:border-white/[0.28] hover:text-white"
        >
          {t("cta.secondary")}
        </a>
      </div>
      <p className="mt-5 text-sm text-white/60">{t("cta.note")}</p>
    </>
  )
}
