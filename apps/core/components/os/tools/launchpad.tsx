"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { Search01Icon } from "@hugeicons/core-free-icons"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@workspace/ui/components/context-menu"
import type { AppDescriptor } from "@workspace/console/components/layout/app-launcher"
import { LIVE_TOOLS, TOOL_CATEGORIES, PLATFORM_APPS, categoryMeta, toolLocale } from "./catalog"
import { toolDescriptor, platformDescriptor } from "./open-tool"
import { useDockPinStore } from "../dock-pin-store"

type IconType = AppDescriptor["icon"]

/**
 * Tek araç/indirici kutucuğu. ⚠ MODULE-SCOPE olmalı — Launchpad içinde
 * tanımlanırsa her render'da yeni bileşen tipi olur ve React tile'ları
 * remount eder; WindowFrame'in onPointerDownCapture→focus re-render'ı
 * pointerdown ile click arasında button'u yok edip onClick'i düşürür
 * (tıklama "tepkisiz" kalır). Bu yüzden burada, dışarıda.
 */
function Tile({
  id,
  label,
  icon,
  color,
  onClick,
  logoUrl,
  pinnable = true,
}: {
  id: string
  label: string
  icon: IconType
  color: string
  onClick: () => void
  /** Store app marka logosu — verilirse ikon yerine (img onError fallback). */
  logoUrl?: string
  /** Dock'a sabitlenebilir mi (store app'ler v1'de değil). */
  pinnable?: boolean
}) {
  const t = useTranslations("os")
  const pinned = useDockPinStore((s) => s.pinned)
  const toggle = useDockPinStore((s) => s.toggle)
  const isPinned = pinned.includes(id)
  return (
    <ContextMenu>
      <ContextMenuTrigger className="rounded-xl">
        <button
          type="button"
          onClick={onClick}
          className="group flex w-full flex-col items-center gap-1.5 rounded-xl p-2 text-center outline-none transition hover:bg-foreground/5"
        >
          <span
            className="flex size-14 items-center justify-center overflow-hidden rounded-2xl shadow-md ring-1 ring-black/5 transition group-hover:scale-105"
            style={{ background: `linear-gradient(150deg, ${color}, ${color}cc)` }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="size-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
            ) : (
              <HugeiconsIcon icon={icon} className="size-7 text-white" strokeWidth={2} />
            )}
          </span>
          <span className="line-clamp-2 text-[11px] font-medium leading-tight text-foreground">{label}</span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onClick}>{t("dock.open")}</ContextMenuItem>
        {pinnable ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => toggle(id)}>{isPinned ? t("unpinFromDock") : t("pinToDock")}</ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  )
}

/**
 * macOS "Launchpad" tarzı araç ızgarası — Downloaders (youtube/instagram) +
 * kategori bölümleri, üstte arama. Tıkla → pencerede aç (onOpen). Sağ-tık →
 * dock'a sabitle/kaldır.
 */
export function Launchpad({
  lang,
  onOpen,
  storeApps = [],
}: {
  lang: string
  onOpen: (d: AppDescriptor) => void
  /** Kurulu App Store uygulamaları — "Your apps" bölümü. */
  storeApps?: AppDescriptor[]
}) {
  const t = useTranslations("os")
  const [q, setQ] = useState("")
  const query = q.trim().toLowerCase()
  const filteredStoreApps = query ? storeApps.filter((a) => a.name.toLowerCase().includes(query)) : storeApps

  const filteredTools = query
    ? LIVE_TOOLS.filter((t2) => {
        const l = toolLocale(t2, lang)
        return (
          l.title.toLowerCase().includes(query) ||
          l.keyword.toLowerCase().includes(query) ||
          t2.en.title.toLowerCase().includes(query)
        )
      })
    : LIVE_TOOLS
  const filteredPlatforms = query
    ? PLATFORM_APPS.filter((p) => p.label.toLowerCase().includes(query) || p.key.includes(query))
    : PLATFORM_APPS

  const hasResults = filteredTools.length > 0 || filteredPlatforms.length > 0 || filteredStoreApps.length > 0

  return (
    <div className="flex h-full select-none flex-col bg-muted/20">
      <div className="shrink-0 border-b border-border/60 p-3">
        <div className="relative mx-auto max-w-md">
          <HugeiconsIcon icon={Search01Icon} className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchTools")}
            autoFocus
            className="w-full rounded-full border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {filteredStoreApps.length ? (
          <div className="mb-6">
            <p className="mb-3 px-1 text-xs font-medium text-muted-foreground">{t("yourApps")}</p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-3">
              {filteredStoreApps.map((a) => (
                <Tile
                  key={a.id}
                  id={a.id}
                  label={a.name}
                  icon={a.icon}
                  color={a.color}
                  logoUrl={a.logoUrl}
                  pinnable={false}
                  onClick={() => onOpen(a)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {filteredPlatforms.length ? (
          <div className="mb-6">
            <p className="mb-3 px-1 text-xs font-medium text-muted-foreground">{t("downloaders")}</p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-3">
              {filteredPlatforms.map((p) => (
                <Tile
                  key={p.key}
                  id={`platform:${p.key}`}
                  label={p.label}
                  icon={p.icon}
                  color={p.color}
                  onClick={() => onOpen(platformDescriptor(p, lang))}
                />
              ))}
            </div>
          </div>
        ) : null}

        {TOOL_CATEGORIES.map((cat) => {
          const tools = filteredTools.filter((t2) => t2.category === cat.key)
          if (!tools.length) return null
          return (
            <div key={cat.key} className="mb-6">
              <p className="mb-3 px-1 text-xs font-medium text-muted-foreground">{lang === "tr" ? cat.label.tr : cat.label.en}</p>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-3">
                {tools.map((t2) => {
                  const meta = categoryMeta(t2.category)
                  const loc = toolLocale(t2, lang)
                  return (
                    <Tile
                      key={t2.id}
                      id={`tool:${t2.id}`}
                      label={loc.title}
                      icon={meta.icon}
                      color={meta.color}
                      onClick={() => onOpen(toolDescriptor(t2, lang))}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}

        {!hasResults ? <p className="mt-10 text-center text-sm text-muted-foreground">{t("noToolsFound")}</p> : null}
      </div>
    </div>
  )
}
