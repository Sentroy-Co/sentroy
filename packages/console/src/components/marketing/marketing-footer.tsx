"use client"

import type { ComponentType } from "react"
import { Logo } from "@workspace/console/components/shared/logo"
import { HugeiconsIcon } from "@hugeicons/react"

/**
 * Marketing footer — core landing'in `SiteFooter`'ından generic component'e
 * extract edildi. Layout aynı: 4-column link grid + brand column + status
 * badge + bottom bar (cookie + lang + copyright).
 *
 * Hugeicons icon tipi paketten export edilmiyor; `unknown[]` ile esnek
 * tutuyoruz, caller HugeIcon import edip prop olarak verir.
 */

// Hugeicons icon definition shape — aslında `IconSvgObject` tipi paket
// içinde public değil, opaque referans olarak alıyoruz.
type IconRef = unknown

export interface MarketingFooterLink {
  href: string
  label: string
  external?: boolean
}

export interface MarketingFooterColumn {
  heading: string
  items: MarketingFooterLink[]
}

export interface MarketingFooterSocial {
  href: string
  label: string
  icon: IconRef
}

export interface MarketingFooterBottomLink {
  label: string
  /** Click handler — açılan modal vb. (cookie preferences gibi). */
  onClick?: () => void
  /** Veya plain link. */
  href?: string
}

export interface MarketingFooterProps {
  lang: string
  /** Brand altındaki açıklama metni (i18n caller'dan). */
  tagline: string
  /** Sağ taraftaki link sütunları (2x2 sm, 1x4 lg). */
  columns: MarketingFooterColumn[]
  /** Sosyal media iconları — sıfır element verilirse satır gizlenir. */
  socials?: MarketingFooterSocial[]
  /** "All systems operational" benzeri canlı badge — gizlemek için
   *  null geç. */
  statusLabel?: string | null
  /** Bottom-left telif metni — default `© <year> Sentroy. <rights>` */
  copyright: string
  /** Bottom-right yardımcı linkler (cookie prefs, lang, vb.). */
  bottomLinks?: MarketingFooterBottomLink[]
}

export function MarketingFooter({
  lang,
  tagline,
  columns,
  socials = [],
  statusLabel = null,
  copyright,
  bottomLinks = [],
}: MarketingFooterProps) {
  return (
    <footer className="relative overflow-hidden bg-background">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      <div className="mx-auto max-w-6xl px-6 pt-20 pb-10">
        <div className="grid gap-12 lg:grid-cols-12">
          {/* Brand column */}
          <div className="flex flex-col gap-5 lg:col-span-4">
            <Logo size="md" />
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              {tagline}
            </p>
            {socials.length > 0 && (
              <div className="flex items-center gap-2">
                {socials.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    className="flex size-9 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted hover:text-foreground"
                  >
                    <HugeiconsIcon
                      icon={s.icon as never}
                      strokeWidth={1.8}
                      className="size-4"
                    />
                  </a>
                ))}
              </div>
            )}
            {statusLabel && (
              <div className="mt-2 inline-flex w-fit items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/60 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                {statusLabel}
              </div>
            )}
          </div>

          {/* Link columns */}
          <div className="grid gap-10 sm:grid-cols-2 lg:col-span-8 lg:grid-cols-4">
            {columns.map((col) => (
              <FooterColumn key={col.heading} {...col} />
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-16 flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">{copyright}</p>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            {bottomLinks.map((bl, idx) => {
              if (bl.onClick) {
                return (
                  <button
                    key={`${bl.label}-${idx}`}
                    type="button"
                    onClick={bl.onClick}
                    className="hover:text-foreground"
                  >
                    {bl.label}
                  </button>
                )
              }
              if (bl.href) {
                return (
                  <a
                    key={`${bl.label}-${idx}`}
                    href={bl.href}
                    className="hover:text-foreground"
                  >
                    {bl.label}
                  </a>
                )
              }
              return null
            })}
            {bottomLinks.length > 0 && (
              <span className="hidden sm:inline">·</span>
            )}
            <span className="tracking-wider uppercase">{lang}</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({ heading, items }: MarketingFooterColumn) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {heading}
      </span>
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={`${heading}-${item.label}`}>
            <a
              href={item.href}
              {...(item.external
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
