"use client"

import { motion } from "framer-motion"
import { useLocale, useTranslations } from "next-intl"
import { Link } from "@/lib/router-compat"
import { cn } from "@workspace/ui/lib/utils"
import { TaskStatusBadge } from "./task-status-badge"
import { TaskPriorityIcon } from "./task-priority-icon"
import { TaskContextMenu } from "./task-context-menu"
import type {
  Issue,
  IssueLabel,
  IssueState,
} from "@/lib/linear/types"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

type Props = {
  issue: Issue
  states?: IssueState[]
  labels?: IssueLabel[]
  className?: string
}

function useRelativeFormat(): (value: string) => string {
  const t = useTranslations("linearLite.tasks.relative")
  const locale = useLocale()
  return (value: string): string => {
    try {
      const d = new Date(value)
      const diffMs = Date.now() - d.getTime()
      const minute = 60_000
      const hour = 60 * minute
      const day = 24 * hour
      if (diffMs < minute) return t("now")
      if (diffMs < hour)
        return t("minutes", { count: Math.floor(diffMs / minute) })
      if (diffMs < day) return t("hours", { count: Math.floor(diffMs / hour) })
      if (diffMs < 30 * day)
        return t("days", { count: Math.floor(diffMs / day) })
      return d.toLocaleDateString(locale)
    } catch {
      return ""
    }
  }
}

export function TaskCard({ issue, states, labels, className }: Props) {
  const reduce = useReducedMotion()
  const formatRelative = useRelativeFormat()
  const card = (
    <motion.div
      layoutId={`task-${issue.id}`}
      whileHover={reduce ? undefined : { y: -1 }}
      transition={{ duration: 0.14, ease: [0.32, 0.72, 0, 1] }}
      className={cn(
        "group flex items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5 transition-colors hover:border-border hover:bg-accent/30",
        className,
      )}
    >
      <Link
        to={`/tasks/${issue.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 outline-none"
      >
        <TaskPriorityIcon priority={issue.priority} />
        <span className="font-mono text-[10px] tracking-tight text-muted-foreground">
          {issue.identifier}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {issue.title}
        </span>
        <div className="hidden items-center gap-2 sm:flex">
          {issue.labels.slice(0, 2).map((l) => (
            <span
              key={l.id}
              className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: l.color }}
              />
              {l.name}
            </span>
          ))}
        </div>
        <TaskStatusBadge state={issue.state} />
        <span className="hidden w-12 shrink-0 text-right text-[11px] text-muted-foreground md:inline-block">
          {formatRelative(issue.updatedAt)}
        </span>
      </Link>
    </motion.div>
  )

  if (!states || !labels) return card

  return (
    <TaskContextMenu issue={issue} states={states} labels={labels}>
      {card}
    </TaskContextMenu>
  )
}

export function TaskCardSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5">
      <div className="size-3 animate-pulse rounded-sm bg-muted" />
      <div className="h-3 w-10 animate-pulse rounded bg-muted font-mono" />
      <div className="h-3 w-full max-w-[40%] animate-pulse rounded bg-muted" />
      <div className="ml-auto h-4 w-16 animate-pulse rounded-full bg-muted" />
    </div>
  )
}
