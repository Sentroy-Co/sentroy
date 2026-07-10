"use client"

// sdk-pricing.tsx — Landing v2: Developers terminali + Pricing cam panelleri.
//
// SdkTerminal — pin'siz serbest akış (jüri pacing kuralı: iki pin arasında
// nefes). GlassPanel üstüne Terminal.app kromu; kod satırları useInView ile
// stagger reveal, imleç CSS blink. Kod içeriği i18n'e girmez (evrensel);
// başlık/açıklama/aria metinleri landingV2.sdk.* anahtarlarından gelir.
// Kopyala mikro-ödülü: install komutu kopyalanınca terminale "installed"
// satırı düşer (spec: sdk-terminal microInteraction).
//
// PricingGlass — eski landing'in /api/public/landing fetch'inin aynısı
// (data.plans + data.settings.showPricing). 3 GlassPanel kart; aylık/yıllık
// toggle'da rakamlar ODOMETRE kayması (y-stack + overflow clip + spring —
// jüri graft'ı: CountUp morph yerine mekanik odometre). Veri boş/hatalıysa
// section sessizce gizlenir (return null). Scrub yok — bilinçli tempo düşüşü.

import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useInView } from "framer-motion"
import { useLocale, useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowRight02Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { GlassPanel } from "../primitives/glass-panel"
import { Magnetic } from "../primitives/magnetic"
import { useMotionSafe } from "../primitives/use-motion-safe"

// ═══════════════════════════════════════════════════════════════════════
// Ortak yardımcılar
// ═══════════════════════════════════════════════════════════════════════

/** Çok dilli alan çözümü — eski landing'in loc() davranışının birebiri. */
function loc(v: Record<string, string> | string | undefined, lang: string): string {
  if (!v) return ""
  if (typeof v === "string") return v
  return v[lang] || v.en || Object.values(v)[0] || ""
}

/** storageLimit BYTES cinsinde — okunur birime indir (eski landing paritesi). */
function formatStorage(bytes: number, lang: string): string {
  if (bytes <= 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
  const val = bytes / Math.pow(k, i)
  const num = Number.isInteger(val) ? val.toLocaleString(lang) : val.toFixed(1)
  return `${num} ${sizes[i]}`
}

// ═══════════════════════════════════════════════════════════════════════
// SdkTerminal — Developers bölümü
// ═══════════════════════════════════════════════════════════════════════

// Token renk paleti — manuel minimal highlight (shiki'ye gerek yok; 10 satır).
const TOK = {
  kw: "text-sky-300", // anahtar kelime
  str: "text-emerald-300", // string literal
  fn: "text-amber-200", // fonksiyon/constructor
  pl: "text-white/85", // düz kod
  pr: "text-white/60", // prompt / soluk
  cm: "text-white/60", // yorum satırı
  pk: "text-fuchsia-300", // paket adı
} as const

interface Tok {
  s: string
  c: string
}

// Kod içeriği bilinçli olarak i18n DIŞI — kod evrenseldir (görev kuralı).
const TERMINAL_LINES: Tok[][] = [
  [
    { s: "$ ", c: TOK.pr },
    { s: "bun add ", c: TOK.pl },
    { s: "@sentroy-co/client-sdk", c: TOK.pk },
  ],
  [],
  [
    { s: "import ", c: TOK.kw },
    { s: "{ Sentroy } ", c: TOK.pl },
    { s: "from ", c: TOK.kw },
    { s: '"@sentroy-co/client-sdk"', c: TOK.str },
  ],
  [],
  [
    { s: "const ", c: TOK.kw },
    { s: "sentroy = ", c: TOK.pl },
    { s: "new ", c: TOK.kw },
    { s: "Sentroy", c: TOK.fn },
    { s: "({ accessToken: ", c: TOK.pl },
    { s: '"stk_…"', c: TOK.str },
    { s: " })", c: TOK.pl },
  ],
  [],
  [
    { s: "await ", c: TOK.kw },
    { s: "sentroy.send.", c: TOK.pl },
    { s: "email", c: TOK.fn },
    { s: "({", c: TOK.pl },
  ],
  [
    { s: "  to: ", c: TOK.pl },
    { s: '"user@example.com"', c: TOK.str },
    { s: ",", c: TOK.pl },
  ],
  [
    { s: "  templateId: ", c: TOK.pl },
    { s: '"welcome"', c: TOK.str },
    { s: ",", c: TOK.pl },
  ],
  [{ s: "})", c: TOK.pl }],
  [
    { s: "// → { status: ", c: TOK.cm },
    { s: '"delivered"', c: TOK.str },
    { s: " }", c: TOK.cm },
  ],
]

const INSTALL_CMD = "bun add @sentroy-co/client-sdk"

export function SdkTerminal() {
  const t = useTranslations("landingV2")
  const { reducedMotion } = useMotionSafe()
  const bodyRef = useRef<HTMLDivElement>(null)
  // Reveal bir kez tetiklenir; blink/pause için ayrı canlı gözlem.
  const revealed = useInView(bodyRef, { once: true, margin: "-10% 0px" })
  const onScreen = useInView(bodyRef)

  const [copied, setCopied] = useState(false)
  const [installed, setInstalled] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current)
  }, [])

  async function copyInstall() {
    try {
      await navigator.clipboard.writeText(INSTALL_CMD)
      setCopied(true)
      setInstalled(true) // mikro-ödül: terminale "installed" satırı düşer
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard reddedilirse sessiz geç — kullanıcı komutu elle seçebilir
    }
  }

  return (
    <section id="sdk" className="relative overflow-hidden py-28 lg:py-36">
      {/* Bileşen-lokal keyframe'ler — lv2- prefix, sızıntı yok. */}
      <style>{`
        @keyframes lv2-sdk-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .lv2-sdk-cursor { animation: none !important; opacity: 1; }
        }
      `}</style>

      {/* Degrade zemin — bölüm "düz siyah" kalmasın: indigo→emerald geliştirici
          paleti, üst/alt kenarlarda sayfa zeminine yumuşak karışır. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0d1130] to-transparent" />
        <div className="absolute -left-[10%] top-[12%] h-[60%] w-[55%] rounded-full bg-[radial-gradient(closest-side,rgba(99,102,241,0.16),transparent_70%)] blur-2xl" />
        <div className="absolute -right-[12%] bottom-[8%] h-[55%] w-[50%] rounded-full bg-[radial-gradient(closest-side,rgba(16,185,129,0.10),transparent_70%)] blur-2xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6">

      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
        {/* Sol kolon — copy */}
        <div>
          <p className="mb-3 text-xs font-semibold tracking-[0.18em] text-white/60 uppercase">
            {t("sdk.eyebrow")}
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {t("sdk.title")}
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-white/60">
            {t("sdk.description")}
          </p>

          {/* Install pili + copy mikro-ödülü */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Magnetic strength={8}>
              <button
                type="button"
                onClick={copyInstall}
                aria-label={t("sdk.copy")}
                className={cn(
                  "group flex items-center gap-3 rounded-full border border-white/[0.1] bg-white/[0.05] py-2.5 pr-3 pl-4",
                  "font-mono text-[13px] text-white/80 transition-colors hover:border-white/[0.22] hover:bg-white/[0.08]",
                )}
              >
                <span aria-hidden className="text-white/60">$</span>
                <span>{INSTALL_CMD}</span>
                <span
                  aria-hidden
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.08] text-white/60 transition-colors group-hover:text-white"
                >
                  <HugeiconsIcon
                    icon={copied ? Tick02Icon : Copy01Icon}
                    className={cn("h-3.5 w-3.5", copied && "text-emerald-300")}
                    strokeWidth={2}
                  />
                </span>
              </button>
            </Magnetic>
            {/* Kopyalandı duyurusu — ekran okuyucuya da gider */}
            <span aria-live="polite" className={cn("text-xs text-emerald-300/90 transition-opacity", copied ? "opacity-100" : "opacity-0")}>
              {copied ? t("sdk.copied") : ""}
            </span>
          </div>

          <p className="mt-6 text-sm text-white/60">
            {t("sdk.scaffoldNote")}{" "}
            <code className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-white/70">
              npm create sentroy-app
            </code>
          </p>

          <div className="mt-8">
            <Button
              variant="outline"
              className="gap-2 border-white/[0.14] bg-transparent text-white/80 hover:bg-white/[0.06] hover:text-white"
              render={<a href="/docs" />}
            >
              {t("sdk.docsCta")}
              <HugeiconsIcon icon={ArrowRight02Icon} className="h-4 w-4" strokeWidth={2} aria-hidden />
            </Button>
          </div>
        </div>

        {/* Sağ kolon — terminal penceresi (GlassPanel + Terminal.app kromu) */}
        <GlassPanel spotlight className="rounded-2xl">
          {/* Titlebar — WindowScene diliyle aynı traffic lights */}
          <div className="flex h-10 items-center gap-2.5 border-b border-white/[0.06] bg-white/[0.03] px-3.5">
            <div className="flex items-center gap-1.5" aria-hidden>
              <span className="h-3 w-3 rounded-full bg-[#ff5f57] ring-1 ring-black/20" />
              <span className="h-3 w-3 rounded-full bg-[#febc2e] ring-1 ring-black/20" />
              <span className="h-3 w-3 rounded-full bg-[#28c840] ring-1 ring-black/20" />
            </div>
            <span className="ml-1.5 truncate font-mono text-[11px] text-white/50">
              {t("sdk.terminalTitle")}
            </span>
          </div>

          {/* Gövde — koyu monospace; satırlar stagger reveal */}
          <div ref={bodyRef} className="min-h-[21rem] bg-black/45 p-5 font-mono text-[13px] leading-[1.7]">
            {TERMINAL_LINES.map((line, i) => (
              <motion.div
                key={i}
                initial={reducedMotion ? false : { opacity: 0, y: 4 }}
                animate={revealed || reducedMotion ? { opacity: 1, y: 0 } : undefined}
                transition={{ duration: 0.3, delay: reducedMotion ? 0 : i * 0.08, ease: "easeOut" }}
                className="whitespace-pre"
              >
                {line.length === 0 ? (
                  <span aria-hidden>&nbsp;</span>
                ) : (
                  line.map((tok, j) => (
                    <span key={j} className={tok.c}>
                      {tok.s}
                    </span>
                  ))
                )}
              </motion.div>
            ))}

            {/* Mikro-ödül satırı — install komutu kopyalanınca düşer */}
            <AnimatePresence>
              {installed && (
                <motion.div
                  initial={reducedMotion ? false : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 320, damping: 24 }}
                  className="whitespace-pre"
                >
                  <span className="text-emerald-300">✓ </span>
                  <span className="text-white/60">installed @sentroy-co/client-sdk</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Prompt + yanıp sönen imleç — görünür değilken paused (perf kuralı) */}
            <div className="mt-1 flex items-center" aria-hidden>
              <span className={TOK.pr}>$ </span>
              <span
                className="lv2-sdk-cursor ml-1 inline-block h-[1.1em] w-[0.55em] bg-white/70"
                style={{
                  animation: "lv2-sdk-blink 1s step-end infinite",
                  animationPlayState: onScreen ? "running" : "paused",
                }}
              />
            </div>
          </div>
        </GlassPanel>
      </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// PricingGlass — cam paneller + odometre fiyat kayması
// ═══════════════════════════════════════════════════════════════════════

interface PublicPlan {
  id: string
  name: Record<string, string> | string
  description: Record<string, string> | string
  price: number
  features: Array<Record<string, string> | string>
  monthlyEmailLimit: number
  storageLimit: number
  maxDomainsPerCompany: number
  maxMembersPerCompany: number
  isDefault: boolean
  isActive: boolean
}

interface PricingData {
  plans: PublicPlan[]
  pricingTitle?: Record<string, string>
  pricingSubtitle?: Record<string, string>
  showPricing: boolean
}

/** Tek rakam kolonu — 0-9 dikey stack, spring ile hedef rakama kayar. */
function OdometerDigit({ digit, reduced }: { digit: number; reduced: boolean }) {
  return (
    <span className="relative inline-block h-[1em] w-[1ch] overflow-hidden align-baseline">
      <motion.span
        className="absolute top-0 left-0 flex flex-col"
        initial={false}
        animate={{ y: `${-digit}em` }}
        transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 200, damping: 24, mass: 0.9 }}
      >
        {Array.from({ length: 10 }, (_, n) => (
          <span key={n} className="flex h-[1em] w-[1ch] items-center justify-center leading-none">
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  )
}

/**
 * Odometer — display string'inin rakamlarını kayan kolonlara böler.
 * Rakam kolonları SAĞDAN pozisyonla key'lenir: aylık→yıllık geçişte birler
 * basamağı aynı kolonda kalır, yeni basamaklar solda mount olur (mekanik his).
 * Rakam-dışı karakterler ($, binlik ayraç) statiktir.
 */
function Odometer({ value, reduced, className }: { value: string; reduced: boolean; className?: string }) {
  const cells = useMemo(() => {
    const chars = value.split("")
    // Sağdan rakam sayacı — kolon kimliği toggle boyunca sabit kalsın
    let digitFromRight = 0
    const out: Array<{ key: string; ch: string; isDigit: boolean }> = []
    for (let i = chars.length - 1; i >= 0; i--) {
      const ch = chars[i]
      const isDigit = /\d/.test(ch)
      out.unshift({
        key: isDigit ? `d-${digitFromRight}` : `s-${digitFromRight}-${ch}`,
        ch,
        isDigit,
      })
      if (isDigit) digitFromRight++
    }
    return out
  }, [value])

  return (
    <span aria-hidden className={cn("inline-flex items-baseline tabular-nums", className)}>
      {cells.map((c) =>
        c.isDigit ? (
          <OdometerDigit key={c.key} digit={Number(c.ch)} reduced={reduced} />
        ) : (
          <span key={c.key} className="inline-block leading-none">
            {c.ch}
          </span>
        ),
      )}
    </span>
  )
}

/** Plan özellik satırı — check ikonu + metin. */
function PlanFeature({ text }: { text: string }) {
  if (!text) return null
  return (
    <li className="flex items-start gap-2.5">
      <HugeiconsIcon
        icon={CheckmarkCircle02Icon}
        className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300/80"
        strokeWidth={2}
        aria-hidden
      />
      <span className="text-white/70">{text}</span>
    </li>
  )
}

export function PricingGlass() {
  const [data, setData] = useState<PricingData | null>(null)
  const [failed, setFailed] = useState(false)

  // Eski landing ile AYNI endpoint — /api/public/landing → data.plans + settings.
  useEffect(() => {
    let alive = true
    fetch("/api/public/landing")
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return
        const d = json?.data
        if (!d) {
          setFailed(true)
          return
        }
        setData({
          plans: Array.isArray(d.plans) ? d.plans : [],
          pricingTitle: d.settings?.pricingTitle,
          pricingSubtitle: d.settings?.pricingSubtitle,
          showPricing: d.settings?.showPricing !== false,
        })
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [])

  const plans = useMemo(
    () => (data?.plans ?? []).filter((p) => p.isActive !== false),
    [data],
  )

  // Veri yok / hata / admin kapattı → section sessizce gizlenir (görev kuralı).
  if (failed || !data || !data.showPricing || plans.length === 0) return null

  // ⚠ İçerik AYRI bileşende mount edilir: fetch'ten önce null döndüğümüz için
  // useInView hook'ları burada olsaydı ref'siz effect'e takılır, observer hiç
  // bağlanmaz ve kartlar sonsuza dek opacity:0'da kalırdı (canlıda görülen
  // "paketler gelmiyor" bug'ının kök nedeni).
  return <PricingSection data={data} plans={plans} />
}

function PricingSection({ data, plans }: { data: PricingData; plans: PublicPlan[] }) {
  const t = useTranslations("landingV2")
  const locale = useLocale()
  const { reducedMotion } = useMotionSafe()
  const [yearly, setYearly] = useState(false)

  const sectionRef = useRef<HTMLElement>(null)
  const revealed = useInView(sectionRef, { once: true, margin: "-10% 0px" })
  const onScreen = useInView(sectionRef)

  const hasPaid = plans.some((p) => p.price > 0)
  const title = loc(data.pricingTitle, locale) || t("pricing.title")
  const subtitle = loc(data.pricingSubtitle, locale) || t("pricing.subtitle")

  return (
    <section ref={sectionRef} id="pricing" className="relative mx-auto max-w-6xl px-6 py-28 lg:py-36">
      {/* Popüler kart halo dönüşü — transform-only, offscreen'de paused. */}
      <style>{`
        @keyframes lv2-pricing-spin { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .lv2-pricing-halo { animation: none !important; }
        }
      `}</style>

      <div className="mx-auto mb-12 max-w-2xl text-center">
        <p className="mb-3 text-xs font-semibold tracking-[0.18em] text-white/60 uppercase">
          {t("pricing.eyebrow")}
        </p>
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h2>
        <p className="mt-4 text-base leading-relaxed text-white/60">{subtitle}</p>
      </div>

      {/* Aylık / Yıllık toggle — layoutId pill highlight */}
      {hasPaid && (
        <div className="mb-12 flex justify-center">
          <div
            role="group"
            aria-label={t("pricing.billingAria")}
            className="relative flex rounded-full border border-white/[0.1] bg-white/[0.04] p-1"
          >
            {([false, true] as const).map((isYearly) => (
              <button
                key={String(isYearly)}
                type="button"
                aria-pressed={yearly === isYearly}
                onClick={() => setYearly(isYearly)}
                className={cn(
                  "relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                  yearly === isYearly ? "text-white" : "text-white/50 hover:text-white/75",
                )}
              >
                {yearly === isYearly && (
                  <motion.span
                    layoutId="lv2-billing-pill"
                    className="absolute inset-0 rounded-full bg-white/[0.12]"
                    transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }}
                    aria-hidden
                  />
                )}
                <span className="relative">{isYearly ? t("pricing.yearly") : t("pricing.monthly")}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        className={cn(
          "grid gap-6",
          plans.length === 1 && "mx-auto max-w-md",
          plans.length === 2 && "md:grid-cols-2",
          plans.length >= 3 && "md:grid-cols-2 lg:grid-cols-3",
          plans.length >= 4 && "lg:grid-cols-4",
        )}
      >
        {plans.map((plan, i) => {
          const name = loc(plan.name, locale)
          const description = loc(plan.description, locale)
          const isFree = plan.price === 0
          const amount = yearly ? plan.price * 12 : plan.price
          const display = `$${amount.toLocaleString(locale)}`
          const suffix = yearly ? t("pricing.perYear") : t("pricing.perMonth")

          return (
            <motion.div
              key={plan.id}
              initial={reducedMotion ? false : { opacity: 0, y: 24 }}
              animate={revealed || reducedMotion ? { opacity: 1, y: 0 } : undefined}
              transition={{ duration: 0.5, delay: reducedMotion ? 0 : i * 0.08, ease: [0.21, 0.47, 0.32, 0.98] }}
            >
              <GlassPanel
                className={cn(
                  "relative flex h-full flex-col gap-5 p-6",
                  plan.isDefault && "ring-1 ring-[#818cf8]/45",
                )}
              >
                {/* Popüler kart — 8s conic kenar ışıması (yalnız transform döner) */}
                {plan.isDefault && (
                  <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl opacity-50">
                    <div
                      className="lv2-pricing-halo absolute top-1/2 left-1/2 aspect-square w-[220%]"
                      style={{
                        background:
                          "conic-gradient(from 0deg, transparent 0deg, rgba(129,140,248,0.28) 40deg, transparent 95deg)",
                        animation: "lv2-pricing-spin 8s linear infinite",
                        animationPlayState: onScreen ? "running" : "paused",
                      }}
                    />
                  </div>
                )}

                {plan.isDefault && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#6366f1] px-3 py-0.5 text-xs font-semibold text-white shadow-lg">
                    {t("pricing.popular")}
                  </div>
                )}

                <div className="relative">
                  <h3 className="text-lg font-semibold text-white">{name}</h3>
                  {description && <p className="mt-1 text-sm text-white/55">{description}</p>}
                </div>

                {/* Fiyat — odometre; gerçek değer sr-only + aria-live */}
                <div className="relative flex items-baseline gap-1">
                  {isFree ? (
                    <span className="text-4xl font-bold tracking-tight text-white">
                      {t("pricing.free")}
                    </span>
                  ) : (
                    <>
                      <span aria-live="polite" className="sr-only">{`${display} ${suffix}`}</span>
                      <Odometer
                        value={display}
                        reduced={reducedMotion}
                        className="text-4xl font-bold tracking-tight text-white"
                      />
                      <span className="text-sm text-white/50" aria-hidden>
                        {suffix}
                      </span>
                    </>
                  )}
                </div>

                <ul className="relative flex flex-col gap-2.5 text-sm">
                  <PlanFeature
                    text={t("pricing.featEmails", {
                      count:
                        plan.monthlyEmailLimit < 0
                          ? t("pricing.unlimited")
                          : plan.monthlyEmailLimit.toLocaleString(locale),
                    })}
                  />
                  <PlanFeature
                    text={t("pricing.featStorage", {
                      value:
                        plan.storageLimit < 0
                          ? t("pricing.unlimited")
                          : formatStorage(plan.storageLimit, locale),
                    })}
                  />
                  <PlanFeature
                    text={t("pricing.featDomains", {
                      count:
                        plan.maxDomainsPerCompany < 0
                          ? t("pricing.unlimited")
                          : plan.maxDomainsPerCompany.toLocaleString(locale),
                    })}
                  />
                  <PlanFeature
                    text={t("pricing.featMembers", {
                      count:
                        plan.maxMembersPerCompany < 0
                          ? t("pricing.unlimited")
                          : plan.maxMembersPerCompany.toLocaleString(locale),
                    })}
                  />
                  {plan.features.map((feature, fi) => (
                    <PlanFeature key={fi} text={loc(feature, locale)} />
                  ))}
                </ul>

                <div className="relative mt-auto pt-2">
                  <Button
                    className={cn(
                      "w-full",
                      plan.isDefault
                        ? "bg-white text-black hover:bg-white/90"
                        : "border border-white/[0.14] bg-white/[0.04] text-white hover:bg-white/[0.1]",
                    )}
                    render={<a href={`/${locale}/signup`} />}
                  >
                    {isFree ? t("pricing.ctaFree") : t("pricing.cta")}
                  </Button>
                </div>
              </GlassPanel>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}
