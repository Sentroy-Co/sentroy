"use client"

import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"

type LogStatus = "queued" | "processing" | "sent" | "bounced" | "failed"

const statusStyles: Record<LogStatus, string> = {
  queued:
    "border-border text-muted-foreground bg-transparent",
  processing:
    "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  sent:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  bounced:
    "border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  failed:
    "border-destructive/30 bg-destructive/10 text-destructive",
}

export function LogStatusBadge({ status }: { status: LogStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(statusStyles[status])}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  )
}
