"use client"

import * as React from "react"
import { format } from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Calendar03Icon,
  Clock01Icon,
  Cancel01Icon,
  ArrowLeftIcon,
  ArrowRightIcon,
} from "@hugeicons/core-free-icons"

import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

export interface DateTimePickerProps {
  value?: string
  onChange: (value: string | undefined) => void
  placeholder?: string
  disabled?: boolean
  min?: Date
  className?: string
}

function parseDatetime(str: string | undefined): Date | undefined {
  if (!str) return undefined
  const d = new Date(str)
  return isNaN(d.getTime()) ? undefined : d
}

function toDatetimeStr(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  const h = String(d.getHours()).padStart(2, "0")
  const m = String(d.getMinutes()).padStart(2, "0")
  return `${y}-${mo}-${day}T${h}:${m}`
}

function withTime(d: Date, timeStr: string): Date {
  const [h, m] = timeStr.split(":").map(Number)
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    h ?? 0,
    m ?? 0,
    0,
    0,
  )
}

function getTimeStr(d: Date | undefined): string {
  if (!d) return "12:00"
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

type PickerView = "days" | "months" | "years"

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick date & time",
  disabled,
  min,
  className,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [view, setView] = React.useState<PickerView>("days")
  const selected = parseDatetime(value)
  const [timeStr, setTimeStr] = React.useState(getTimeStr(selected))
  const today = React.useMemo(() => new Date(), [])
  const [displayMonth, setDisplayMonth] = React.useState<Date>(
    () => selected ?? today,
  )

  React.useEffect(() => {
    setTimeStr(getTimeStr(parseDatetime(value)))
  }, [value])

  React.useEffect(() => {
    if (open) {
      setView("days")
      setDisplayMonth(parseDatetime(value) ?? today)
    }
    // "selected" objesi her render'da yeni referans ürettiği için
    // dependency olarak "value" stringini kullanıyoruz — sonsuz döngü önlemi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value, today])

  function handleDateSelect(date: Date | undefined) {
    if (!date) {
      onChange(undefined)
      return
    }
    onChange(toDatetimeStr(withTime(date, timeStr)))
  }

  function handleTimeChange(t: string) {
    setTimeStr(t)
    if (selected) {
      onChange(toDatetimeStr(withTime(selected, t)))
    }
  }

  function handlePrev() {
    setDisplayMonth((d) => {
      if (view === "days")
        return new Date(d.getFullYear(), d.getMonth() - 1, 1)
      if (view === "months")
        return new Date(d.getFullYear() - 1, d.getMonth(), 1)
      return new Date(d.getFullYear() - 12, d.getMonth(), 1)
    })
  }

  function handleNext() {
    setDisplayMonth((d) => {
      if (view === "days")
        return new Date(d.getFullYear(), d.getMonth() + 1, 1)
      if (view === "months")
        return new Date(d.getFullYear() + 1, d.getMonth(), 1)
      return new Date(d.getFullYear() + 12, d.getMonth(), 1)
    })
  }

  const yearStart = Math.floor(displayMonth.getFullYear() / 12) * 12
  const years = Array.from({ length: 12 }, (_, i) => yearStart + i)
  const monthName = displayMonth.toLocaleString("en-US", { month: "long" })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "flex h-9 w-full items-center gap-2 rounded-3xl border border-transparent bg-input/50 px-3 text-sm transition-colors",
              "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30",
              "disabled:cursor-not-allowed disabled:opacity-50",
              !value && "text-muted-foreground",
              className,
            )}
          />
        }
      >
        <HugeiconsIcon
          icon={Calendar03Icon}
          strokeWidth={2}
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="flex-1 truncate text-start">
          {selected ? format(selected, "dd MMM yyyy, HH:mm") : placeholder}
        </span>
        {value && !disabled && (
          <span
            role="button"
            tabIndex={-1}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              onChange(undefined)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation()
                onChange(undefined)
              }
            }}
          >
            <HugeiconsIcon
              icon={Cancel01Icon}
              strokeWidth={2}
              className="size-3.5"
            />
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto gap-0 p-0">
        {/* Navigation */}
        <div className="flex items-center justify-between px-3 pt-3 pb-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handlePrev}
          >
            <HugeiconsIcon
              icon={ArrowLeftIcon}
              strokeWidth={2}
              className="size-4"
            />
          </Button>

          <div className="flex items-center gap-0.5">
            {view === "years" ? (
              <span className="inline-flex h-7 items-center px-2 text-sm font-medium">
                {yearStart}&ndash;{yearStart + 11}
              </span>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-7 px-2 text-sm font-medium capitalize",
                    view === "months" && "bg-accent",
                  )}
                  onClick={() =>
                    setView((v) => (v === "months" ? "days" : "months"))
                  }
                >
                  {monthName}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-sm font-medium"
                  onClick={() => setView("years")}
                >
                  {displayMonth.getFullYear()}
                </Button>
              </>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handleNext}
          >
            <HugeiconsIcon
              icon={ArrowRightIcon}
              strokeWidth={2}
              className="size-4"
            />
          </Button>
        </div>

        {/* Days */}
        {view === "days" && (
          <Calendar
            mode="single"
            selected={selected}
            onSelect={handleDateSelect}
            month={displayMonth}
            onMonthChange={setDisplayMonth}
            disabled={min ? (date) => date < min : undefined}
            fixedWeeks
            classNames={{
              month_caption: "hidden",
              nav: "hidden",
            }}
          />
        )}

        {/* Months */}
        {view === "months" && (
          <div className="grid grid-cols-3 gap-1.5 p-3">
            {Array.from({ length: 12 }, (_, i) => {
              const label = new Date(
                displayMonth.getFullYear(),
                i,
                1,
              ).toLocaleString("en-US", { month: "short" })
              const isCurrent = i === displayMonth.getMonth()
              const isToday =
                i === today.getMonth() &&
                displayMonth.getFullYear() === today.getFullYear()
              return (
                <Button
                  key={i}
                  variant={isCurrent ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-9 capitalize",
                    isToday && !isCurrent && "ring-1 ring-primary/30",
                  )}
                  onClick={() => {
                    setDisplayMonth(
                      new Date(displayMonth.getFullYear(), i, 1),
                    )
                    setView("days")
                  }}
                >
                  {label}
                </Button>
              )
            })}
          </div>
        )}

        {/* Years */}
        {view === "years" && (
          <div className="grid grid-cols-3 gap-1.5 p-3">
            {years.map((year) => {
              const isCurrent = year === displayMonth.getFullYear()
              const isToday = year === today.getFullYear()
              return (
                <Button
                  key={year}
                  variant={isCurrent ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-9",
                    isToday && !isCurrent && "ring-1 ring-primary/30",
                  )}
                  onClick={() => {
                    setDisplayMonth(
                      new Date(year, displayMonth.getMonth(), 1),
                    )
                    setView("months")
                  }}
                >
                  {year}
                </Button>
              )
            })}
          </div>
        )}

        {/* Time */}
        <div className="flex items-center gap-2 border-t p-3">
          <HugeiconsIcon
            icon={Clock01Icon}
            strokeWidth={2}
            className="size-4 shrink-0 text-muted-foreground"
          />
          <Input
            type="time"
            value={timeStr}
            step={60}
            onChange={(e) =>
              handleTimeChange((e.target as HTMLInputElement).value)
            }
            className="h-8 w-28 text-sm"
          />
          <Button
            size="sm"
            className="ml-auto h-8 shrink-0"
            onClick={() => setOpen(false)}
          >
            OK
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
