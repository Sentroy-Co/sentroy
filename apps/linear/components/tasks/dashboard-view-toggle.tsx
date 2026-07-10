"use client"

import { useTranslations } from "next-intl"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  Menu02FreeIcons,
  DashboardSquare01FreeIcons,
} from "@hugeicons/core-free-icons"
import { useUiStore } from "@/stores/ui-store"
import { cn } from "@workspace/ui/lib/utils"

const OPTIONS: {
  value: "list" | "kanban"
  /** linearLite.tasks.view.* alt anahtarı */
  labelKey: "list" | "kanban"
  icon: IconSvgElement
}[] = [
  {
    value: "list",
    labelKey: "list",
    icon: Menu02FreeIcons as IconSvgElement,
  },
  {
    value: "kanban",
    labelKey: "kanban",
    icon: DashboardSquare01FreeIcons as IconSvgElement,
  },
]

export function DashboardViewToggle() {
  const t = useTranslations("linearLite.tasks.view")
  const view = useUiStore((s) => s.dashboardView)
  const setView = useUiStore((s) => s.setDashboardView)
  return (
    <div
      role="tablist"
      aria-label={t("label")}
      className="inline-flex items-center gap-0.5 rounded-lg border border-border/60 bg-background/60 p-0.5"
    >
      {OPTIONS.map((opt) => {
        const active = view === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-pressed={active}
            onClick={() => setView(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <HugeiconsIcon icon={opt.icon} size={12} strokeWidth={2} />
            {t(opt.labelKey)}
          </button>
        )
      })}
    </div>
  )
}
