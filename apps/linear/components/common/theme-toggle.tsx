"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { useTranslations } from "next-intl"
import {
  HugeiconsIcon,
  type IconSvgElement,
} from "@hugeicons/react"
import {
  Sun03FreeIcons,
  Moon02FreeIcons,
  ComputerFreeIcons,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

const THEMES: { key: "light" | "dark" | "system"; icon: IconSvgElement }[] = [
  { key: "light", icon: Sun03FreeIcons as IconSvgElement },
  { key: "dark", icon: Moon02FreeIcons as IconSvgElement },
  { key: "system", icon: ComputerFreeIcons as IconSvgElement },
]

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const t = useTranslations("linearLite.theme")
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const current = mounted ? (theme ?? "system") : "system"
  const triggerIcon =
    (resolvedTheme ?? "light") === "dark"
      ? (Moon02FreeIcons as IconSvgElement)
      : (Sun03FreeIcons as IconSvgElement)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("toggle")}
          >
            <HugeiconsIcon icon={triggerIcon} size={16} strokeWidth={2} />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-36">
        {THEMES.map(({ key, icon }) => (
          <DropdownMenuItem
            key={key}
            onClick={() => setTheme(key)}
            className={current === key ? "bg-accent" : undefined}
          >
            <HugeiconsIcon icon={icon} size={14} />
            {t(key)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
