"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

type ErrorStateProps = {
  title?: React.ReactNode
  description?: React.ReactNode
  onRetry?: () => void
  className?: string
}

export function ErrorState({
  title,
  description,
  onRetry,
  className,
}: ErrorStateProps) {
  const t = useTranslations("linearLite.common")
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center",
        className,
      )}
    >
      <h3 className="text-base font-medium text-foreground">
        {title ?? t("somethingWrong")}
      </h3>
      {description ? (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t("retry")}
        </Button>
      ) : null}
    </div>
  )
}
