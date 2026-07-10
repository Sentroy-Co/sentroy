import Link from "next/link"
import { PAGE_ORDER } from "../lib/nav"

const ArrowLeft = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
)

const ArrowRight = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
)

export function PageFooter({ current }: { current: string }) {
  const idx = PAGE_ORDER.findIndex((p) => p.href === current)
  const prev = idx > 0 ? PAGE_ORDER[idx - 1] : null
  const next = idx >= 0 && idx < PAGE_ORDER.length - 1 ? PAGE_ORDER[idx + 1] : null

  return (
    <div className="mt-20 grid gap-3 border-t border-border pt-8 sm:grid-cols-2">
      {prev ? (
        <Link
          href={prev.href}
          className="group flex flex-col gap-1 rounded-lg border border-border p-4 transition hover:border-foreground/40"
        >
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <ArrowLeft className="size-3" /> Previous
          </span>
          <span className="font-medium text-foreground">{prev.label}</span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={next.href}
          className="group flex flex-col items-end gap-1 rounded-lg border border-border p-4 text-right transition hover:border-foreground/40 sm:col-start-2"
        >
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Next <ArrowRight className="size-3" />
          </span>
          <span className="font-medium text-foreground">{next.label}</span>
        </Link>
      ) : null}
    </div>
  )
}
