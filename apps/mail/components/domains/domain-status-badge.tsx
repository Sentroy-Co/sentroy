"use client"

import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"

type DomainStatus = "pending" | "verifying" | "active" | "failed"

const statusStyles: Record<DomainStatus, string> = {
  pending:
    "border-border text-muted-foreground bg-transparent",
  verifying:
    "border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  active:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  failed:
    "border-destructive/30 bg-destructive/10 text-destructive",
}

export function DomainStatusBadge({ status }: { status: DomainStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(statusStyles[status])}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  )
}
