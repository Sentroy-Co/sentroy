"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { Search01Icon } from "@hugeicons/core-free-icons"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@workspace/ui/components/context-menu"
import type { AppDescriptor } from "@workspace/console/components/layout/app-launcher"
import { isStoreApp, uninstallStoreApp } from "./uninstall-app"
import { useDockPinStore } from "./dock-pin-store"

/**
 * macOS Launchpad — kullanıcının TÜM uygulamalarının (ürün app'leri + yüklü
 * App Store app'leri + App Store'un kendisi) ızgarası. Bir app'e tıkla → OS
 * penceresinde açılır ve Launchpad kapanır (macOS davranışı). Üstte arama.
 */
export function LaunchpadApps({
  apps,
  storeApps = [],
  onOpen,
  onClose,
}: {
  /** stageApps (ürün app'leri + sistem ekranları, örn. App Store). */
  apps: AppDescriptor[]
  /** Yüklü store app'leri. */
  storeApps?: AppDescriptor[]
  onOpen: (d: AppDescriptor) => void
  onClose: () => void
}) {
  const t = useTranslations("os")
  const [q, setQ] = useState("")
  const query = q.trim().toLowerCase()
  // Dock görünürlüğü — ürün/sistem app'leri buradan dock'a eklenir/çıkarılır.
  const hidden = useDockPinStore((s) => s.hidden)
  const hideApp = useDockPinStore((s) => s.hide)
  const showApp = useDockPinStore((s) => s.show)

  const all = useMemo(() => {
    const seen = new Set<string>()
    const merged: AppDescriptor[] = []
    // launchpad'in kendisini gösterme; gerisini (product + store screen + installed) dedupe et.
    for (const a of [...apps, ...storeApps]) {
      if (a.id === "launchpad" || seen.has(a.id)) continue
      seen.add(a.id)
      merged.push(a)
    }
    return merged
  }, [apps, storeApps])

  const filtered = query ? all.filter((a) => a.name.toLowerCase().includes(query)) : all

  function open(a: AppDescriptor) {
    onOpen(a)
    onClose()
  }

  return (
    <div className="flex h-full select-none flex-col bg-transparent">
      <div className="shrink-0 border-b border-border/60 p-3">
        <div className="relative mx-auto max-w-md">
          <HugeiconsIcon icon={Search01Icon} className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("launchpadSearch")}
            autoFocus
            className="w-full rounded-full border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">{t("noResults")}</p>
        ) : (
          <div className="mx-auto grid max-w-3xl grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-4">
            {filtered.map((a) => (
              <ContextMenu key={a.id}>
                <ContextMenuTrigger
                  render={
                    <button
                      type="button"
                      onClick={() => open(a)}
                      className="group flex flex-col items-center gap-2 rounded-2xl p-2 text-center outline-none transition hover:bg-foreground/5"
                    >
                      <span
                        className="flex size-16 items-center justify-center overflow-hidden rounded-[24%] shadow-md ring-1 ring-black/5 transition group-hover:scale-105"
                        style={{ background: `linear-gradient(150deg, ${a.color}, ${a.color}cc)` }}
                      >
                        {a.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.logoUrl} alt="" draggable={false} className="size-full object-cover select-none" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                        ) : (
                          <HugeiconsIcon icon={a.icon} className="size-8 text-white drop-shadow" strokeWidth={2} />
                        )}
                      </span>
                      <span className="line-clamp-2 text-xs font-medium leading-tight text-foreground">{a.name}</span>
                    </button>
                  }
                />
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => open(a)}>{t("dock.open")}</ContextMenuItem>
                  {isStoreApp(a) ? (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        variant="destructive"
                        onClick={async () => {
                          await uninstallStoreApp(a, {
                            title: t("store.confirmRemoveTitle", { app: a.name }),
                            description: t("store.confirmRemoveDesc"),
                            confirmText: t("store.remove"),
                            success: t("store.removedToast", { app: a.name }),
                            failed: t("store.removeFailed"),
                          })
                        }}
                      >
                        {t("store.remove")}
                      </ContextMenuItem>
                    </>
                  ) : (
                    // Ürün/sistem app'leri: dock'a ekle / dock'tan kaldır (Launchpad geri-ekleme kapısı).
                    <>
                      <ContextMenuSeparator />
                      {hidden.includes(a.id) ? (
                        <ContextMenuItem onClick={() => showApp(a.id)}>{t("pinToDock")}</ContextMenuItem>
                      ) : (
                        <ContextMenuItem onClick={() => hideApp(a.id)}>{t("unpinFromDock")}</ContextMenuItem>
                      )}
                    </>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
