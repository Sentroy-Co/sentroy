"use client"

import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlusSignIcon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import type { AppDescriptor } from "@workspace/console/components/layout/app-launcher"
import { WIDGET_REGISTRY } from "./registry"
import { useDesktopWidgets } from "./widget-store"

/**
 * Widget galerisi — WidgetPanel'in "Widgets" sekmesi (Apple widget galerisi
 * referansı). Registry'deki tipler mini önizleme kartlarıyla listelenir;
 * "Add" masaüstüne yeni instance ekler (kademeli offset, widget-store).
 * permGate'li tipler kullanıcının stage app'lerinde yoksa GÖRÜNMEZ.
 * Aynı tipten birden çok instance eklenebilir (örn. iki farklı mailbox).
 */
export function WidgetGallery({ apps }: { apps: AppDescriptor[] }) {
  const t = useTranslations("os")
  const widgets = useDesktopWidgets((s) => s.widgets)
  const add = useDesktopWidgets((s) => s.add)

  const appIds = new Set(apps.map((a) => a.id))
  const available = WIDGET_REGISTRY.filter(
    (d) => !d.permGate || appIds.has(d.permGate),
  )

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="grid grid-cols-2 gap-2.5">
        {available.map((def) => {
          const count = widgets.filter((w) => w.type === def.type).length
          return (
            <div
              key={def.type}
              className="flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm"
            >
              {/* Mini önizleme — marka renkli cam sahne + ikon çipi */}
              <div
                className="relative flex h-20 items-center justify-center"
                style={{
                  background: `radial-gradient(120% 120% at 20% 0%, ${def.color}2e 0%, transparent 70%)`,
                }}
              >
                <span
                  className="flex size-9 items-center justify-center rounded-xl shadow-md ring-1 ring-white/25 dark:ring-white/10"
                  style={{ background: def.color }}
                >
                  <HugeiconsIcon icon={def.icon} className="size-4.5 text-white" strokeWidth={2} />
                </span>
                {count > 0 ? (
                  <span className="absolute right-2 top-2 rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-foreground/70">
                    {t("widgetsHub.added", { count })}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3 pt-2.5">
                <span className="text-sm font-semibold leading-tight text-foreground">
                  {t(def.titleKey)}
                </span>
                <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {t(def.descriptionKey)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-auto h-7 gap-1 self-start px-2.5 text-xs"
                  onClick={() => add(def.type)}
                >
                  <HugeiconsIcon icon={PlusSignIcon} className="size-3" strokeWidth={2.5} />
                  {t("widgetsHub.add")}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
