import { cn } from "@workspace/ui/lib/utils"
import type { ServiceStatus } from "../lib/aggregate"

const BANNER_COPY: Record<ServiceStatus, { headline: string; sub: string; tone: string }> = {
  operational: {
    headline: "All systems operational",
    sub: "Every Sentroy service is responding normally.",
    tone: "border-emerald-500/30 bg-emerald-500/[0.08]",
  },
  degraded: {
    headline: "Partial degradation",
    sub: "One or more services are responding slowly. Functionality may be impacted.",
    tone: "border-amber-500/30 bg-amber-500/[0.08]",
  },
  down: {
    headline: "Major outage",
    sub: "One or more services are unavailable. We're working to restore them.",
    tone: "border-rose-500/30 bg-rose-500/[0.08]",
  },
  "no-data": {
    headline: "Status unavailable",
    sub: "We haven't received probe data yet. Check back in a few minutes.",
    tone: "border-border bg-muted/40",
  },
}

const ICON_DOT: Record<ServiceStatus, string> = {
  operational: "bg-emerald-500",
  degraded: "bg-amber-500",
  down: "bg-rose-500",
  "no-data": "bg-muted-foreground/40",
}

export function OverallBanner({ status }: { status: ServiceStatus }) {
  const copy = BANNER_COPY[status]
  return (
    <div className={cn("flex items-center gap-4 rounded-2xl border p-5 sm:p-6", copy.tone)}>
      <div className="relative">
        <span className={cn("absolute inset-0 -m-1 animate-ping rounded-full opacity-40", ICON_DOT[status])} />
        <span className={cn("relative block size-3 rounded-full", ICON_DOT[status])} />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
          {copy.headline}
        </h2>
        <p className="mt-0.5 text-[13.5px] text-muted-foreground">{copy.sub}</p>
      </div>
    </div>
  )
}
