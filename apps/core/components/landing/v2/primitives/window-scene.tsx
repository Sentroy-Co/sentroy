"use client"

// WindowScene — Sentroy OS pencere kromunun landing reprodüksiyonu.
// Gerçek window-frame.tsx'in görsel dili (traffic lights, cam titlebar, gölge)
// birebir; davranışı YOK (sürükleme/resize landing'de gereksiz). İçerik = statik
// DOM mock (iframe DEĞİL — jüri kuralı).

import type { ReactNode, CSSProperties } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { cn } from "@workspace/ui/lib/utils"
import { productLogoUrl, type LandingProduct } from "../data/products"

export function WindowScene({
  product,
  title,
  children,
  className,
  style,
  dimmed = false,
}: {
  product: LandingProduct
  /** Titlebar başlığı (i18n'den çözülmüş). */
  title: string
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** Odak dışı pencere: parlaklık düşer (blur YOK — jüri kuralı). */
  dimmed?: boolean
}) {
  // OS dock ile ortak özel PNG logo; yoksa (yalnız "os") hugeicons glyph'i.
  const logoUrl = productLogoUrl(product.id)
  return (
    <div
      style={style}
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-white/[0.1]",
        "bg-[#101014]/90 shadow-[0_32px_90px_-24px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-xl",
        "transition-[filter] duration-300",
        dimmed && "brightness-[0.72] saturate-[0.85]",
        className,
      )}
    >
      {/* Titlebar — gerçek OS kromu: traffic lights + ikon + başlık. */}
      <div className="flex h-10 shrink-0 items-center gap-2.5 border-b border-white/[0.06] bg-white/[0.04] px-3.5">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="h-3 w-3 rounded-full bg-[#ff5f57] ring-1 ring-black/20" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e] ring-1 ring-black/20" />
          <span className="h-3 w-3 rounded-full bg-[#28c840] ring-1 ring-black/20" />
        </div>
        <span
          className="ml-1.5 flex h-5 w-5 items-center justify-center overflow-hidden rounded-md"
          style={logoUrl ? undefined : { background: `linear-gradient(150deg, ${product.color}, ${product.color}cc)` }}
          aria-hidden
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-full object-cover" />
          ) : (
            <HugeiconsIcon icon={product.icon} className="h-3 w-3 text-white" strokeWidth={2} />
          )}
        </span>
        <span className="truncate text-xs font-medium text-white/70">{title}</span>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
