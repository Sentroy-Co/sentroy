import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import { GlobalIcon, MapsCircle01Icon, Notebook01Icon } from "@hugeicons/core-free-icons"

interface SiteFooterProps {
  lang: string
  labels: {
    tagline: string
    docs: string
    status: string
    sentroy: string
  }
}

export function SiteFooter({ lang, labels }: SiteFooterProps) {
  const coreUrl = process.env.NEXT_PUBLIC_CORE_APP_URL || "https://sentroy.com"
  const docsUrl = process.env.NEXT_PUBLIC_DOCS_URL || "https://docs.sentroy.com"
  const statusUrl =
    process.env.NEXT_PUBLIC_STATUS_URL || "https://status.sentroy.com"

  return (
    <footer className="mt-auto border-t border-border/50 bg-background/50">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">{labels.tagline}</p>
        <nav className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <Link
            href={`${coreUrl}/${lang}`}
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <HugeiconsIcon icon={GlobalIcon} strokeWidth={2} className="size-3" />
            {labels.sentroy}
          </Link>
          <Link
            href={`${docsUrl}/auth`}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <HugeiconsIcon
              icon={Notebook01Icon}
              strokeWidth={2}
              className="size-3"
            />
            {labels.docs}
          </Link>
          <Link
            href={statusUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <HugeiconsIcon
              icon={MapsCircle01Icon}
              strokeWidth={2}
              className="size-3"
            />
            {labels.status}
          </Link>
        </nav>
      </div>
    </footer>
  )
}
