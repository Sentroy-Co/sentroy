"use client"

import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlusSignIcon, RefreshIcon, Image02Icon } from "@hugeicons/core-free-icons"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@workspace/ui/components/context-menu"
import { useDesktopWidgets } from "./widget-store"
import { useWallpaperStore } from "../wallpaper-store"

/**
 * Masaüstü boş-alan sağ-tık menüsü — tam ekran show-desktop yakalayıcının
 * (z-0) trigger'ı. Sol-tık show-desktop (mevcut davranış), sağ-tık menü:
 * "Add widget" (WidgetPanel'i Widgets sekmesinde aç), "Refresh widgets"
 * (widget-store.bumpRefresh → tüm widget'lar + achievements yeniden fetch),
 * ayraç, "Change wallpaper" (menü-bar WallpaperPicker popover'ını aç).
 * Pencere/widget üstünde native tarayıcı davranışı bozulmaz (onlar üst
 * katmanda kendi olaylarını yakalar; buraya yalnız boş masaüstü düşer).
 */
export function DesktopContextMenu({
  showDesktopLabel,
  onShowDesktop,
  onAddWidget,
}: {
  showDesktopLabel: string
  onShowDesktop: () => void
  /** WidgetPanel'i Widgets sekmesinde aç. */
  onAddWidget: () => void
}) {
  const t = useTranslations("os")
  const bumpRefresh = useDesktopWidgets((s) => s.bumpRefresh)
  const setWallpaperPickerOpen = useWallpaperStore((s) => s.setPickerOpen)

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <button
            type="button"
            aria-label={showDesktopLabel}
            tabIndex={-1}
            onClick={onShowDesktop}
            className="absolute inset-0 z-0 cursor-default"
          />
        }
      />
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={onAddWidget} className="gap-2">
          <HugeiconsIcon icon={PlusSignIcon} className="size-4" strokeWidth={2} />
          {t("widgetsHub.contextMenu.addWidget")}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => bumpRefresh()} className="gap-2">
          <HugeiconsIcon icon={RefreshIcon} className="size-4" strokeWidth={2} />
          {t("widgetsHub.contextMenu.refreshWidgets")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => setWallpaperPickerOpen(true)} className="gap-2">
          <HugeiconsIcon icon={Image02Icon} className="size-4" strokeWidth={2} />
          {t("widgetsHub.contextMenu.changeWallpaper")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
