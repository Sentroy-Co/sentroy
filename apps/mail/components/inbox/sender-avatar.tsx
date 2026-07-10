"use client"

import { useEffect, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon } from "@hugeicons/core-free-icons"
import { useBimiStore, getDomainFromEmail } from "@/stores/bimi"
import { cn } from "@workspace/ui/lib/utils"

const sizeMap = {
  xs: { wrapper: "size-5", text: "text-[10px]", badge: "size-2.5", badgeIcon: "size-2" },
  sm: { wrapper: "size-6", text: "text-[10px]", badge: "size-3", badgeIcon: "size-2" },
  md: { wrapper: "size-8", text: "text-xs", badge: "size-3.5", badgeIcon: "size-2.5" },
  lg: { wrapper: "size-10", text: "text-sm", badge: "size-4", badgeIcon: "size-3" },
} as const

export function SenderAvatar({
  email,
  name,
  initials,
  size = "lg",
  variant = "primary",
  className,
}: {
  email: string
  name?: string
  /** Fallback harfler (initials). Verilmezse email/name'den cikarilir. */
  initials?: string
  size?: keyof typeof sizeMap
  variant?: "primary" | "muted"
  className?: string
}) {
  const domain = email ? getDomainFromEmail(email) : ""
  const cached = useBimiStore((s) => (domain ? s.cache[domain] : null))
  const resolve = useBimiStore((s) => s.resolve)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    if (!domain) return
    if (cached !== undefined && cached !== null) return
    resolve(domain)
  }, [domain, cached, resolve])

  const s = sizeMap[size]
  const letters =
    initials ||
    (() => {
      const src = (name?.trim() || email || "?").toString()
      const parts = src.split(/[\s@.]/).filter(Boolean)
      if (parts.length === 0) return "?"
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
      return (parts[0][0] + parts[1][0]).toUpperCase()
    })()

  const logoUrl = cached?.logoUrl && !imgError ? cached.logoUrl : null
  const verified = !!cached?.found && !!cached?.vmcUrl

  // Outer wrapper'da overflow-hidden YOK — badge avatar dışına taşabilsin.
  // Avatar görselinin keskin kenar yuvarlağa kırpılması için iç wrapper
  // kendi `overflow-hidden`'ını yönetir.
  return (
    <div className={cn("relative shrink-0", s.wrapper, className)}>
      <div
        className={cn(
          "flex size-full items-center justify-center overflow-hidden rounded-full",
          logoUrl
            ? "bg-white"
            : variant === "primary"
              ? "bg-primary/10 text-primary"
              : "bg-muted text-foreground",
        )}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            className="size-full object-contain"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <span className={cn("font-semibold", s.text)}>{letters}</span>
        )}
      </div>
      {verified && (
        <span
          className={cn(
            "absolute -right-0.5 -bottom-0.5 z-10 flex items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-background",
            s.badge,
          )}
          title="BIMI verified"
        >
          <HugeiconsIcon
            icon={Tick02Icon}
            strokeWidth={3}
            className={s.badgeIcon}
          />
        </span>
      )}
    </div>
  )
}
