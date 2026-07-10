"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Reorder, motion, useMotionValue, type MotionValue } from "framer-motion"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@workspace/ui/components/context-menu"
import type { AppDescriptor } from "@workspace/console/components/layout/app-launcher"
import { useDockOrderStore } from "./dock-order-store"
import { useDockPinStore } from "./dock-pin-store"
import { isStoreApp, uninstallStoreApp } from "./uninstall-app"
import { useDockMagnify } from "./use-dock-magnify"

function sortByOrder(apps: AppDescriptor[], order: string[]): AppDescriptor[] {
  const idx = new Map(order.map((id, i) => [id, i]))
  return apps
    .map((a, i) => ({ a, o: idx.has(a.id) ? idx.get(a.id)! : order.length + i }))
    .sort((x, y) => x.o - y.o)
    .map((x) => x.a)
}

export function Dock({
  dockApps,
  runningApps,
  openIds,
  activeId,
  onOpen,
  onClose,
  fullscreen = false,
}: {
  /** Sabit + pinli (reorder edilebilir). */
  dockApps: AppDescriptor[]
  /** Açık ama sabit/pinli olmayan (divider'dan sonra, reorder yok). */
  runningApps: AppDescriptor[]
  openIds: Set<string>
  activeId: string | null
  onOpen: (id: string) => void
  onClose: (id: string) => void
  /** Bir tam ekran space aktif → dock gizli, alt kenara hover'da slide-up (macOS). */
  fullscreen?: boolean
}) {
  const order = useDockOrderStore((s) => s.order)
  const setOrder = useDockOrderStore((s) => s.setOrder)
  const mouseX = useMotionValue(Number.POSITIVE_INFINITY)
  const draggingRef = useRef(false)
  // Tam ekranda dock gizli; alt kenar YAKINLIĞIYLA açığa çıkar (peek).
  const [peek, setPeek] = useState(false)

  // Reveal-on-hover'ı app içeriğinin üstüne pointer-events'li bir şerit
  // KOYMADAN yap (aksi halde alt 16px tıklamaları yutulur + peek takılır/zıplar):
  // document-level pointermove ile alt-kenar yakınlığı. Histerezis: <6px aç,
  // >130px kapat (dock zonundan çıkınca her yönde güvenilir kapanır). fullscreen
  // biterse peek sıfırlanır (peeked dock'ta app değiştirip çıkınca açık kalmaz).
  useEffect(() => {
    if (!fullscreen) {
      setPeek(false)
      return
    }
    const onMove = (e: PointerEvent) => {
      const fromBottom = window.innerHeight - e.clientY
      setPeek((prev) => (prev ? fromBottom < 130 : fromBottom < 6))
    }
    window.addEventListener("pointermove", onMove)
    return () => window.removeEventListener("pointermove", onMove)
  }, [fullscreen])

  const ordered = useMemo(() => sortByOrder(dockApps, order), [dockApps, order])

  return (
    <>
      <div
        className={
          "pointer-events-none fixed inset-x-0 bottom-3 flex justify-center px-4 " +
          (fullscreen
            ? "z-[60] transition-transform duration-300 " + (peek ? "translate-y-0" : "translate-y-[160%]")
            : "z-40")
        }
      >
      <div
        onMouseMove={(e) => {
          if (!draggingRef.current) mouseX.set(e.clientX)
        }}
        onMouseLeave={() => mouseX.set(Number.POSITIVE_INFINITY)}
        className={
          "pointer-events-auto flex h-[78px] items-end gap-2.5 rounded-[26px] border border-white/30 " +
          // Çok item + dar ekran → yatay scroll (mobilde magnification yok, clip sorun değil);
          // sm+ overflow-visible → magnify edilen ikonlar barın üstüne taşar.
          "max-w-[calc(100vw-2rem)] overflow-x-auto overflow-y-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:max-w-none sm:overflow-x-visible " +
          "bg-gradient-to-b from-white/35 to-white/15 px-3 pb-2.5 " +
          "shadow-[0_10px_40px_-6px_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.6)] " +
          "backdrop-blur-2xl backdrop-saturate-150 " +
          "dark:border-white/12 dark:from-white/12 dark:to-white/[0.04] " +
          "dark:shadow-[0_10px_40px_-6px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.18)]"
        }
      >
        <Reorder.Group
          as="div"
          axis="x"
          values={ordered}
          onReorder={(arr: AppDescriptor[]) => setOrder(arr.map((a) => a.id))}
          style={{ overflow: "visible" }}
          className="flex items-end gap-2.5"
        >
          {ordered.map((app) => (
            <Reorder.Item
              as="div"
              key={app.id}
              value={app}
              onDragStart={() => {
                draggingRef.current = true
                mouseX.set(Number.POSITIVE_INFINITY)
              }}
              onDragEnd={() => {
                draggingRef.current = false
              }}
              dragElastic={0.08}
              // Press-squish + drag-lift AYNI elemanda: framer tap↔drag'i
              // koordine eder (drag'e dönüşen gesture tap'ı iptal eder), böylece
              // inner button'daki whileTap'in drag sırasında 0.82'de takılı
              // kalma bug'ı olmaz (sürükle-bırak sonrası ikon eski boyutuna döner).
              whileTap={{ scale: 0.92 }}
              whileDrag={{ scale: 1.04 }}
              transition={{ type: "spring", stiffness: 500, damping: 34 }}
              className="relative"
            >
              <DockIcon app={app} mouseX={mouseX} open={openIds.has(app.id)} active={activeId === app.id} onOpen={onOpen} onClose={onClose} />
            </Reorder.Item>
          ))}
        </Reorder.Group>

        {runningApps.length ? (
          <>
            <div className="mx-0.5 mb-3 h-10 w-px self-center bg-foreground/15" />
            {runningApps.map((app) => (
              <div key={app.id} className="relative">
                <DockIcon app={app} mouseX={mouseX} open={openIds.has(app.id)} active={activeId === app.id} onOpen={onOpen} onClose={onClose} />
              </div>
            ))}
          </>
        ) : null}
      </div>
      </div>
    </>
  )
}

