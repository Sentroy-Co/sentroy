"use client"

// GlassNav — landing v2'nin OS-menü-barı estetiğinde üst nav'ı.
// MarketingHeader yerine v2'ye özel (v1 + storage landing'i paylaşılan
// header'ı kullanmaya devam eder; burada cam dil + Lenis smooth scroll +
// pinned-dev-section'larda doğru çalışan pozisyon-tabanlı scroll-spy var).
//
// Scroll-spy: IntersectionObserver DEĞİL — 400vh'lik pinned section'larda
// ratio'lar yanıltıcı. Bunun yerine rAF-throttle scroll listener, viewport'un
// üst %35 çizgisini hangi izlenen section'ın kapsadığına bakar.

import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { useSession } from "@workspace/auth/client/auth-client"
import { Logo } from "@workspace/console/components/shared"
import { cn } from "@workspace/ui/lib/utils"
import { scrollToId, scrollToTop } from "./lenis-store"
import { Magnetic } from "./magnetic"

export interface GlassNavItem {
  /** İzlenen section id'si (anchor). */
  id: string
  label: string
}

export function GlassNav({
  items,
  languageSwitcher,
  signInLabel,
  getStartedLabel,
  dashboardLabel,
  lang,
}: {
  items: GlassNavItem[]
  languageSwitcher?: React.ReactNode
  signInLabel: string
  getStartedLabel: string
  dashboardLabel: string
  lang: string
}) {
  const { data: session } = useSession()
  const [scrolled, setScrolled] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const raf = useRef<number | null>(null)

  // Pozisyon-tabanlı scroll-spy + condensed durum, tek rAF-throttle listener'da.
  useEffect(() => {
    const SPY_LINE = 0.35 // viewport yüksekliğinin %35'i — okuma çizgisi
    const update = () => {
      raf.current = null
      setScrolled(window.scrollY > 48)
      const line = window.innerHeight * SPY_LINE
      let current: string | null = null
      for (const item of items) {
        const el = document.getElementById(item.id)
        if (!el) continue
        const r = el.getBoundingClientRect()
        // Section okuma çizgisini kapsıyorsa aktiftir; birden çoksa sonuncusu kazanır.
        if (r.top <= line && r.bottom > line) current = item.id
      }
      setActiveId(current)
    }
    const onScroll = () => {
      if (raf.current == null) raf.current = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (raf.current != null) cancelAnimationFrame(raf.current)
    }
  }, [items])

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-3">
      <div
        className={cn(
          "flex w-full items-center gap-2 rounded-2xl border px-3 py-2 transition-all duration-500",
          scrolled
            ? // Condensed: yüzen cam pill — DockNav ile aynı reçete.
              "max-w-4xl border-white/[0.14] bg-gradient-to-b from-white/[0.12] to-white/[0.04] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-2xl backdrop-saturate-150"
            : // Tepede: geniş ve şeffaf — sahneyle bütünleşik.
              "max-w-6xl border-transparent bg-transparent",
        )}
      >
        <button
          type="button"
          onClick={scrollToTop}
          aria-label="Sentroy"
          className="shrink-0 rounded-lg px-1.5 py-1 transition-opacity hover:opacity-80"
        >
          <Logo size="sm" />
        </button>

        {/* Nav öğeleri — aktif item layoutId pill'i */}
        <nav className="mx-auto hidden items-center gap-1 md:flex" aria-label="Sections">
          {items.map((item) => {
            const active = activeId === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToId(item.id)}
                className={cn(
                  "relative rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                  active ? "text-white" : "text-white/55 hover:text-white/85",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="lv2-nav-pill"
                    className="absolute inset-0 rounded-full bg-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    aria-hidden
                  />
                ) : null}
                <span className="relative">{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 md:ml-0">
          {/* Fair Source — kaynağı görülebilir olduğumuzun görünür kanıtı;
              tooltip + aria "Fair Source", link public repo'ya. */}
          <a
            href="https://github.com/Sentroy-Co/sentroy"
            target="_blank"
            rel="noreferrer"
            aria-label="Fair Source — view Sentroy on GitHub"
            title="Fair Source — view on GitHub"
            className="hidden size-8 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white sm:flex"
          >
            <svg viewBox="0 0 16 16" aria-hidden className="size-4 fill-current">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
          {languageSwitcher}
          {session?.user ? (
            <Magnetic strength={8} className="inline-flex">
              <a
                href={`/${lang}/d`}
                className="rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-black transition-transform hover:scale-[1.03] active:scale-[0.97]"
              >
                {dashboardLabel}
              </a>
            </Magnetic>
          ) : (
            <>
              <a
                href={`/${lang}/login`}
                className="hidden rounded-full px-3.5 py-1.5 text-[13px] font-medium text-white/60 transition-colors hover:text-white sm:block"
              >
                {signInLabel}
              </a>
              <Magnetic strength={8} className="inline-flex">
                <a
                  href={`/${lang}/signup`}
                  className="rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-black transition-transform hover:scale-[1.03] active:scale-[0.97]"
                >
                  {getStartedLabel}
                </a>
              </Magnetic>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
