"use client"

import { useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useRouter, usePathname } from "@workspace/auth/i18n/routing"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, Download04Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { LanguageCombobox } from "@workspace/console/components/shared/language-combobox"
import { cn } from "@workspace/ui/lib/utils"

/**
 * /[lang]/brand — Sentroy kurumsal kimlik sayfası. public/business + public/svg
 * logo varlıklarını önizler/indirir + kurumsal renk paletini gösterir. Public.
 * Kurumsal renkler: Red #FF1744 · Coral #FF6A5C · Black #0A0A0A · Light #F2F2F4 · White.
 */

const RED = "#FF1744"
const LOCALES = ["en", "tr", "ru", "zh", "es"] as const

const COLORS = [
  { name: "Sentroy Red", hex: "#FF1744" },
  { name: "Coral", hex: "#FF6A5C" },
  { name: "Black", hex: "#0A0A0A" },
  { name: "Light Gray", hex: "#F2F2F4" },
  { name: "White", hex: "#FFFFFF" },
]

interface Tile {
  key: string
  labelKey: "onDark" | "onLight" | "colored"
  bg: "dark" | "light"
  src: string
  downloads: { label: string; href: string }[]
}

// Konvansiyon (SVG'lerden doğrulandı): *-light = SİYAH mürekkep (açık zeminde),
// *-dark = BEYAZ (koyu zeminde). Bu yüzden onDark tile → dark-variant, onLight → light-variant.
const LOGO_TILES: Tile[] = [
  {
    key: "primary-dark", labelKey: "onDark", bg: "dark", src: "/svg/logo-dark.svg",
    downloads: [{ label: "SVG", href: "/svg/logo-dark.svg" }, { label: "PNG", href: "/business/sentroy-logo-dark-h.png" }],
  },
  {
    key: "primary-light", labelKey: "onLight", bg: "light", src: "/svg/logo-light.svg",
    downloads: [{ label: "SVG", href: "/svg/logo-light.svg" }, { label: "PNG", href: "/business/sentroy-logo-light-h.png" }],
  },
  {
    key: "vertical-dark", labelKey: "onDark", bg: "dark", src: "/svg/logo-vertical-dark.svg",
    downloads: [{ label: "SVG", href: "/svg/logo-vertical-dark.svg" }, { label: "PNG", href: "/business/sentroy-logo-dark-v.png" }],
  },
  {
    key: "vertical-light", labelKey: "onLight", bg: "light", src: "/svg/logo-vertical-light.svg",
    downloads: [{ label: "SVG", href: "/svg/logo-vertical-light.svg" }, { label: "PNG", href: "/business/sentroy-logo-light-v.png" }],
  },
]

const MARK_TILES: Tile[] = [
  { key: "mark-dark", labelKey: "onDark", bg: "dark", src: "/business/sentroy-icon-dark.png", downloads: [{ label: "PNG", href: "/business/sentroy-icon-dark.png" }] },
  { key: "mark-light", labelKey: "onLight", bg: "light", src: "/business/sentroy-icon-light.png", downloads: [{ label: "PNG", href: "/business/sentroy-icon-light.png" }] },
  { key: "mark-colored", labelKey: "colored", bg: "light", src: "/business/sentroy-icon-colored.png", downloads: [{ label: "PNG", href: "/business/sentroy-icon-colored.png" }] },
]

