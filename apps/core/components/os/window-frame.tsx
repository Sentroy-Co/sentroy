"use client"

import { useState, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { motion } from "framer-motion"
import { HugeiconsIcon } from "@hugeicons/react"
import { RefreshIcon } from "@hugeicons/core-free-icons"
import type { AppDescriptor } from "@workspace/console/components/layout/app-launcher"
import type { OsWindow } from "./os-store"
import { useWindowGeometry, RESIZE_HANDLES, MIN_H, type Geo } from "./use-window-geometry"
import { StoreAppFrame } from "./store-app-frame"
import { AppLaunchFallback, useAppProbe } from "./iframe-fallback"

const DOCK_CLEARANCE = 92 // maximize'da dock'a yer bırak

function embedSrc(href: string): string {
  return href + (href.includes("?") ? "&" : "?") + "embed=1"
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), Math.max(lo, hi))
}

/**
 * Sürüklenebilir + 8-yönlü resize edilebilir uygulama penceresi. Sol traffic
 * lights (kapat/minimize/maximize), sağda refresh. Aktif değilken iframe
 * üstünde şeffaf overlay → tek tıkla focus (click-to-focus). Sürükleme/resize
 * sırasında pointer capture + iframe pointer-events kapalı (iframe olayları
 * yutmaz).
 */
