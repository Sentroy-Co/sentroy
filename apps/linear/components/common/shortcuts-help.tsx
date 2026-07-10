"use client"

import { useTranslations } from "next-intl"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { KeyboardFreeIcons } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Kbd, KbdGroup } from "@workspace/ui/components/kbd"
import { useUiStore } from "@/stores/ui-store"

type ShortcutItem = {
  keys: React.ReactNode
  label: string
}

type ShortcutGroup = {
  title: string
  items: ShortcutItem[]
}

const KEY = (...keys: string[]) => (
  <KbdGroup>
    {keys.map((k, i) => (
      <Kbd key={i}>{k}</Kbd>
    ))}
  </KbdGroup>
)

export function ShortcutsHelpButton({ className }: { className?: string }) {
  const t = useTranslations("linearLite.shortcuts")
  const setOpen = useUiStore((s) => s.setShortcutsHelp)
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={() => setOpen(true)}
      aria-label={t("open")}
      className={className}
    >
      <HugeiconsIcon
        icon={KeyboardFreeIcons as IconSvgElement}
        size={16}
        strokeWidth={2}
      />
    </Button>
  )
}

export function ShortcutsHelpDialog() {
  const t = useTranslations("linearLite.shortcuts")
  const open = useUiStore((s) => s.shortcutsHelpOpen)
  const setOpen = useUiStore((s) => s.setShortcutsHelp)

  // "g sonra d" tarzı ardışık kısayol gösterimi (araya çevrilmiş "sonra").
  const seq = (a: string, b: string) => (
    <KbdGroup>
      <Kbd>{a}</Kbd>
      <span className="text-muted-foreground/60">{t("then")}</span>
      <Kbd>{b}</Kbd>
    </KbdGroup>
  )

  const groups: ShortcutGroup[] = [
    {
      title: t("groupNavigation"),
      items: [
        { keys: seq("g", "d"), label: t("goDashboard") },
        { keys: seq("g", "i"), label: t("goInbox") },
        { keys: seq("g", "n"), label: t("goNew") },
      ],
    },
    {
      title: t("groupActions"),
      items: [
        { keys: KEY("c"), label: t("create") },
        { keys: KEY("/"), label: t("openPalette") },
        { keys: KEY("⌘", "K"), label: t("openPaletteAlt") },
        { keys: KEY("?"), label: t("help") },
      ],
    },
    {
      title: t("groupView"),
      items: [{ keys: KEY("t"), label: t("themeToggle") }],
    },
    {
      title: t("groupEditor"),
      items: [
        { keys: KEY("⌘", "Enter"), label: t("submitComment") },
        { keys: KEY("⌘", "B"), label: t("bold") },
        { keys: KEY("⌘", "I"), label: t("italic") },
        { keys: KEY("⌘", "K"), label: t("insertLink") },
      ],
    },
  ]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon
              icon={KeyboardFreeIcons as IconSvgElement}
              size={16}
              strokeWidth={2}
            />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <section key={group.title} className="flex flex-col gap-1.5">
              <h3 className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/80 uppercase">
                {group.title}
              </h3>
              <ul className="flex flex-col rounded-lg border border-border/60 bg-card/50">
                {group.items.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2 last:border-b-0"
                  >
                    <span className="text-sm text-foreground">{item.label}</span>
                    {item.keys}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