export function BrandPage({ lang }: { lang: string }) {
  const t = useTranslations("brand")
  const router = useRouter()
  const pathname = usePathname()
  const [copied, setCopied] = useState<string | null>(null)

  function copy(hex: string) {
    navigator.clipboard?.writeText(hex).then(() => {
      setCopied(hex)
      setTimeout(() => setCopied((v) => (v === hex ? null : v)), 1500)
    })
  }

  return (
    <div className="min-h-screen bg-white text-[#0A0A0A]">
      {/* header */}
      <header className="sticky top-0 z-40 border-b border-[#0A0A0A]/8 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-6">
          <Link href={`/${lang}`} className="inline-flex items-center gap-1.5 text-sm text-[#0A0A0A]/60 transition-colors hover:text-[#0A0A0A]">
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" strokeWidth={2} />
            {t("back")}
          </Link>
          <div className="ml-auto">
            <LanguageCombobox current={lang} locales={LOCALES} onSelect={(l) => router.replace(pathname, { locale: l as (typeof LOCALES)[number] })} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-24">
        {/* hero */}
        <div className="border-b border-[#0A0A0A]/10 pb-14">
          <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.28em]" style={{ color: RED }}>
            <span className="size-1.5 rounded-full" style={{ background: RED }} />
            Sentroy
          </span>
          <h1 className="mt-4 text-5xl font-bold tracking-tight sm:text-7xl">{t("title")}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[#0A0A0A]/60">{t("subtitle")}</p>
        </div>

        {/* logos */}
        <section className="pt-14">
          <h2 className="text-2xl font-semibold tracking-tight">{t("logos")}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#0A0A0A]/55">{t("logosDesc")}</p>
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {LOGO_TILES.map((tile) => <LogoTile key={tile.key} tile={tile} t={t} tall />)}
          </div>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {MARK_TILES.map((tile) => <LogoTile key={tile.key} tile={tile} t={t} />)}
          </div>
        </section>

        {/* colors */}
        <section className="pt-16">
          <h2 className="text-2xl font-semibold tracking-tight">{t("colors")}</h2>
          <p className="mt-2 text-sm text-[#0A0A0A]/55">{t("colorsDesc")}</p>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {COLORS.map((c) => {
              const isCopied = copied === c.hex
              const light = c.hex === "#FFFFFF" || c.hex === "#F2F2F4"
              return (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => copy(c.hex)}
                  className={cn(
                    "group flex flex-col overflow-hidden rounded-2xl text-left ring-1 transition-transform hover:-translate-y-0.5",
                    light ? "ring-[#0A0A0A]/12" : "ring-transparent",
                  )}
                >
                  <span className="relative flex h-28 items-end p-3" style={{ background: c.hex }}>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-wider opacity-0 transition-opacity group-hover:opacity-100",
                        light ? "bg-[#0A0A0A]/8 text-[#0A0A0A]/70" : "bg-white/15 text-white",
                      )}
                    >
                      {isCopied ? <><HugeiconsIcon icon={Tick02Icon} className="size-3" strokeWidth={2.5} />{t("copied")}</> : "copy"}
                    </span>
                  </span>
                  <span className="flex flex-col gap-0.5 border-t border-[#0A0A0A]/8 bg-[#F2F2F4] px-3 py-2.5">
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className="font-mono text-xs text-[#0A0A0A]/55">{c.hex}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <p className="mt-16 border-t border-[#0A0A0A]/10 pt-6 text-sm text-[#0A0A0A]/45">{t("note")}</p>
      </main>
    </div>
  )
}

function LogoTile({ tile, t, tall }: { tile: Tile; t: ReturnType<typeof useTranslations>; tall?: boolean }) {
  const dark = tile.bg === "dark"
  return (
    <div className={cn("overflow-hidden rounded-2xl ring-1", dark ? "ring-[#0A0A0A]/12" : "ring-[#0A0A0A]/10")}>
      <div className={cn("flex items-center justify-center p-8", tall ? "h-44" : "h-36")} style={{ background: dark ? "#0A0A0A" : "#F2F2F4" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {/* Intrinsic w/h = aspect-ratio ipucu (CLS/audit); object-contain + max-* render
            boyutunu yönetmeye devam eder. tall=dikey lockup (~0.99:1), diğeri yatay (~3.68:1). */}
        <img
          src={tile.src}
          alt="Sentroy logo"
          width={tall ? 407 : 361}
          height={tall ? 412 : 98}
          className="max-h-full max-w-[70%] object-contain"
        />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-[#0A0A0A]/8 bg-white px-4 py-2.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#0A0A0A]/50">{t(tile.labelKey)}</span>
        <div className="flex items-center gap-1.5">
          {tile.downloads.map((d) => (
            <a
              key={d.href}
              href={d.href}
              download
              className="inline-flex items-center gap-1 rounded-full border border-[#0A0A0A]/12 px-2.5 py-1 text-[11px] font-medium text-[#0A0A0A]/70 transition-colors hover:border-[#FF1744]/40 hover:text-[#FF1744]"
            >
              <HugeiconsIcon icon={Download04Icon} className="size-3" strokeWidth={2} />
              {d.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
