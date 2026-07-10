"use client"

import { useTranslations } from "next-intl"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  AlertCircleFreeIcons,
  ArrowUp02FreeIcons,
  Menu02FreeIcons,
  ArrowDown02FreeIcons,
  MinusSignFreeIcons,
} from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"
import type { IssuePriority } from "@/lib/linear/types"

type Mapping = {
  icon: IconSvgElement
  className: string
  /** linearLite.tasks.priority.* alt anahtarı */
  labelKey: string
}

const MAP: Record<IssuePriority, Mapping> = {
  0: {
    icon: MinusSignFreeIcons as IconSvgElement,
    className: "text-muted-foreground/60",
    labelKey: "no_priority",
  },
  1: {
    icon: AlertCircleFreeIcons as IconSvgElement,
    className: "text-destructive",
    labelKey: "urgent",
  },
  2: {
    icon: ArrowUp02FreeIcons as IconSvgElement,
    className: "text-orange-500",
    labelKey: "high",
  },
  3: {
    icon: Menu02FreeIcons as IconSvgElement,
    className: "text-yellow-600 dark:text-yellow-400",
    labelKey: "medium",
  },
  4: {
    icon: ArrowDown02FreeIcons as IconSvgElement,
    className: "text-muted-foreground",
    labelKey: "low",
  },
}

type Props = {
  priority: IssuePriority
  size?: number
  className?: string
  showLabel?: boolean
}

export function TaskPriorityIcon({
  priority,
  size = 14,
  className,
  showLabel = false,
}: Props) {
  const t = useTranslations("linearLite.tasks.priority")
  const m = MAP[priority]
  const label = t(m.labelKey)
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        m.className,
        className,
      )}
      title={label}
      aria-label={label}
    >
      <HugeiconsIcon icon={m.icon} size={size} strokeWidth={2} />
      {showLabel ? <span>{label}</span> : null}
    </span>
  )
}
