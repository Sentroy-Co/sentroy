"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useRouter, usePathname } from "@workspace/auth/i18n/routing"
import { motion, useScroll } from "framer-motion"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  ShieldKeyIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { Logo } from "@workspace/console/components/shared/logo"
import { LanguageCombobox } from "@workspace/console/components/shared/language-combobox"
import { CodeBlock } from "@workspace/console/components/marketing"
import { cn } from "@workspace/ui/lib/utils"
import { ParallaxWallpaper } from "../landing/v2/primitives/parallax-wallpaper"
import { GlassPanel } from "../landing/v2/primitives/glass-panel"
import { TextReveal } from "../landing/v2/primitives/text-reveal"
import { Magnetic } from "../landing/v2/primitives/magnetic"
import { RevealEmail } from "../contact/reveal-email"

/**
 * /[lang]/investors — "SPECTRUM LEDGER": numaralı yatırım prospektüsü.
 * INK (koyu, aurora sızan) ↔ PAPER (opak sıcak-krem) blok alternasyonu +
 * bölüm başına aurora'nın gece→şafak geçişini süren aksan rengi + dev hairline
 * numaralar + 12 gerçek app ikonu tekrar eden "kadro" + el-yapımı data-viz.
 * Tüm metin `investors` i18n namespace'inden; kopya değişmez. RevealEmail
 * (Turnstile-gated) korunur. Dil seçici ortak flagless LanguageCombobox.
 */

const EASE = [0.21, 0.47, 0.32, 0.98] as const
const EASE_EXPO = [0.16, 1, 0.3, 1] as const
const LOCALES = ["en", "tr"] as const
const CONTACT_ANCHOR = "#contact"

type Tone = "ink" | "paper"

// İçerik app adı → gerçek ikon + marka rengi (products.ts / os-app-icons ile senkron).
const APP_ICONS: Record<string, { src?: string; color: string }> = {
  "Sentroy OS": { color: "#818cf8" }, // PNG yok → glyph
  Mail: { src: "/os-app-icons/mail.webp", color: "#3b82f6" },
  Storage: { src: "/os-app-icons/storage.webp", color: "#a855f7" },
  Auth: { src: "/os-app-icons/auth.webp", color: "#10b981" },
  Status: { src: "/os-app-icons/status.webp", color: "#06b6d4" },
  "WhatsApp Santral": { src: "/os-app-icons/whatsapp.webp", color: "#25d366" },
  Studio: { src: "/os-app-icons/studio.webp", color: "#ec4899" },
  Meet: { src: "/os-app-icons/meet.webp", color: "#0ea5e9" },
  OpenCut: { src: "/os-app-icons/opencut.webp", color: "#f97316" },
  "Linear Lite": { src: "/os-app-icons/linear.webp", color: "#5e6ad2" },
  Tools: { src: "/os-app-icons/tools.webp", color: "#6366f1" },
  "App Store": { src: "/os-app-icons/store.webp", color: "#f59e0b" },
}
/** Kadro sırası (dockSlot ile aynı ruh) — fleet-index + ribbon + footer. */
const FLEET_ORDER = [
  "Mail", "Storage", "Auth", "Status", "WhatsApp Santral", "Meet",
  "Studio", "OpenCut", "Linear Lite", "Tools", "App Store", "Sentroy OS",
]
const BRAND_HEXES = FLEET_ORDER.map((n) => APP_ICONS[n]?.color ?? "#818cf8")

interface Pt { title: string; body: string }

// ── küçük yardımcılar ────────────────────────────────────────────────────────

function renderText(s: string, tone: Tone = "ink"): ReactNode {
  const parts = s.split(/(\{\{[^}]+\}\})/g)
  return parts.map((p, i) => {
    const m = p.match(/^\{\{([^}]+)\}\}$/)
    if (!m) return p
    return (
      <span
        key={i}
        className={cn(
          "mx-0.5 rounded-md px-1.5 py-0.5 text-[0.9em] font-medium ring-1",
          tone === "paper"
            ? "bg-amber-500/15 text-amber-700 ring-amber-600/30"
            : "bg-amber-400/15 text-amber-300 ring-amber-400/30",
        )}
      >
        {m[1]}
      </span>
    )
  })
}

