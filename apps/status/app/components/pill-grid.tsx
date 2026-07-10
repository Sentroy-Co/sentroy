import { cn } from "@workspace/ui/lib/utils"
import type { ServiceStatus } from "../lib/aggregate"

const PILL_TONE: Record<ServiceStatus, string> = {
  operational: "bg-emerald-500/80",
  degraded: "bg-amber-500/85",
  down: "bg-rose-500/85",
  "no-data": "bg-muted",
}

const PILL_TONE_INCIDENT_RESOLVED = "bg-emerald-500/80 ring-1 ring-amber-400/70 ring-inset"

function formatHour(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function statusLabel(s: ServiceStatus, hadIncident: boolean): string {
  if (s === "no-data") return "No data"
  if (s === "operational") return hadIncident ? "Recovered" : "Operational"
  if (s === "degraded") return "Degraded"
  return "Major outage"
}

export function PillGrid({
  history,
}: {
  history: Array<{ hour: string; status: ServiceStatus; hadIncident: boolean }>
}) {
  return (
    <div className="flex w-full items-end gap-[2px]">
      {history.map((b, idx) => {
        const tone =
          b.status === "operational" && b.hadIncident
            ? PILL_TONE_INCIDENT_RESOLVED
            : PILL_TONE[b.status]
        return (
          <div
            key={`${b.hour}-${idx}`}
            className="group relative flex-1"
            style={{ minWidth: "4px" }}
          >
            <div className={cn("h-7 w-full rounded-[2px] transition", tone)} />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5 text-[11px] font-medium text-popover-foreground shadow-md group-hover:block">
              <div className="font-mono text-muted-foreground">{formatHour(b.hour)}</div>
              <div className="mt-0.5">{statusLabel(b.status, b.hadIncident)}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