function DockIcon({
  app,
  mouseX,
  open,
  active,
  onOpen,
  onClose,
}: {
  app: AppDescriptor
  mouseX: MotionValue<number>
  open: boolean
  active: boolean
  onOpen: (id: string) => void
  onClose: (id: string) => void
}) {
  const t = useTranslations("os")
  const pinned = useDockPinStore((s) => s.pinned)
  const toggle = useDockPinStore((s) => s.toggle)
  const hide = useDockPinStore((s) => s.hide)
  // Fisheye büyütme — paylaşılan hook (landing v2 DockNav ile tek kaynak).
  const { ref, size } = useDockMagnify(mouseX)

  const count = typeof app.count === "number" ? app.count : 0
  const pinnable = app.id.startsWith("tool:") || app.id.startsWith("platform:")
  const isPinned = pinned.includes(app.id)
  // Ürün/sistem app'leri (mail, storage, meet, notes, store, …) dock'tan
  // kaldırılabilir — Launchpad'den geri eklenir. Launchpad kaldırılamaz (geri-ekleme
  // kapısı); araç/platform pinleri "unpin", store app'leri "kaldır" ile yönetilir.
  const removable = !pinnable && !isStoreApp(app) && app.id !== "launchpad"

  return (
    <ContextMenu>
      <ContextMenuTrigger className="group relative flex flex-col items-center justify-end">
        <span className="pointer-events-none absolute -top-9 whitespace-nowrap rounded-lg bg-black/85 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
          {app.name}
        </span>
        <motion.button
          ref={ref}
          type="button"
          onClick={() => onOpen(app.id)}
          style={{ width: size, height: size }}
          aria-label={app.name}
          className="relative"
        >
          <span className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-[28%] shadow-lg ring-1 ring-white/35 dark:ring-white/15">
            <span
              className="flex size-full items-center justify-center"
              style={{ background: `linear-gradient(150deg, ${app.color}, ${app.color}cc)` }}
            >
              {app.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={app.logoUrl} alt="" draggable={false} className="pointer-events-none size-full object-cover select-none" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
              ) : (
                <HugeiconsIcon icon={app.icon} className="size-[52%] text-white drop-shadow-md" strokeWidth={2} />
              )}
            </span>
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/35 via-white/5 to-transparent" />
          </span>
          {count > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white/90 dark:ring-black/40">
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </motion.button>
        <span
          className={
            "mt-1.5 size-1 rounded-full transition-colors duration-200 " +
            (active ? "bg-white shadow-[0_0_4px_rgba(255,255,255,0.8)]" : open ? "bg-white/55" : "bg-transparent")
          }
        />
      </ContextMenuTrigger>
      <ContextMenuContent>
        {open ? (
          <>
            <ContextMenuItem onClick={() => onOpen(app.id)}>{t("dock.bringToFront")}</ContextMenuItem>
            <ContextMenuItem onClick={() => onClose(app.id)}>{t("dock.close")}</ContextMenuItem>
          </>
        ) : (
          <ContextMenuItem onClick={() => onOpen(app.id)}>{t("dock.open")}</ContextMenuItem>
        )}
        {pinnable ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => toggle(app.id)}>{isPinned ? t("unpinFromDock") : t("pinToDock")}</ContextMenuItem>
          </>
        ) : null}
        {isStoreApp(app) ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              onClick={async () => {
                const removed = await uninstallStoreApp(app, {
                  title: t("store.confirmRemoveTitle", { app: app.name }),
                  description: t("store.confirmRemoveDesc"),
                  confirmText: t("store.remove"),
                  success: t("store.removedToast", { app: app.name }),
                  failed: t("store.removeFailed"),
                })
                if (removed && open) onClose(app.id)
              }}
            >
              {t("store.remove")}
            </ContextMenuItem>
          </>
        ) : (
          <>
            <ContextMenuSeparator />
            {app.href ? (
              <ContextMenuItem onClick={() => window.open(app.href, "_blank", "noopener,noreferrer")}>{t("dock.openInNewTab")}</ContextMenuItem>
            ) : null}
            {removable ? (
              <ContextMenuItem onClick={() => hide(app.id)}>{t("unpinFromDock")}</ContextMenuItem>
            ) : null}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