/** Gerçek app ikonu (PNG) ya da glyph (Sentroy OS). */
function AppIcon({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  const meta = APP_ICONS[name]
  if (!meta) return null
  if (meta.src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={meta.src}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        className={cn("object-contain", className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      className={cn("flex items-center justify-center rounded-[22%]", className)}
      style={{ width: size, height: size, background: `${meta.color}22`, color: meta.color }}
    >
      <HugeiconsIcon icon={ShieldKeyIcon} strokeWidth={2} style={{ width: size * 0.5, height: size * 0.5 }} />
    </span>
  )
}

function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-70px 0px" }}
      transition={{ duration: 0.55, delay, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/** mono §NN etiketi (aksan renkli blok işareti). */
function MonoLabel({ n, children, accent, tone }: { n?: string; children: ReactNode; accent: string; tone: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.26em]",
        tone === "paper" ? "text-[#0B0C10]/55" : "text-white/45",
      )}
    >
      {n ? <span style={{ color: accent }}>§{n}</span> : <span style={{ color: accent }}>▮</span>}
      {children}
    </span>
  )
}

// ── Chapter (INK/PAPER, aksan, dev numara, üst-kural wipe) ───────────────────

function Chapter({
  id, number, label, title, body, accent, tone, tentpole, children,
}: {
  id: string
  number: string
  label: string
  title?: string
  body?: string
  accent: string
  tone: Tone
  tentpole?: boolean
  children: ReactNode
}) {
  const paper = tone === "paper"
  // Koyu (INK) bloklar SAF SİYAH (#0A0A0A) — kahverengi/lacivert tint YOK.
  // Spektrum/aksan yalnız strip'lerde yaşar (üst-kural, dev numara, ledger tick).
  // PAPER blokları sıcak kremde kalır (kullanıcı yalnız koyu tonlardan şikâyetçiydi).
  const paperMix = tentpole ? 10 : 6
  return (
    <section
      id={id}
      className="relative scroll-mt-16 overflow-hidden"
      style={
        {
          background: paper
            ? `color-mix(in oklch, #F4F1EA, ${accent} ${paperMix}%)`
            : "#0A0A0A",
          ["--accent" as string]: accent,
        } as React.CSSProperties
      }
    >
      {/* tentpole için hafif aksan glow (tint yerine) */}
      {tentpole && !paper ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-0 h-80"
          style={{ background: `radial-gradient(120% 100% at 50% 0%, ${accent}1f, transparent 70%)` }}
        />
      ) : null}
      {/* üst hairline + aksan wipe kuralı */}
      <div className={cn("absolute inset-x-0 top-0 h-px", paper ? "bg-[#0B0C10]/12" : "bg-white/10")} />
      <motion.div
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, margin: "-10% 0px" }}
        transition={{ duration: 0.9, ease: EASE_EXPO }}
        style={{ background: accent, transformOrigin: "left" }}
        className="absolute inset-x-0 top-0 h-[2px]"
      />
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-24 sm:py-28">
        {/* dev hairline numara + §NN */}
        <div className="pointer-events-none absolute right-2 top-6 select-none sm:right-6">
          <span
            className="font-mono font-bold leading-none"
            style={{
              fontSize: "clamp(6rem,16vw,13rem)",
              WebkitTextStroke: `1.5px ${accent}`,
              color: "transparent",
              opacity: 0.5,
            }}
          >
            {number}
          </span>
        </div>
        <Reveal>
          <MonoLabel n={number} accent={accent} tone={tone}>{label}</MonoLabel>
          {title ? (
            <h2
              className={cn(
                "mt-4 max-w-4xl font-semibold tracking-tight",
                paper ? "text-[#0B0C10]" : "text-[#F4F1EA]",
              )}
              style={{ fontSize: "clamp(2.25rem,6vw,4.75rem)", lineHeight: 0.98, letterSpacing: "-0.02em" }}
            >
              {renderText(title, tone)}
            </h2>
          ) : null}
          {body ? (
            <p
              className={cn(
                "mt-5 max-w-[62ch] text-[17px] leading-[1.62] sm:text-[19px]",
                paper ? "text-[#0B0C10]/62" : "text-white/62",
              )}
            >
              {renderText(body, tone)}
            </p>
          ) : null}
        </Reveal>
        <div className="relative mt-12">{children}</div>
      </div>
    </section>
  )
}

/** Tam-genişlik ruled ledger satırı. */
function LedgerRow({
  index, icon, title, body, accent, tone, delay = 0,
}: {
  index?: string
  icon?: string
  title: string
  body: string
  accent: string
  tone: Tone
  delay?: number
}) {
  const paper = tone === "paper"
  return (
    <Reveal delay={delay}>
      <div
        className={cn(
          "group grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 border-b py-5 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1.1fr)]",
          paper ? "border-[#0B0C10]/12" : "border-white/10",
        )}
      >
        <div className="flex items-center gap-3">
          <span className="h-4 w-[3px] rounded-full" style={{ background: accent }} />
          {icon ? (
            <AppIcon name={icon} size={26} />
          ) : (
            <span className={cn("font-mono text-sm tabular-nums", paper ? "text-[#0B0C10]/50" : "text-white/45")}>{index}</span>
          )}
        </div>
        <h3 className={cn("self-center text-lg font-semibold tracking-tight sm:text-xl", paper ? "text-[#0B0C10]" : "text-[#F4F1EA]")}>
          {renderText(title, tone)}
        </h3>
        <p className={cn("col-span-2 text-[15px] leading-relaxed sm:col-span-1", paper ? "text-[#0B0C10]/62" : "text-white/55")}>
          {renderText(body, tone)}
        </p>
      </div>
    </Reveal>
  )
}

