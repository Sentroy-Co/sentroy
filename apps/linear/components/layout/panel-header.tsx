"use client"

/**
 * Dashboard içi sayfa başlığı satırı — triage topbar.tsx'in sadeleştirilmiş
 * hali. Monorepo'da sidebar'ı ConsoleSidebar (AppSidebar + SidebarTrigger,
 * company layout'ta) verdiği için sidebar toggle'ları PORT EDİLMEDİ; kalan:
 * sayfa başlığı + arama butonu (command palette açar) + kısayol yardımı +
 * tema seçici.
 *
 * Self-contained: CommandPalette ve ShortcutsHelpDialog bu component içinde
 * mount edilir — PanelHeader kullanan sayfa ikisini AYRICA mount ETMESİN
 * (çift dialog/çift ⌘K listener olur).
 */

import { useTranslations } from "next-intl"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { Search01FreeIcons } from "@hugeicons/core-free-icons"
import { Kbd, KbdGroup } from "@workspace/ui/components/kbd"
import { cn } from "@workspace/ui/lib/utils"
import { useUiStore } from "@/stores/ui-store"
import { ThemeToggle } from "@/components/common/theme-toggle"
import {
  ShortcutsHelpButton,
  ShortcutsHelpDialog,
} from "@/components/common/shortcuts-help"
import { CommandPalette } from "@/components/layout/command-palette"
import { PushToggle } from "@/components/layout/push-toggle"

export function PanelHeader({
  title,
  actions,
  className,
}: {
  /** Sayfa başlığı (opsiyonel — bazı sayfalar kendi başlığını çizer). */
  title?: React.ReactNode
  /** Sağ tarafa, yardım/tema butonlarının soluna eklenecek ekstra aksiyonlar. */
  actions?: React.ReactNode
  className?: string
}) {
  const openCommand = useUiStore((s) => s.setCommandPalette)
  const t = useTranslations("linearLite.layout.header")
  const tPalette = useTranslations("linearLite.layout.palette")

  return (
    <>
      <div className={cn("flex h-12 shrink-0 items-center gap-3", className)}>
        {title ? (
          <h1 className="min-w-0 shrink-0 truncate text-base font-semibold tracking-tight">
            {title}
          </h1>
        ) : null}

        <button
          type="button"
          onClick={() => openCommand(true)}
          className={cn(
            "group flex h-9 w-full max-w-md min-w-0 items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-2.5 text-sm text-muted-foreground transition-colors",
            "hover:border-border hover:bg-background/80 hover:text-foreground",
            "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
          )}
          aria-label={t("searchLabel")}
        >
          <HugeiconsIcon
            icon={Search01FreeIcons as IconSvgElement}
            size={14}
            strokeWidth={2}
            className="text-muted-foreground/80"
          />
          <span className="flex-1 truncate text-left">
            {tPalette("placeholder")}
          </span>
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </button>

        <div className="ms-auto flex items-center gap-1">
          {actions}
          <PushToggle />
          <ShortcutsHelpButton />
          <ThemeToggle />
        </div>
      </div>

      <CommandPalette />
      <ShortcutsHelpDialog />
    </>
  )
}
