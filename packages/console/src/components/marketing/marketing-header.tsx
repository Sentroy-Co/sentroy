"use client"

import { useEffect, useState, type ReactNode } from "react"
import { motion } from "framer-motion"
import { useSession } from "@workspace/auth/client/auth-client"
import { Logo } from "@workspace/console/components/shared/logo"
import { Button } from "@workspace/ui/components/button"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Marketing header — core landing'in `FloatingNav`'inden generic component'e
 * extract edildi. Davranış aynı: scroll'da tam-genişlikten floating-pill'e
 * morph + scroll-spy ile aktif section highlight.
 *
 * Caller'lar (core landing, storage landing, vs) kendi navItems +
 * CTA'larıyla besler — i18n burada hardcoded değil, props üzerinden.
 *
 * `enableSectionTracking=false` ise scroll-spy devre dışı — landing'in
 * tek-section veya hash-link'siz versiyonları için.
 */

export interface MarketingHeaderNavItem {
  /** Anchor target — `#` olmadan section id (örn. "features"). */
  id: string
  label: string
  /** Override: belirtilirse bu href kullanılır (route link), aksi halde
   *  `#${id}` ile aynı sayfada scroll. */
  href?: string
  /** External link gösterimi — yeni sekme. */
  external?: boolean
}

export interface MarketingHeaderCta {
  label: string
  href: string
  variant?: "primary" | "ghost"
  external?: boolean
  /** sm breakpoint altında gizle (overflow tehlikesi). */
  hideOnMobile?: boolean
}

export interface MarketingHeaderProps {
  lang: string
  /** Logo'nun bağlandığı route (default: `/`). */
  logoHref?: string
  /** Nav menü öğeleri (in-page anchor + opsiyonel route link karışık olabilir). */
  navItems?: MarketingHeaderNavItem[]
  /** Login user için tek CTA — örn. "Dashboard'a git". */
  signedInCta: MarketingHeaderCta
  /** Anonim user için CTA dizisi (sırayla render). */
  signedOutCtas: MarketingHeaderCta[]
  /** Scroll-spy aktif section highlight (default true). */
  enableSectionTracking?: boolean
  /** Conditional section'lar landing data fetch sonrası DOM'a giriyorsa
   *  bunu `true`'ya çevirip observer'ı re-setup ettir. */
  dataReady?: boolean
  /** Sağ taraftaki CTA'ların solunda render edilen slot — örn. dil seçici
   *  (`LanguageCombobox`). Caller kendi routing'iyle besler. */
  languageSwitcher?: ReactNode
}

export function MarketingHeader({
  lang: _lang,
  logoHref = "#top",
  navItems = [],
  signedInCta,
  signedOutCtas,
  enableSectionTracking = true,
  dataReady = true,
  languageSwitcher,
}: MarketingHeaderProps) {
  const { data: session } = useSession()
  const [scrolled, setScrolled] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    if (!enableSectionTracking) return
    const ids = navItems.filter((i) => !i.href).map((i) => i.id)
    if (ids.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) setActiveId(visible.target.id)
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] },
    )
    ids.forEach((id) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [enableSectionTracking, dataReady, navItems])

  const renderCta = (cta: MarketingHeaderCta, idx: number) => {
    const variant = cta.variant === "ghost" ? "ghost" : "default"
    const linkProps = cta.external
      ? { target: "_blank", rel: "noopener noreferrer" as const }
      : {}
    return (
      <Button
        key={`${cta.label}-${idx}`}
        size="sm"
        variant={variant}
        className={cta.hideOnMobile ? "hidden sm:inline-flex" : ""}
        render={<a href={cta.href} {...linkProps} />}
      >
        {cta.label}
        {variant === "default" ? (
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            strokeWidth={2}
            className="size-4"
          />
        ) : null}
      </Button>
    )
  }

  return (
    <motion.header
      initial={false}
      animate={{ paddingTop: scrolled ? 12 : 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      className="fixed inset-x-0 top-0 z-50"
    >
      <motion.div
        initial={false}
        animate={{
          maxWidth: scrolled ? 960 : 1152,
          borderRadius: scrolled ? 999 : 0,
          paddingInline: scrolled ? 16 : 24,
          boxShadow: scrolled
            ? "0 8px 32px -12px rgba(0,0,0,0.12)"
            : "0 0 0 0 rgba(0,0,0,0)",
        }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className={cn(
          "mx-auto flex h-14 items-center justify-between backdrop-blur-md",
          scrolled
            ? "border bg-background/85"
            : "border-b border-transparent bg-background/60",
        )}
        style={{ borderColor: scrolled ? undefined : "transparent" }}
      >
        <a href={logoHref} className="shrink-0">
          <Logo size="md" />
        </a>
        {navItems.length > 0 && (
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const isActive = activeId === item.id
              const href = item.href ?? `#${item.id}`
              const linkProps = item.external
                ? { target: "_blank", rel: "noopener noreferrer" as const }
                : {}
              return (
                <a
                  key={item.id}
                  href={href}
                  {...linkProps}
                  className={cn(
                    "relative rounded-full px-3 py-1.5 text-sm transition-colors",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 -z-10 rounded-full bg-muted"
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 30,
                      }}
                    />
                  )}
                  {item.label}
                </a>
              )
            })}
          </nav>
        )}
        <div className="flex items-center gap-2">
          {languageSwitcher}
          {session
            ? renderCta(signedInCta, 0)
            : signedOutCtas.map((cta, i) => renderCta(cta, i))}
        </div>
      </motion.div>
    </motion.header>
  )
}