/** Hairline çerçeveli data-viz konteyneri (yatay scroll güvenli). */
function Exhibit({ label, caption, tone, children }: { label: string; caption?: string; tone: Tone; children: ReactNode }) {
  const paper = tone === "paper"
  return (
    <Reveal>
      <figure className={cn("rounded-xl border p-5 sm:p-7", paper ? "border-[#0B0C10]/12 bg-[#0B0C10]/[0.02]" : "border-white/10 bg-white/[0.02]")}>
        <figcaption className={cn("mb-5 font-mono text-[11px] uppercase tracking-[0.26em]", paper ? "text-[#0B0C10]/50" : "text-white/45")}>
          {label}
        </figcaption>
        <div className="overflow-x-auto">{children}</div>
        {caption ? (
          <p className={cn("mt-5 font-mono text-[10px] uppercase tracking-[0.2em]", paper ? "text-[#0B0C10]/40" : "text-white/35")}>{caption}</p>
        ) : null}
      </figure>
    </Reveal>
  )
}

/** 12 marka-renkli segment ribbon. */
function SpectrumRibbon({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-1.5 w-full overflow-hidden rounded-full", className)}>
      {BRAND_HEXES.map((hex, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0.2 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.03, duration: 0.4 }}
          className="h-full flex-1"
          style={{ background: hex }}
        />
      ))}
    </div>
  )
}

// ── Nav (flagless LanguageCombobox + section index + progress) ───────────────

function InvestorNav({ lang, t }: { lang: string; t: ReturnType<typeof useTranslations> }) {
  const router = useRouter()
  const pathname = usePathname()
  const { scrollYProgress } = useScroll()
  const items = [
    { id: "thesis", label: t("nav.thesis"), n: "01" },
    { id: "product", label: t("nav.product"), n: "04" },
    { id: "market", label: t("nav.market"), n: "06" },
    { id: "growth", label: t("nav.growth"), n: "08" },
    { id: "swot", label: t("nav.swot"), n: "10" },
    { id: "ask", label: t("nav.ask"), n: "12" },
  ]
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0A0A0A]/75 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-6">
        <Link href={`/${lang}`} className="flex items-center gap-2">
          <Logo size="md" />
        </Link>
        <span className="hidden font-mono text-[11px] uppercase tracking-[0.26em] text-white/35 sm:inline">
          / {t("nav.tag")}
        </span>
        <nav className="ml-auto hidden items-center gap-5 xl:flex">
          {items.map((it) => (
            <a key={it.id} href={`#${it.id}`} className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/50 transition-colors hover:text-white">
              <span className="text-indigo-300/80">§{it.n}</span> {it.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 xl:ml-6">
          <LanguageCombobox
            current={lang}
            locales={LOCALES}
            onSelect={(l) => router.replace(pathname, { locale: l as (typeof LOCALES)[number] })}
            className="border-white/15 bg-white/[0.04] text-white/80 hover:bg-white/[0.08]"
          />
          <a href={CONTACT_ANCHOR} className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-white/80 transition-colors hover:border-white/30 hover:text-white">
            {t("nav.contact")}
          </a>
        </div>
      </div>
      <motion.div style={{ scaleX: scrollYProgress, transformOrigin: "left" }} className="h-[2px] bg-gradient-to-r from-indigo-400 via-cyan-400 to-amber-400" />
    </header>
  )
}

// ── data-viz exhibits ────────────────────────────────────────────────────────

const MARKET_CATEGORIES = [
  { label: "Identity", icon: "Auth", hex: "#10b981" },
  { label: "Storage & CDN", icon: "Storage", hex: "#a855f7" },
  { label: "Email", icon: "Mail", hex: "#3b82f6" },
  { label: "Messaging", icon: "WhatsApp Santral", hex: "#25d366" },
  { label: "Status", icon: "Status", hex: "#06b6d4" },
  { label: "Video", icon: "Meet", hex: "#0ea5e9" },
  { label: "Issues", icon: "Linear Lite", hex: "#5e6ad2" },
  { label: "Media", icon: "Studio", hex: "#ec4899" },
]

function MarketBar() {
  return (
    <div className="min-w-[560px]">
      <div className="flex h-14 w-full overflow-hidden rounded-lg">
        {MARKET_CATEGORIES.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.06, duration: 0.5, ease: EASE_EXPO }}
            style={{ background: `${c.hex}22`, borderRight: "1px solid rgba(11,12,16,0.12)", transformOrigin: "left" }}
            className="flex flex-1 items-center justify-center"
          >
            <span className="h-2 w-2 rounded-full" style={{ background: c.hex }} />
          </motion.div>
        ))}
      </div>
      <div className="mt-3 flex w-full">
        {MARKET_CATEGORIES.map((c) => (
          <div key={c.label} className="flex flex-1 flex-col items-center gap-1 px-1 text-center">
            <AppIcon name={c.icon} size={20} />
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#0B0C10]/55">{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RevenueStack({ streams }: { streams: { name: string; desc: string }[] }) {
  // 4 katman: alttan (recurring) yukarı; en üst = ghost (yarın)
  const tones = ["#10b981", "#a855f7", "#f59e0b", "#5e6ad2"]
  return (
    <div className="flex min-w-[520px] flex-col-reverse gap-2">
      {streams.slice(0, 4).map((s, i) => {
        const ghost = i === streams.length - 1 || i === 3
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, scaleX: 0.9 }}
            whileInView={{ opacity: 1, scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08, duration: 0.5, ease: EASE_EXPO }}
            style={{
              transformOrigin: "left",
              background: ghost ? "transparent" : `${tones[i]}1f`,
              border: ghost ? `1.5px dashed ${tones[i]}88` : `1px solid ${tones[i]}55`,
            }}
            className="flex items-center gap-3 rounded-lg px-4 py-3"
          >
            <span className="font-mono text-xs tabular-nums text-white/40">{String(i + 1).padStart(2, "0")}</span>
            <span className="text-sm font-semibold text-[#F4F1EA]">{s.name}</span>
            <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">
              {ghost ? "TOMORROW" : "TODAY"}
            </span>
          </motion.div>
        )
      })}
    </div>
  )
}

