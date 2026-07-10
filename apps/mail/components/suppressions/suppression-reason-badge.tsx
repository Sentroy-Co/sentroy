"use client"

import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"

type SuppressionReason = "bounce" | "unsubscribe" | "complaint" | "manual"

const reasonStyles: Record<SuppressionReason, string> = {
  bounce:
    "border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  unsubscribe:
    "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  complaint:
    "border-destructive/30 bg-destructive/10 text-destructive",
  manual:
    "border-border text-muted-foreground bg-transparent",
}

export function SuppressionReasonBadge({
  reason,
}: {
  reason: SuppressionReason
}) {
  return (
    <Badge
      variant="outline"
      className={cn(reasonStyles[reason])}
    >
      {reason.charAt(0).toUpperCase() + reason.slice(1)}
    </Badge>
  )
}
