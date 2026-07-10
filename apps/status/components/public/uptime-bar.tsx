"use client"

import { useState } from "react"

type DailyStatus = "operational" | "degraded" | "down" | "no-data"

interface Props {
  history: Array<{ date: string; status: DailyStatus }>
  labels?: {
    operational?: string
    degraded?: string
    down?: string
    noData?: string
  }
}

const COLOR: Record<DailyStatus, string> = {
  operational: "#10b981",
  degraded: "#f59e0b",
  down: "#ef4444",
  "no-data": "#e4e4e7",
}

/**
 * 90-day uptime bar chart — Atlassian Statuspage benzeri. Her bar günlük
 * status'u rengini göstermeyle birlikte hover'da floating tooltip
 * (tarih + status label).
 */
export function UptimeBar({ history, labels }: Props) {
  const [hovered, setHovered] = useState<number | null>(null)
  const labelMap: Record<DailyStatus, string> = {
    operational: labels?.operational ?? "Operational",
    degraded: labels?.degraded ?? "Degraded",
    down: labels?.down ?? "Down",
    "no-data": labels?.noData ?? "No data",
  }

  return (
    <div
      className="relative mt-2 flex items-end gap-[2px] h-7"
      role="img"
      aria-label="90-day uptime chart"
    >
      {history.map((d, i) => {
        const isHovered = hovered === i
        return (
          <div
            key={d.date}
            className="relative flex-1 h-full"
            style={{ minWidth: "2px" }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
          >
            <div
              className="h-full w-full rounded-[1px] transition-opacity hover:opacity-70"
              style={{ background: COLOR[d.status] }}
            />
            {isHovered ? (
              <div
                className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-[10px] text-background shadow-lg"
              >
                <div className="font-medium tabular-nums">{formatDate(d.date)}</div>
                <div className="mt-0.5 flex items-center gap-1.5 opacity-90">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: COLOR[d.status] }}
                  />
                  {labelMap[d.status]}
                </div>
                <div
                  className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45"
                  style={{ background: "var(--foreground, #111)" }}
                />
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function formatDate(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split("-")
  if (!y || !m || !d) return yyyymmdd
  const date = new Date(`${y}-${m}-${d}T00:00:00Z`)
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}