function GrowthTimeline({ phases }: { phases: { when: string; title: string; body: string }[] }) {
  const nodeHexes = ["#818cf8", "#06b6d4", "#6366f1", "#f59e0b", "#f97316"]
  return (
    <div className="flex min-w-[640px] gap-4">
      {phases.map((p, i) => {
        const active = i <= 1 // ilk iki faz shipped/momentum
        const hex = nodeHexes[i % nodeHexes.length]
        return (
          <Reveal key={i} delay={i * 0.08} className="relative flex-1">
            {i < phases.length - 1 ? (
              <span className="absolute left-[calc(50%+14px)] right-[-14px] top-3 h-px" style={{ background: active ? hex : "rgba(255,255,255,0.14)" }} />
            ) : null}
            <span
              className="relative z-10 flex size-7 items-center justify-center rounded-full"
              style={active ? { background: hex } : { border: `1.5px solid ${hex}`, background: "transparent" }}
            >
              {active ? <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-black/80" strokeWidth={2.5} /> : null}
            </span>
            {i === 1 ? (
              <span className="mt-2 inline-block font-mono text-[9px] uppercase tracking-[0.2em]" style={{ color: hex }}>▸ You are here</span>
            ) : null}
            <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">{renderText(p.when)}</div>
            <h4 className="mt-1 text-base font-semibold text-[#F4F1EA]">{renderText(p.title)}</h4>
            <p className="mt-1 text-[13px] leading-relaxed text-white/55">{renderText(p.body)}</p>
          </Reveal>
        )
      })}
    </div>
  )
}

function SwotMatrix({ t, raw }: { t: ReturnType<typeof useTranslations>; raw: <T>(k: string) => T }) {
  const quads = [
    { key: "strengths", label: t("swot.strengthsLabel"), hex: "#10b981", filled: true },
    { key: "opportunities", label: t("swot.opportunitiesLabel"), hex: "#0ea5e9", filled: true },
    { key: "weaknesses", label: t("swot.weaknessesLabel"), hex: "#f59e0b", filled: false },
    { key: "threats", label: t("swot.threatsLabel"), hex: "#fb7185", filled: false },
  ]
  return (
    <div className="grid min-w-[560px] grid-cols-2 gap-3">
      {quads.map((q, qi) => {
        const items = raw<Pt[]>(`swot.${q.key}`) || []
        return (
          <Reveal key={q.key} delay={qi * 0.07}>
            <div
              className="h-full rounded-lg border p-5"
              style={{ borderColor: `${q.hex}44`, background: `${q.hex}${q.filled ? "12" : "0a"}` }}
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={q.filled ? { background: q.hex } : { border: `1.5px solid ${q.hex}` }} />
                <span className="font-mono text-[11px] uppercase tracking-[0.22em]" style={{ color: q.hex }}>{q.label}</span>
              </div>
              <ul className="space-y-2.5">
                {items.map((it, i) => (
                  <li key={i} className="text-sm leading-relaxed">
                    <span className="font-medium text-[#F4F1EA]">{renderText(it.title)}</span>
                    <span className="text-white/50"> — {renderText(it.body)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        )
      })}
    </div>
  )
}

function UseOfFundsBar({ funds }: { funds: { area: string; desc: string }[] }) {
  const shades = ["#f59e0b", "#fbbf24", "#f97316", "#eab308"]
  return (
    <div className="min-w-[520px]">
      <div className="flex h-12 w-full overflow-hidden rounded-lg">
        {funds.map((f, i) => (
          <motion.div
            key={i}
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08, duration: 0.5, ease: EASE_EXPO }}
            style={{ background: `${shades[i % shades.length]}33`, borderRight: "1px solid rgba(255,255,255,0.08)", transformOrigin: "left" }}
            className="flex flex-1 items-center justify-center"
          >
            <span className="font-mono text-[10px] tabular-nums text-white/50">{String(i + 1).padStart(2, "0")}</span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

// ── Hero fleet index ─────────────────────────────────────────────────────────

function FleetIndex() {
  return (
    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/5 sm:grid-cols-4 lg:grid-cols-6">
      {FLEET_ORDER.map((name, i) => (
        <motion.div
          key={name}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 + i * 0.05, duration: 0.4, ease: EASE }}
          className="group flex flex-col items-center gap-2 bg-[#0A0A0A]/80 px-2 py-4"
        >
          <AppIcon name={name} size={40} />
          <span className="h-[2px] w-6 rounded-full transition-all group-hover:w-9" style={{ background: APP_ICONS[name]?.color }} />
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/45">{name.split(" ")[0]}</span>
        </motion.div>
      ))}
    </div>
  )
}

// ── ana bileşen ──────────────────────────────────────────────────────────────

export function InvestorsPage({ lang }: { lang: string }) {
  const t = useTranslations("investors")
  const raw = <T,>(key: string): T => t.raw(key) as T

  useEffect(() => {
    const el = document.documentElement
    const prev = el.style.scrollBehavior
    el.style.scrollBehavior = "smooth"
    return () => {
      el.style.scrollBehavior = prev
    }
  }, [])

  const [flooded, setFlooded] = useState<string | null>(null)

  return (
    <div className="lv2-root dark relative min-h-screen bg-[#0A0A0A] text-white antialiased">
      <style>{`.lv2-root ::selection{background:rgba(99,102,241,0.85);color:#fff;-webkit-text-fill-color:#fff;}`}</style>
      <ParallaxWallpaper />
      <InvestorNav lang={lang} t={t} />

      <main className="relative">
        {/* ── 00 HERO — INK tentpole ── */}
        <section id="hero" className="relative overflow-hidden px-6 pb-24 pt-16 sm:pt-20" style={{ background: "#0A0A0A" }}>
          <div className="pointer-events-none absolute left-1/2 top-0 -z-0 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(129,140,248,0.22),transparent_72%)] blur-2xl" />
          <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
            <div>
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
                <MonoLabel accent="#818cf8" tone="ink">
                  {t("hero.eyebrow")}
                </MonoLabel>
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.08, ease: EASE }}
                className="mt-5 font-extrabold tracking-tight text-[#F4F1EA]"
                style={{ fontSize: "clamp(2.6rem,7vw,6.5rem)", lineHeight: 0.94, letterSpacing: "-0.035em" }}
              >
                <HeroTitle text={t("hero.title")} />
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.16, ease: EASE }}
                className="mt-6 max-w-xl text-lg leading-relaxed text-white/60"
              >
                {t("hero.subtitle")}
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.24, ease: EASE }}
                className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center"
              >
                <Magnetic>
                  <a
                    href={`https://sentroy.com/${lang}`}
                    className="inline-flex items-center gap-2 rounded-full bg-[#F4F1EA] px-8 py-4 text-base font-semibold text-black shadow-[0_8px_40px_-10px_rgba(255,255,255,0.4)] transition-shadow hover:shadow-[0_10px_48px_-8px_rgba(255,255,255,0.55)] active:scale-[0.97]"
                  >
                    {t("hero.ctaPrimary")}
                    <HugeiconsIcon icon={ArrowRight01Icon} className="size-5" strokeWidth={2} />
                  </a>
                </Magnetic>
                <a href="#thesis" className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-8 py-4 text-base text-white/75 transition-colors hover:border-white/30 hover:text-white">
                  {t("hero.ctaSecondary")}
                  <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 rotate-90" strokeWidth={2} />
                </a>
              </motion.div>
            </div>
            <div>
              <FleetIndex />
              <div className="mt-4 overflow-hidden">
                <div className="flex whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.2em] text-white/35 [animation:lv2-inv-ticker_30s_linear_infinite] motion-reduce:[animation:none]">
                  {[...FLEET_ORDER, ...FLEET_ORDER].map((n, i) => (
                    <span key={i} className="mx-3 inline-flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full" style={{ background: APP_ICONS[n]?.color }} />
                      {n.split(" ")[0]}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <span className="pointer-events-none absolute -right-2 bottom-2 select-none font-mono font-bold leading-none" style={{ fontSize: "clamp(6rem,18vw,15rem)", WebkitTextStroke: "1.5px #818cf8", color: "transparent", opacity: 0.28 }}>00</span>
          <style>{`@keyframes lv2-inv-ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
        </section>

        {/* ── 01 THESIS — PAPER ── */}
        <Chapter id="thesis" number="01" label={t("thesis.label")} accent="#0ea5e9" tone="paper">
          <TextReveal
            text={t("thesis.title")}
            className="mb-8 max-w-4xl text-[#0B0C10] [font-size:clamp(1.75rem,4.5vw,3.25rem)] [font-weight:700] [line-height:1.12] [letter-spacing:-0.02em]"
          />
          <p className="mb-10 max-w-[62ch] text-[17px] leading-[1.62] text-[#0B0C10]/62 sm:text-[19px]">
            <span className="float-left mr-2 font-extrabold text-[#0ea5e9]" style={{ fontSize: "3.1rem", lineHeight: 0.8 }}>
              {t("thesis.body").charAt(0)}
            </span>
            {t("thesis.body").slice(1)}
          </p>
          <div>
            {raw<Pt[]>("thesis.points").map((p, i) => (
              <LedgerRow key={i} index={String(i + 1).padStart(2, "0")} title={p.title} body={p.body} accent="#0ea5e9" tone="paper" delay={i * 0.04} />
            ))}
          </div>
        </Chapter>

        {/* ── 02 PROBLEM — INK cold slate + rose ── */}
        <Chapter id="problem" number="02" label={t("problem.label")} title={t("problem.title")} body={t("problem.body")} accent="#fb7185" tone="ink">
          <div className="mb-8 flex flex-wrap gap-2">
            {["identity", "storage", "email", "billing", "messaging", "status", "video", "issues"].map((c, i) => (
              <motion.span
                key={c}
                initial={{ opacity: 0, rotate: 0 }}
                whileInView={{ opacity: 1, rotate: (i % 2 ? 1 : -1) * (2 + (i % 4)) }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05, duration: 0.4 }}
                className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-white/50"
              >
                {c}
              </motion.span>
            ))}
          </div>
          <div>
            {raw<Pt[]>("problem.points").map((p, i) => (
              <LedgerRow key={i} index={String(i + 1).padStart(2, "0")} title={p.title} body={p.body} accent="#fb7185" tone="ink" delay={i * 0.04} />
            ))}
          </div>
        </Chapter>

        {/* ── 03 SOLUTION — PAPER emerald ── */}
        <Chapter id="solution" number="03" label={t("solution.label")} title={t("solution.title")} body={t("solution.body")} accent="#10b981" tone="paper">
          <Reveal className="mb-10 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/android-chrome-512x512.png"
              alt="Sentroy"
              className="size-20 rounded-2xl shadow-lg ring-1 ring-[#10b981]/40"
            />
          </Reveal>
          <div>
            {raw<Pt[]>("solution.points").map((p, i) => (
              <LedgerRow key={i} index={String(i + 1).padStart(2, "0")} title={p.title} body={p.body} accent="#10b981" tone="paper" delay={i * 0.04} />
            ))}
          </div>
        </Chapter>

        {/* ── 04 PRODUCT — INK tentpole, full spectrum ── */}
        <Chapter id="product" number="04" label={t("product.label")} title={t("product.title")} body={t("product.body")} accent="#818cf8" tone="ink" tentpole>
          <Reveal className="mb-10"><SpectrumRibbon /></Reveal>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/5 sm:grid-cols-2 lg:grid-cols-3">
            {raw<{ name: string; tagline: string }[]>("product.apps").map((app) => {
              const color = APP_ICONS[app.name]?.color ?? "#818cf8"
              const on = flooded === app.name
              return (
                <motion.div
                  key={app.name}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px 0px" }}
                  transition={{ duration: 0.45, ease: EASE }}
                  onMouseEnter={() => setFlooded(app.name)}
                  onMouseLeave={() => setFlooded((v) => (v === app.name ? null : v))}
                  className="relative flex flex-col gap-3 p-6 transition-colors"
                  style={{ background: on ? `${color}18` : "#0A0A0A", borderLeft: `3px solid ${color}` }}
                >
                  <AppIcon name={app.name} size={52} />
                  <h3 className="text-lg font-bold tracking-tight text-[#F4F1EA]">{app.name}</h3>
                  <p className="text-sm leading-relaxed text-white/55">{app.tagline}</p>
                </motion.div>
              )
            })}
          </div>
        </Chapter>

        {/* ── 05 DEVELOPER — INK ── */}
        <Chapter id="developer" number="05" label={t("developer.label")} title={t("developer.title")} body={t("developer.body")} accent="#3b82f6" tone="ink">
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
            <div>
              <div className="mb-5 flex flex-wrap gap-2">
                {["TypeScript", "Go", "Python", "PHP"].map((l) => (
                  <span key={l} className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-white/55">{l}</span>
                ))}
              </div>
              {raw<Pt[]>("developer.points").map((p, i) => (
                <LedgerRow key={i} index={String(i + 1).padStart(2, "0")} title={p.title} body={p.body} accent="#3b82f6" tone="ink" delay={i * 0.04} />
              ))}
            </div>
            <Reveal delay={0.1} className="flex flex-col gap-3">
              <GlassPanel className="p-3"><CodeBlock language="bash" filename="FIG. 05a" code={t("developer.scaffoldCmd")} /></GlassPanel>
              <GlassPanel className="p-3"><CodeBlock language="ts" filename="FIG. 05b" code={t("developer.sdkSnippet")} /></GlassPanel>
            </Reveal>
          </div>
        </Chapter>

        {/* ── 06 MARKET — PAPER cyan ── */}
        <Chapter id="market" number="06" label={t("market.label")} title={t("market.title")} body={t("market.body")} accent="#06b6d4" tone="paper">
          <Exhibit label="Exhibit 06 — Market composition" caption="Illustrative composition — not a bottom-up TAM claim" tone="paper">
            <MarketBar />
          </Exhibit>
          <div className="mt-8">
            {raw<Pt[]>("market.points").map((p, i) => (
              <LedgerRow key={i} index={String(i + 1).padStart(2, "0")} title={p.title} body={p.body} accent="#06b6d4" tone="paper" delay={i * 0.04} />
            ))}
          </div>
        </Chapter>

        {/* ── 07 MODEL — INK ── */}
        <Chapter id="model" number="07" label={t("model.label")} title={t("model.title")} body={t("model.body")} accent="#a855f7" tone="ink">
          <Exhibit label="Exhibit 07 — Revenue layers" caption="Today → tomorrow — indicative, not to scale" tone="ink">
            <RevenueStack streams={raw<{ name: string; desc: string }[]>("model.streams")} />
          </Exhibit>
          <div className="mt-8">
            {raw<{ name: string; desc: string }[]>("model.streams").map((s, i) => (
              <LedgerRow key={i} index={String(i + 1).padStart(2, "0")} title={s.name} body={s.desc} accent="#a855f7" tone="ink" delay={i * 0.04} />
            ))}
          </div>
        </Chapter>

        {/* ── 08 GROWTH — INK full-bleed ── */}
        <Chapter id="growth" number="08" label={t("growth.label")} title={t("growth.title")} body={t("growth.body")} accent="#06b6d4" tone="ink">
          <Exhibit label="Exhibit 08 — Plan of record" tone="ink">
            <GrowthTimeline phases={raw<{ when: string; title: string; body: string }[]>("growth.phases")} />
          </Exhibit>
        </Chapter>

        {/* ── 09 SCALABILITY — PAPER ── */}
        <Chapter id="scalability" number="09" label={t("scalability.label")} title={t("scalability.title")} body={t("scalability.body")} accent="#6366f1" tone="paper">
          <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
            {raw<Pt[]>("scalability.points").map((p, i) => (
              <Reveal key={i} delay={(i % 2) * 0.05}>
                <div className="border-b border-[#0B0C10]/12 py-5">
                  <h3 className="font-mono text-[13px] uppercase tracking-[0.18em] text-[#6366f1]">{renderText(p.title, "paper")}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-[#0B0C10]/62">{renderText(p.body, "paper")}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Chapter>

        {/* ── 10 SWOT — INK ── */}
        <Chapter id="swot" number="10" label={t("swot.label")} title={t("swot.title")} accent="#0ea5e9" tone="ink">
          <Exhibit label="Exhibit 10 — SWOT matrix" tone="ink">
            <SwotMatrix t={t} raw={raw} />
          </Exhibit>
        </Chapter>

        {/* ── 11 TRACTION — PAPER live green ── */}
        <Chapter id="traction" number="11" label={t("traction.label")} title={t("traction.title")} body={t("traction.body")} accent="#25d366" tone="paper">
          <Reveal className="mb-8 flex flex-wrap items-center gap-6">
            <div>
              <div className="font-mono text-4xl font-bold tabular-nums text-[#0B0C10]">12<span className="text-[#0B0C10]/40">/12</span></div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#0B0C10]/50">Products live</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {FLEET_ORDER.map((n) => <AppIcon key={n} name={n} size={30} />)}
            </div>
          </Reveal>
          <div>
            {raw<Pt[]>("traction.points").map((p, i) => (
              <Reveal key={i} delay={i * 0.04}>
                <div className="flex items-start gap-3 border-b border-[#0B0C10]/12 py-5">
                  <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#25d366]">
                    <HugeiconsIcon icon={Tick02Icon} className="size-3 text-white" strokeWidth={3} />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-[#0B0C10]">{renderText(p.title, "paper")}</h3>
                    <p className="mt-1 text-[15px] leading-relaxed text-[#0B0C10]/62">{renderText(p.body, "paper")}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </Chapter>

        {/* ── 12 ASK — INK tentpole, dawn amber ── */}
        <Chapter id="ask" number="12" label={t("ask.label")} title={t("ask.title")} body={t("ask.body")} accent="#f59e0b" tone="ink" tentpole>
          <Exhibit label="Exhibit 12 — Indicative allocation" tone="ink">
            <UseOfFundsBar funds={raw<{ area: string; desc: string }[]>("ask.useOfFunds")} />
          </Exhibit>
          <div className="mt-8">
            {raw<{ area: string; desc: string }[]>("ask.useOfFunds").map((u, i) => (
              <LedgerRow key={i} index={String(i + 1).padStart(2, "0")} title={u.area} body={u.desc} accent="#f59e0b" tone="ink" delay={i * 0.04} />
            ))}
          </div>
          <Reveal delay={0.1}>
            <GlassPanel className="mt-10 p-6 sm:p-8">
              <p className="text-lg leading-relaxed text-[#F4F1EA]">{renderText(t("ask.closing"))}</p>
            </GlassPanel>
          </Reveal>
        </Chapter>

        {/* ── 13 CLOSING — INK bookend ── */}
        <section id="contact" className="relative overflow-hidden px-6 py-28 text-center" style={{ background: "#0A0A0A" }}>
          <div className="mx-auto max-w-2xl">
            <Reveal>
              <h2 className="text-3xl font-semibold tracking-tight text-[#F4F1EA] sm:text-5xl">{renderText(t("closing.title"))}</h2>
              <p className="mt-4 text-lg leading-relaxed text-white/60">{renderText(t("closing.body"))}</p>
              <div className="mx-auto mt-8 max-w-sm"><SpectrumRibbon /></div>
              <div className="mt-8 flex justify-center">
                <Magnetic><RevealEmail tone="dark" /></Magnetic>
              </div>
              <p className="mt-10 font-mono text-[10px] uppercase tracking-[0.28em] text-white/30">End of prospectus · Sentroy 2026</p>
            </Reveal>
          </div>
        </section>
      </main>

      {/* ── FOOTER (colophon) ── */}
      <footer className="border-t border-white/10 bg-[#0A0A0A] px-6 py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo size="sm" />
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">{t("footer.tagline")}</span>
          </div>
          <div className="flex items-center gap-5 text-sm text-white/45">
            <Link href={`/${lang}`} className="transition-colors hover:text-white">{t("footer.home")}</Link>
            <a href="https://sentroy.com/docs" className="inline-flex items-center gap-1 transition-colors hover:text-white">
              {t("footer.docs")}
              <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3.5" strokeWidth={2} />
            </a>
            <Link href={`/${lang}/contact`} className="transition-colors hover:text-white">{t("nav.contact")}</Link>
          </div>
        </div>
        <div className="mx-auto mt-6 flex w-full max-w-6xl items-center gap-1.5">
          {BRAND_HEXES.map((hex, i) => <span key={i} className="h-1 flex-1 rounded-full opacity-60" style={{ background: hex }} />)}
        </div>
        <p className="mx-auto mt-4 w-full max-w-6xl font-mono text-[10px] uppercase tracking-[0.18em] text-white/25">{renderText(t("footer.copyright"))}</p>
      </footer>
    </div>
  )
}

/** Hero başlığı — ilk cümle normal, ikinci (vuruş) cümlesi aksan işaretli. */
function HeroTitle({ text }: { text: string }) {
  const dot = text.indexOf(". ")
  if (dot === -1) return <>{text}</>
  const first = text.slice(0, dot + 1)
  const second = text.slice(dot + 2)
  return (
    <>
      {first}{" "}
      <span className="relative inline">
        <span className="relative z-10">{second}</span>
        <span className="absolute inset-x-[-0.1em] bottom-[0.08em] -z-0 h-[0.32em] bg-[#818cf8]/35" />
      </span>
    </>
  )
}
