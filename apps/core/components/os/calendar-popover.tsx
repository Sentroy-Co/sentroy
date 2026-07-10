"use client"

import { useMemo, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/**
 * Menü bar saat/tarih → Apple tarzı takvim popover'ı. Bugün kırmızı daire ile
 * vurgulanır, ay-ay gezinme + "Today". Ay/gün adları aktif locale'e göre
 * (`lang`) — hard-coded İngilizce değil.
 */
export function CalendarPopover({ label, lang }: { label: string; lang: string }) {
  const today = new Date()
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))

  const year = view.getFullYear()
  const month = view.getMonth()

  // Locale'e göre hafta günü kısaltmaları (Pazar başlangıçlı — grid getDay ile).
  const weekdays = useMemo(() => {
    // 2023-01-01 bir Pazar; 7 gün → Su..Sa lokalize.
    return Array.from({ length: 7 }, (_, i) =>
      new Date(2023, 0, 1 + i).toLocaleDateString(lang, { weekday: "short" }),
    )
  }, [lang])
  const monthLabel = view.toLocaleDateString(lang, { month: "long", year: "numeric" })

  const firstWeekday = new Date(year, month, 1).getDay()
  const start = new Date(year, month, 1 - firstWeekday)
  const cells = Array.from({ length: 42 }, (_, i) => {
    const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    return { dt, current: dt.getMonth() === month, isToday: sameDay(dt, today) }
  })

  function shift(delta: number) {
    setView(new Date(year, month + delta, 1))
  }

  return (
    <Popover>
      <PopoverTrigger className="select-none rounded-md px-2 py-1 text-sm tabular-nums text-foreground/80 outline-none hover:bg-black/5 dark:hover:bg-white/10">
        {label}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[264px] select-none gap-3 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold capitalize text-foreground">{monthLabel}</span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => shift(-1)}
              aria-label="Previous month"
              className="flex size-6 items-center justify-center rounded-md text-foreground/60 hover:bg-foreground/10"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => setView(new Date(today.getFullYear(), today.getMonth(), 1))}
              className="rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-foreground/10"
            >
              {lang === "tr" ? "Bugün" : "Today"}
            </button>
            <button
              type="button"
              onClick={() => shift(1)}
              aria-label="Next month"
              className="flex size-6 items-center justify-center rounded-md text-foreground/60 hover:bg-foreground/10"
            >
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {weekdays.map((w, i) => (
            <div key={i} className="text-center text-[11px] font-medium capitalize text-muted-foreground">
              {w}
            </div>
          ))}
          {cells.map(({ dt, current, isToday }, i) => (
            <div key={i} className="flex items-center justify-center">
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-[13px] tabular-nums",
                  isToday
                    ? "bg-red-500 font-semibold text-white"
                    : current
                      ? "text-foreground"
                      : "text-muted-foreground/40",
                )}
              >
                {dt.getDate()}
              </span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
