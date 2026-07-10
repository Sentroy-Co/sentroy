"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import { useRouter, usePathname } from "@workspace/auth/i18n/routing"
import { motion } from "framer-motion"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { Logo } from "@workspace/console/components/shared/logo"
import { LanguageCombobox } from "@workspace/console/components/shared/language-combobox"
import { ParallaxWallpaper } from "../landing/v2/primitives/parallax-wallpaper"
import { GlassPanel } from "../landing/v2/primitives/glass-panel"
import { TextReveal } from "../landing/v2/primitives/text-reveal"
import { Magnetic } from "../landing/v2/primitives/magnetic"

/**
 * /[lang]/vision — Sentroy misyon & vizyon sayfası. Dark aurora kabuk +
 * TextReveal misyon ifadesi + vizyon + ilkeler. Kurumsal Red aksanı. Public.
 */

const RED = "#FF1744"
const LOCALES = ["en", "tr"] as const
const EASE = [0.21, 0.47, 0.32, 0.98] as const

interface Principle { title: string; body: string }

export function VisionPage({ lang }: { lang: string }) {
  const t = useTranslations("vision")
  const router = useRouter()
  const pathname = usePathname()
  const principles = t.raw("principles") as Principle[]

  return (
    <div className="lv2-root dark relative min-h-screen bg-[#0A0A0A] text-white antialiased">
      <style>{`.lv2-root ::selection{background:rgba(255,23,68,0.85);color:#fff;-webkit-text-fill-color:#fff;}`}</style>
      <ParallaxWallpaper />

      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0A0A0A]/75 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-6">
          <Link href={`/${lang}`} className="flex items-center gap-2">
            <Logo size="md" />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <LanguageCombobox
              current={lang}
              locales={LOCALES}
              onSelect={(l) => router.replace(pathname, { locale: l as (typeof LOCALES)[number] })}
              className="border-white/15 bg-white/[0.04] text-white/80 hover:bg-white/[0.08]"
            />
            <Link href={`/${lang}`} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-1.5 text-sm text-white/80 transition-colors hover:border-white/30 hover:text-white">
              <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" strokeWidth={2} />
              {t("back")}
            </Link>
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-5xl px-6">
        {/* Mission */}
        <section className="relative overflow-hidden py-28 sm:py-36">
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 -z-0 h-[420px] w-[760px] -translate-x-1/2 rounded-full blur-3xl" style={{ background: `radial-gradient(closest-side, ${RED}26, transparent 72%)` }} />
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.28em] text-white/45"
          >
            <span className="size-1.5 rounded-full" style={{ background: RED }} />
            {t("eyebrow")}
          </motion.span>
          <p className="mt-6 font-mono text-xs uppercase tracking-[0.24em]" style={{ color: RED }}>{t("missionLabel")}</p>
          <TextReveal
            text={t("mission")}
            className="mt-4 max-w-4xl text-3xl font-semibold leading-[1.18] tracking-tight text-white sm:text-4xl lg:text-5xl"
          />
        </section>

        {/* Vision */}
        <section className="border-t border-white/10 py-24">
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-70px 0px" }} transition={{ duration: 0.6, ease: EASE }}>
            <p className="font-mono text-xs uppercase tracking-[0.24em]" style={{ color: RED }}>{t("visionLabel")}</p>
            <p className="mt-4 max-w-3xl text-2xl leading-[1.4] text-white/80 sm:text-3xl">{t("vision")}</p>
          </motion.div>
        </section>

        {/* Principles */}
        <section className="border-t border-white/10 py-24">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-white/45">{t("principlesLabel")}</p>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {principles.map((p, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px 0px" }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: EASE }}
              >
                <GlassPanel className="h-full p-6">
                  <span className="font-mono text-sm tabular-nums" style={{ color: RED }}>{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="mt-3 text-lg font-semibold text-white">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/55">{p.body}</p>
                </GlassPanel>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-white/10 py-24 text-center">
          <Magnetic>
            <a
              href={`https://sentroy.com/${lang}`}
              className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-semibold text-black shadow-[0_8px_40px_-10px_rgba(255,255,255,0.4)] transition-shadow hover:shadow-[0_10px_48px_-8px_rgba(255,255,255,0.55)] active:scale-[0.97]"
            >
              {t("cta")}
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-5" strokeWidth={2} />
            </a>
          </Magnetic>
        </section>
      </main>
    </div>
  )
}
