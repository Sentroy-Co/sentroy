import { cn } from "@workspace/ui/lib/utils"
import { PillGrid } from "./pill-grid"
import type { ServiceSummary, ServiceStatus } from "../lib/aggregate"

const STATUS_LABEL: Record<ServiceStatus, string> = {
  operational: "Operational",
  degraded: "Degraded performance",
  down: "Major outage",
  "no-data": "No data",
}

const STATUS_DOT: Record<ServiceStatus, string> = {
  operational: "bg-emerald-500",
  degraded: "bg-amber-500",
  down: "bg-rose-500",
  "no-data": "bg-muted-foreground/40",
}

const STATUS_TEXT: Record<ServiceStatus, string> = {
  operational: "text-emerald-600 dark:text-emerald-400",
  degraded: "text-amber-600 dark:text-amber-400",
  down: "text-rose-600 dark:text-rose-400",
  "no-data": "text-muted-foreground",
}

export function ServiceRow({ service }: { service: ServiceSummary }) {
  return (
    <div className="border-b border-border px-5 py-5 last:border-b-0 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("size-2 rounded-full", STATUS_DOT[service.status])} />
            <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
              {service.label}
            </h3>
          </div>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{service.description}</p>
        </div>
        <div className="text-right">
          <div className={cn("text-[13px] font-medium", STATUS_TEXT[service.status])}>
            {STATUS_LABEL[service.status]}
          </div>
          {service.uptimePct !== null ? (
            <div className="font-mono text-[11px] text-muted-foreground">
              {service.uptimePct.toFixed(1)}% uptime
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-4">
        <PillGrid history={service.history} />
        <div className="mt-2 flex justify-between font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
          <span>{service.history.length}h ago</span>
          <span>now</span>
        </div>
      </div>
    </div>
  )
}
