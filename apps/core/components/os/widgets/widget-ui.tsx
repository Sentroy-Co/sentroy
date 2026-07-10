"use client"

import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, RefreshIcon } from "@hugeicons/core-free-icons"
import type { AppDescriptor } from "@workspace/console/components/layout/app-launcher"

type IconRef = AppDescriptor["icon"]

/**
 * Widget'ların ortak küçük durum bileşenleri — veri widget'ları (mail/storage/
 * linear) hata ve boş-config durumlarını aynı dille gösterir. Hata durumunda
 * widget GİZLENMEZ (platform kuralı) — kullanıcı isterse ✕ ile kaldırır.
 */

export function WidgetErrorState({ onRetry }: { onRetry?: () => void }) {
  const t = useTranslations("os")
  return (
    <div className="flex h-full min-h-[96px] flex-col items-center justify-center gap-1.5 p-4 text-center">
      <HugeiconsIcon icon={Alert02Icon} className="size-4 text-muted-foreground/70" strokeWidth={2} />
      <p className="text-xs text-muted-foreground">{t("widgetsHub.loadError")}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-0.5 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-foreground/80 hover:bg-foreground/10"
        >
          <HugeiconsIcon icon={RefreshIcon} className="size-3" strokeWidth={2} />
          {t("widgetsHub.retry")}
        </button>
      ) : null}
    </div>
  )
}

export function WidgetSpinner() {
  return (
    <div className="flex h-full min-h-[96px] items-center justify-center p-4">
      <span className="size-5 animate-spin rounded-full border-2 border-muted border-t-foreground/40" />
    </div>
  )
}

/** Config gerektiren widget'ın boş durumu — "Choose a …" + ⚙ aç butonu. */
export function WidgetChooseState({
  icon,
  color,
  label,
  onConfigure,
}: {
  icon: IconRef
  color: string
  label: string
  onConfigure: () => void
}) {
  return (
    <div className="flex h-full min-h-[96px] flex-col items-center justify-center gap-2 p-4 text-center">
      <span
        className="flex size-8 items-center justify-center rounded-lg ring-1 ring-white/25 dark:ring-white/10"
        style={{ background: color }}
      >
        <HugeiconsIcon icon={icon} className="size-4 text-white" strokeWidth={2} />
      </span>
      <button
        type="button"
        onClick={onConfigure}
        className="rounded-md px-2 py-1 text-xs font-medium text-foreground/80 hover:bg-foreground/10"
      >
        {label}
      </button>
    </div>
  )
}

/** Widget başlık satırı — küçük renkli ikon çipi + başlık (+ sağ aksesuar). */
export function WidgetHeader({
  icon,
  color,
  title,
  right,
}: {
  icon: IconRef
  color: string
  title: string
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-md ring-1 ring-white/25 dark:ring-white/10"
        style={{ background: color }}
      >
        <HugeiconsIcon icon={icon} className="size-3.5 text-white" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{title}</span>
      {right}
    </div>
  )
}
