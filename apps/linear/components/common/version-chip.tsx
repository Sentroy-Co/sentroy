"use client"

import { useTranslations } from "next-intl"
import { Link } from "@/lib/router-compat"
import { cn } from "@workspace/ui/lib/utils"

type VersionChipProps = {
  className?: string
  /** Verilirse chip bu adrese giden bir Link olarak render edilir. */
  to?: string
}

const BASE_CLASS =
  "inline-flex items-center rounded-md border border-border/60 px-1.5 py-0.5 font-mono text-[10px] tracking-tight text-muted-foreground/80"

// next.config.ts `env.APP_VERSION` package.json sürümünü build-time inline eder.
const VERSION = process.env.APP_VERSION ?? "0.0.0"

export function VersionChip({ className, to }: VersionChipProps) {
  const t = useTranslations("linearLite.version")

  if (to) {
    return (
      <Link
        to={to}
        className={cn(
          BASE_CLASS,
          "transition-colors hover:border-border hover:text-foreground",
          className,
        )}
        aria-label={t("notesAria", { version: VERSION })}
        title={t("notes")}
      >
        v{VERSION}
      </Link>
    )
  }

  return (
    <span
      className={cn(BASE_CLASS, className)}
      aria-label={t("label", { version: VERSION })}
    >
      v{VERSION}
    </span>
  )
}
