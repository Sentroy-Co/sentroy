"use client"

import { useTranslations } from "next-intl"
import { cn } from "@workspace/ui/lib/utils"
import type { IssueState, IssueStateType } from "@/lib/linear/types"

/** linearLite.tasks.status.* alt anahtarları */
const TYPE_TO_KEY: Record<IssueStateType, string> = {
  triage: "backlog",
  backlog: "backlog",
  unstarted: "todo",
  started: "in_progress",
  completed: "done",
  canceled: "cancelled",
}

type Props = {
  state: IssueState
  className?: string
}

export function TaskStatusBadge({ state, className }: Props) {
  const t = useTranslations("linearLite.tasks.status")
  const label = t(TYPE_TO_KEY[state.type])
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-foreground/80",
        className,
      )}
      title={state.name}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: state.color }}
      />
      {label}
    </span>
  )
}
