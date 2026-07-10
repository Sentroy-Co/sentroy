"use client"

import { useTranslations } from "next-intl"
import { Link } from "@/lib/router-compat"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  ArrowDownRight01FreeIcons,
  PlusSignFreeIcons,
} from "@hugeicons/core-free-icons"

type Props = {
  issueId: string
}

export function AddSubTaskButton({ issueId }: Props) {
  const t = useTranslations("linearLite.tasks.sub_task")
  return (
    <div className="flex items-center gap-2 px-1">
      <HugeiconsIcon
        icon={ArrowDownRight01FreeIcons as IconSvgElement}
        size={12}
        strokeWidth={2}
        className="text-muted-foreground/50"
        aria-hidden
      />
      <Link
        to={`/tasks/new?parentId=${encodeURIComponent(issueId)}`}
        className="group inline-flex items-center gap-1.5 rounded-md border border-dashed border-border/60 bg-card/30 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-accent/40 hover:text-foreground"
      >
        <HugeiconsIcon
          icon={PlusSignFreeIcons as IconSvgElement}
          size={11}
          strokeWidth={2}
        />
        {t("add")}
      </Link>
    </div>
  )
}
