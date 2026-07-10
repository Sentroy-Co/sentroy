"use client"

import { useEffect, useState, type ReactNode } from "react"
import { motion } from "framer-motion"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Landing'in scroll-aware "floating pill" navbar pattern'inin paylaşılabilir
 * versiyonu. Üç slot:
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  start         │       center (optional)        │      end       │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Sayfa scroll edilince max-width daralır, border-radius pill'e döner,
 * shadow ve background opacity artar — landing'tekiyle birebir aynı
 * estetik. App picker / company picker / settings gibi içerik-merkezli
 * ekranlar bu header'ı tüketir, kendi slot'larını doldurur.
 *
 * Pure layout — context yok, store yok. Hangi slot'ta ne render ettiğin
 * tamamen sana kalmış. SidebarProvider veya benzer wrapper consumer
 * tarafında olur (TeamSwitcher / NavUser sidebar context'i ister).
 */

export interface FloatingHeaderProps {
  /** Sol slot — genelde Logo veya brand mark. */
  start?: ReactNode
  /** Orta slot — landing'de section nav, picker'larda TeamSwitcher. */
  center?: ReactNode
  /** Sağ slot — landing'de auth CTA'ları, picker'larda NavUser. */
  end?: ReactNode
  /**
   * Scroll threshold (px) — bu kadar aşağı kaydırınca pill'e morph.
   * Default 48 (landing'le aynı).
   */
  scrollThreshold?: number
  /** Expanded max-width (px). Landing 1152, internal sayfalar 1024. */
  maxWidthExpanded?: number
  /** Scrolled max-width (px). Landing 960, daha minimal. */
  maxWidthScrolled?: number
  /** z-index. Default 50 (landing parite). */
  zIndex?: number
  /** Container ek class — gerekirse spacing override. */
  className?: string
}

export function FloatingHeader({
  start,
  center,
  end,
  scrollThreshold = 48,
  maxWidthExpanded = 1152,
  maxWidthScrolled = 960,
  zIndex = 50,
  className,
}: FloatingHeaderProps) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > scrollThreshold)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [scrollThreshold])

  return (
    <motion.header
      initial={false}
      animate={{ paddingTop: scrolled ? 12 : 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn("fixed inset-x-0 top-0", className)}
      style={{ zIndex }}
    >
      <motion.div
        initial={false}
        animate={{
          maxWidth: scrolled ? maxWidthScrolled : maxWidthExpanded,
          borderRadius: scrolled ? 999 : 0,
          paddingInline: scrolled ? 16 : 24,
          boxShadow: scrolled
            ? "0 8px 32px -12px rgba(0,0,0,0.12)"
            : "0 0 0 0 rgba(0,0,0,0)",
        }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className={cn(
          "mx-auto flex h-14 items-center justify-between gap-3 backdrop-blur-md",
          scrolled
            ? "border bg-background/85"
            : "border-b border-transparent bg-background/60",
        )}
        style={{ borderColor: scrolled ? undefined : "transparent" }}
      >
        <div className="shrink-0">{start}</div>
        {center && (
          <div className="hidden flex-1 justify-center md:flex">{center}</div>
        )}
        <div className="flex items-center gap-2">{end}</div>
      </motion.div>
    </motion.header>
  )
}
