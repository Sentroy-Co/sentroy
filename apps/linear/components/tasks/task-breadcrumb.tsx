"use client"

// Triage app/components/tasks/task-breadcrumb.tsx portu (PLAN §6).
import { useTranslations } from "next-intl"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { ArrowRight01FreeIcons } from "@hugeicons/core-free-icons"

import { Link } from "@/lib/router-compat"
import type { Issue } from "@/lib/linear/types"

type Props = {
  issue: Issue
}

export function TaskBreadcrumb({ issue }: Props) {
  const t = useTranslations("linearLite")
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
    >
      <Link
        to="/"
        className="transition-colors hover:text-foreground"
      >
        {t("tasks.title")}
      </Link>
      <Sep />
      {issue.parent ? (
        <>
          <Link
            to={`/tasks/${issue.parent.id}`}
            title={issue.parent.title}
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <span className="font-mono text-[10px] tracking-tight text-muted-foreground/80">
              {issue.parent.identifier}
            </span>
            <span className="max-w-[14ch] truncate">
              {issue.parent.title}
            </span>
          </Link>
          <Sep />
        </>
      ) : null}
      <span className="inline-flex items-center gap-1.5 text-foreground">
        <span className="font-mono text-[10px] tracking-tight text-muted-foreground">
          {issue.identifier}
        </span>
        <span className="max-w-[24ch] truncate font-medium">
          {issue.title}
        </span>
      </span>
    </nav>
  )
}

function Sep() {
  return (
    <HugeiconsIcon
      icon={ArrowRight01FreeIcons as IconSvgElement}
      size={10}
      strokeWidth={2}
      className="text-muted-foreground/50"
      aria-hidden
    />
  )
}
