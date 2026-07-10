"use client"

import { useEffect, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Building06Icon } from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Şirket avatarını güvenli şekilde render eder. `avatarUrl` set ama görüntü
 * yüklenemezse (CDN 404, network drop, signed URL expire) tarayıcı default
 * "broken image" icon'u yerine fallback gösteririz: önce şirket adının ilk
 * harfi, name yoksa Building06 icon.
 *
 * Tek bir <img> + `onError` ile reload-on-change desteği: avatarUrl prop
 * değişirse error state sıfırlanır (yeni yüklenen avatar'a chance ver).
 *
 * Boyut: `size` token'ları (sm/md/lg/xl) veya raw `style` ile özelleştirme.
 * Rounded: default "md" — sidebar trigger'ında "lg", profile sayfasında
 * "full" tipik kullanım.
 */

type SizeToken = "xs" | "sm" | "md" | "lg" | "xl" | "2xl"

const SIZE_CLASSES: Record<SizeToken, string> = {
  xs: "size-5 text-[10px]",
  sm: "size-6 text-[11px]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
  xl: "size-12 text-base",
  "2xl": "size-16 text-lg",
}

const ICON_SIZE: Record<SizeToken, string> = {
  xs: "size-3",
  sm: "size-3.5",
  md: "size-4",
  lg: "size-5",
  xl: "size-6",
  "2xl": "size-7",
}

const RADIUS_CLASSES = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
} as const

export interface CompanyAvatarProps {
  avatarUrl: string | null | undefined
  name: string
  size?: SizeToken
  rounded?: keyof typeof RADIUS_CLASSES
  /** Fallback'te initial yerine her zaman Building06 icon kullan. */
  iconOnly?: boolean
  className?: string
}

export function CompanyAvatar({
  avatarUrl,
  name,
  size = "md",
  rounded = "md",
  iconOnly = false,
  className,
}: CompanyAvatarProps) {
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    setErrored(false)
  }, [avatarUrl])

  const initial = !iconOnly && name ? getInitial(name) : null
  const showImage = !!avatarUrl && !errored

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden border bg-muted/40 text-muted-foreground font-medium",
        SIZE_CLASSES[size],
        RADIUS_CLASSES[rounded],
        className,
      )}
      aria-label={name}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={name}
          onError={() => setErrored(true)}
          className="size-full object-cover"
        />
      ) : initial ? (
        <span aria-hidden="true">{initial}</span>
      ) : (
        <HugeiconsIcon
          icon={Building06Icon}
          strokeWidth={2}
          className={ICON_SIZE[size]}
          aria-hidden="true"
        />
      )}
    </div>
  )
}

function getInitial(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ""
  // Unicode-aware first grapheme (Türkçe Ş, Ç, vb. doğru gelir).
  const first = Array.from(trimmed)[0] ?? ""
  return first.toLocaleUpperCase("tr-TR")
}
