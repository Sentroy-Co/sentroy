"use client"

import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"

type EmptyStateProps = {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-card/30 px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="text-muted-foreground" aria-hidden>
          {icon}
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-medium text-foreground">{title}</h3>
        {description ? (
          <p className="max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
