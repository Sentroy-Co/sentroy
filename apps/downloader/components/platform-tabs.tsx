import { useTranslations } from "next-intl"
import { PLATFORM_ORDER, PLATFORMS, type Platform } from "@/lib/platform"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Platform sekmeleri. Her platform ayrı subdomain (youtube./instagram./
 * soundcloud.sentroy.com). Aktif olan (mevcut host) vurgulanır; Faz 2
 * platformları "Yakında" (disabled).
 */
export function PlatformTabs({ active }: { active: Platform }) {
  const t = useTranslations("d")
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {PLATFORM_ORDER.map((id) => {
        const p = PLATFORMS[id]
        const isActive = id === active
        const base =
          "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors"
        if (!p.enabled) {
          return (
            <span
              key={id}
              className={cn(base, "cursor-not-allowed opacity-50")}
              aria-disabled
            >
              {p.label}
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase">
                {t("tabComingSoon")}
              </span>
            </span>
          )
        }
        return (
          <a
            key={id}
            href={`https://${p.host}`}
            className={cn(
              base,
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-muted/40",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            {p.label}
          </a>
        )
      })}
    </div>
  )
}
