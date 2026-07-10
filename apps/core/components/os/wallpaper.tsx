"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { motion, AnimatePresence } from "framer-motion"
import { HugeiconsIcon } from "@hugeicons/react"
import { Image02Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"
import { WALLPAPERS, DEFAULT_WALLPAPER, wallpaperById } from "./wallpapers"
import { useWallpaperStore } from "./wallpaper-store"

/**
 * Masaüstü duvar kâğıdı katmanı — tam ekran, en arkada (z-0). Seçim değişince
 * AnimatePresence ile yumuşak crossfade. SSR/ilk-render'da DEFAULT gösterilir
 * (persist rehydrate sonrası seçili olana geçer → hydration uyumsuzluğu yok).
 */
export function WallpaperLayer() {
  const id = useWallpaperStore((s) => s.wallpaperId)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const wp = wallpaperById(mounted ? id : DEFAULT_WALLPAPER)

  return (
    <div className="absolute inset-0 z-0 overflow-hidden bg-neutral-900">
      <AnimatePresence>
        <motion.div
          key={wp.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${wp.src})` }}
        />
      </AnimatePresence>
      {/* hafif vinyet — dock/menü-bar cam efektine zemin oluşturur */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/15" />
    </div>
  )
}

/** Menü bardaki duvar kâğıdı seçici — thumbnail ızgaralı popover. */
export function WallpaperPicker() {
  const id = useWallpaperStore((s) => s.wallpaperId)
  const setWallpaper = useWallpaperStore((s) => s.setWallpaper)
  // Controlled: masaüstü sağ-tık "Change wallpaper" bu popover'ı açabilir.
  const open = useWallpaperStore((s) => s.pickerOpen)
  const setPickerOpen = useWallpaperStore((s) => s.setPickerOpen)
  const t = useTranslations("os")

  return (
    <Popover open={open} onOpenChange={setPickerOpen}>
      <PopoverTrigger
        className="flex size-7 items-center justify-center rounded-md outline-none hover:bg-black/5 dark:hover:bg-white/10"
        aria-label={t("changeWallpaper")}
      >
        <HugeiconsIcon icon={Image02Icon} className="size-4" strokeWidth={2} />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-72 gap-3">
        <p className="text-xs font-medium text-muted-foreground">{t("wallpaper")}</p>
        <div className="grid grid-cols-3 gap-2">
          {WALLPAPERS.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => setWallpaper(w.id)}
              aria-label={w.name}
              aria-pressed={id === w.id}
              className={cn(
                "group relative aspect-[16/10] overflow-hidden rounded-xl outline-none ring-2 transition",
                id === w.id ? "ring-primary" : "ring-transparent hover:ring-foreground/20",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={w.src} alt="" className="size-full object-cover transition group-hover:scale-105" />
              {id === w.id ? (
                <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                  <HugeiconsIcon icon={Tick02Icon} className="size-5 text-white drop-shadow" strokeWidth={2.5} />
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