export function WindowFrame({
  win,
  app,
  bounds,
  active,
  hidden,
  lang,
  onFocus,
  onClose,
  onMinimize,
  onToggleMax,
  onToggleFullscreen,
  onGeometry,
  children,
}: {
  win: OsWindow
  app: AppDescriptor
  bounds: { w: number; h: number }
  active: boolean
  /** Space modeli: bu pencere şu an gösterilmiyor (başka space aktif ya da bu
   *  pencere kendi space'inde ama gösterilmiyor) → mount kalır, görsel gizli. */
  hidden: boolean
  lang: string
  onFocus: () => void
  onClose: () => void
  onMinimize: () => void
  onToggleMax: () => void
  onToggleFullscreen: () => void
  onGeometry: (geo: Geo) => void
  /** Verilirse iframe yerine bu native içerik render edilir (örn. Launchpad). */
  children?: ReactNode
}) {
  const t = useTranslations("os.window")
  const [loaded, setLoaded] = useState(false)
  const [nonce, setNonce] = useState(0)
  // Yalnız iframe modunda yokla (native children / store-app'te gereksiz);
  // nonce (reload) değişince de yeniden dener.
  const probeSrc = !children && !app.embed ? `${embedSrc(app.href)}#${nonce}` : null
  const { state: frameProbe, retry: retryProbe } = useAppProbe(
    probeSrc ? probeSrc.split("#")[0]! + (nonce ? `#${nonce}` : "") : null,
  )

  const base: Geo = {
    x: clamp(win.x, 0, Math.max(0, bounds.w - 120)),
    y: clamp(win.y, 0, Math.max(0, bounds.h - 44)),
    w: Math.min(win.w, bounds.w),
    h: Math.min(win.h, bounds.h),
  }
  const { geo, interacting, startDrag, startResize } = useWindowGeometry({
    base,
    bounds,
    locked: win.maximized || win.fullscreen,
    onCommit: onGeometry,
  })
  const display: Geo = win.fullscreen
    ? { x: 0, y: 0, w: bounds.w, h: bounds.h } // tam ekran — dock/menü bar üstü
    : win.maximized
      ? { x: 0, y: 0, w: bounds.w, h: Math.max(MIN_H, bounds.h - DOCK_CLEARANCE) }
      : geo

  function refresh() {
    setLoaded(false)
    setNonce((n) => n + 1)
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      onPointerDownCapture={onFocus}
      style={{
        left: display.x,
        top: display.y,
        // Fullscreen: inset-0 container'ın %100'ü → ölçülen bounds'a bağlı
        // değil (className flip'inde tek-frame stale-bounds flash'ı olmaz).
        width: win.fullscreen ? "100%" : display.w,
        height: win.fullscreen ? "100%" : display.h,
        zIndex: win.z,
      }}
      className={
        (hidden ? "hidden " : "") +
        "pointer-events-auto absolute flex select-none flex-col overflow-hidden bg-background " +
        (win.fullscreen ? "rounded-none " : "rounded-xl ") +
        (win.fullscreen
          ? ""
          : active
            ? "shadow-[0_24px_70px_-12px_rgba(0,0,0,0.55)] ring-1 ring-black/15 dark:ring-white/15"
            : "shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)] ring-1 ring-black/10 dark:ring-white/10")
      }
    >
      {/* Başlık çubuğu */}
      <div
        onPointerDown={startDrag}
        onDoubleClick={onToggleMax}
        className="flex h-9 shrink-0 cursor-grab items-center gap-2 border-b border-border/60 bg-muted/40 px-3 active:cursor-grabbing"
      >
        {/* sol — traffic lights */}
        <div className="group/lights flex items-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
          <TrafficLight color="#ff5f57" label={t("close")} glyph="×" onClick={onClose} />
          <TrafficLight color="#febc2e" label={t("minimize")} glyph="–" onClick={onMinimize} />
          {/* Yeşil = gerçek tam ekran (space). Başlık çift-tık = masaüstü maximize. */}
          <TrafficLight color="#28c840" label={t("zoom")} glyph={win.fullscreen ? "⤢" : "⤢"} onClick={onToggleFullscreen} />
        </div>
        {/* orta — app kimliği */}
        <div className="pointer-events-none ml-1 flex min-w-0 items-center gap-1.5">
          <span className="flex size-4 items-center justify-center overflow-hidden rounded-[5px]" style={{ background: app.color }}>
            {app.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={app.logoUrl} alt="" className="size-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
            ) : (
              <HugeiconsIcon icon={app.icon} className="size-2.5 text-white" strokeWidth={2.5} />
            )}
          </span>
          <span className="truncate text-xs font-medium text-foreground/80">{app.name}</span>
        </div>
        {/* sağ — refresh (yalnız ilk-parti iframe pencerelerinde) */}
        {children || app.embed ? (
          <div className="ml-auto" />
        ) : (
          <button
            type="button"
            onClick={refresh}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={t("reload")}
            className="ml-auto flex size-6 items-center justify-center rounded-md text-foreground/60 hover:bg-foreground/10 hover:text-foreground"
          >
            <HugeiconsIcon icon={RefreshIcon} className="size-3.5" strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Gövde — native içerik (children) veya iframe */}
      <div className="relative min-h-0 flex-1 bg-background">
        {children ? (
          children
        ) : app.embed ? (
          <>
            <StoreAppFrame app={app} lang={lang} interacting={interacting} />
            {/* aktif değilken click-to-focus overlay (iframe üstüne) */}
            {!active ? <div className="absolute inset-0 z-10" onPointerDown={onFocus} /> : null}
          </>
        ) : (
          <>
            {frameProbe === "down" ? (
              // Alt-app erişilemez (502 vb.) → çıplak hata HTML'i yerine OS fallback'i.
              <AppLaunchFallback icon={app.icon} color={app.color} name={app.name} onRetry={retryProbe} />
            ) : (
              <>
                <iframe
                  key={nonce}
                  src={embedSrc(app.href)}
                  title={app.name}
                  className="size-full border-0 bg-background"
                  style={{ pointerEvents: interacting ? "none" : undefined }}
                  onLoad={() => setLoaded(true)}
                  // camera/microphone/display-capture: gömülü app'lerin (Meet →
                  // nested Jitsi iframe'i) cihaz erişimi için Permissions-Policy
                  // delege edilmeli; aksi halde OS penceresinde kamera/mik reddedilir.
                  allow="clipboard-write; clipboard-read; camera; microphone; display-capture; autoplay"
                />
                {!loaded ? <LoadingVeil app={app} /> : null}
              </>
            )}
            {/* aktif değilken click-to-focus overlay */}
            {!active ? <div className="absolute inset-0 z-10" onPointerDown={onFocus} /> : null}
          </>
        )}
      </div>

      {/* resize tutamakları */}
      {win.maximized || win.fullscreen
        ? null
        : RESIZE_HANDLES.map((h) => (
            <div key={h.dir} onPointerDown={(e) => startResize(e, h.dir)} className={"absolute z-20 " + h.className} />
          ))}
    </motion.div>
  )
}

function TrafficLight({
  color,
  label,
  glyph,
  onClick,
}: {
  color: string
  label: string
  glyph: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-3 items-center justify-center rounded-full ring-1 ring-black/10"
      style={{ background: color }}
    >
      <span className="text-[9px] font-bold leading-none text-black/55 opacity-0 group-hover/lights:opacity-100">
        {glyph}
      </span>
    </button>
  )
}

function LoadingVeil({ app }: { app: AppDescriptor }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-background">
      <motion.span
        animate={{ scale: [0.92, 1.02, 0.92] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
        className="flex size-16 items-center justify-center rounded-[24%] shadow-xl"
        style={{ background: `linear-gradient(155deg, ${app.color}, ${app.color}bb)` }}
      >
        <HugeiconsIcon icon={app.icon} className="size-1/2 text-white drop-shadow" strokeWidth={2} />
      </motion.span>
      <div className="h-1 w-36 overflow-hidden rounded-full bg-muted">
        <motion.div
          initial={{ x: "-110%" }}
          animate={{ x: "210%" }}
          transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut" }}
          className="h-full w-1/2 rounded-full"
          style={{ background: app.color }}
        />
      </div>
    </div>
  )
}
