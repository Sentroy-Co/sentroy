"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"

/**
 * Saat widget'ı — büyük dijital saat + tarih satırı. Tick state'i BU bileşende
 * izole (menü-bar saat deseninin aksine üst ağacı yeniden render etmez).
 * Config: `hour12` (12/24 saat) + `timezone` (IANA; boş = cihaz yereli).
 */

/** Curated saat dilimi listesi — value: IANA, label: şehir. "" = yerel. */
const TIMEZONES: { value: string; label: string }[] = [
  { value: "Europe/Istanbul", label: "İstanbul" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Europe/Moscow", label: "Moscow" },
  { value: "America/New_York", label: "New York" },
  { value: "America/Chicago", label: "Chicago" },
  { value: "America/Los_Angeles", label: "Los Angeles" },
  { value: "America/Sao_Paulo", label: "São Paulo" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Kolkata", label: "Kolkata" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Asia/Shanghai", label: "Shanghai" },
  { value: "Australia/Sydney", label: "Sydney" },
]

function tzLabel(value: string): string | null {
  return TIMEZONES.find((z) => z.value === value)?.label ?? null
}

/** Geçersiz/desteklenmeyen IANA zone → yerele düş (Intl throw etmesin). */
function safeTimeZone(tz: string | undefined): string | undefined {
  if (!tz) return undefined
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz })
    return tz
  } catch {
    return undefined
  }
}

export function ClockWidgetContent({
  lang,
  config,
}: {
  lang: string
  config?: Record<string, unknown>
}) {
  const hour12 = config?.hour12 === true
  const timeZone = safeTimeZone(
    typeof config?.timezone === "string" ? (config.timezone as string) : undefined,
  )
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    const tick = () => setNow(new Date())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  if (!now) return <div className="h-[104px]" />

  const time = now.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit", hour12, timeZone })
  const seconds = now.toLocaleTimeString(lang, { second: "2-digit", timeZone })
  const date = now.toLocaleDateString(lang, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  })
  const zoneCity = timeZone ? tzLabel(timeZone) : null

  return (
    <div className="p-4">
      <div className="flex items-baseline gap-1.5">
        <span className="text-[34px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
          {time}
        </span>
        <span className="text-sm tabular-nums text-muted-foreground">{seconds}</span>
      </div>
      <p className="mt-1.5 text-xs capitalize text-muted-foreground">{date}</p>
      {/* Yerel saat dilimi değilse şehri göster — hangi zaman dilimi olduğu net olsun. */}
      {zoneCity ? (
        <p className="mt-0.5 text-[11px] font-medium tracking-wide text-foreground/45">{zoneCity}</p>
      ) : null}
    </div>
  )
}

/** Config formu — 12/24 saat (segmented) + saat dilimi (Select; SelectValue YOK). */
export function ClockConfig({
  config,
  onChange,
}: {
  config?: Record<string, unknown>
  onChange: (patch: Record<string, unknown>) => void
}) {
  const t = useTranslations("os")
  const hour12 = config?.hour12 === true
  const timezone = typeof config?.timezone === "string" ? (config.timezone as string) : ""

  return (
    <div className="space-y-3">
      {/* Saat biçimi */}
      <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
        {[
          { value: false, label: t("widgetsHub.clock.format24") },
          { value: true, label: t("widgetsHub.clock.format12") },
        ].map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange({ hour12: opt.value })}
            className={
              "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors " +
              (hour12 === opt.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Saat dilimi */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          {t("widgetsHub.clock.timezone")}
        </label>
        {/* value="" = yerel; base-ui Select boş string'i "seçili değil" sayar,
            bu yüzden yerel için undefined geçip trigger'da manuel etiket veririz. */}
        <Select
          value={timezone || undefined}
          onValueChange={(v) => onChange({ timezone: v === "__local__" ? "" : v })}
        >
          <SelectTrigger className="w-full">
            {timezone ? (
              <span className="truncate">{tzLabel(timezone) ?? timezone}</span>
            ) : (
              <span>{t("widgetsHub.clock.localZone")}</span>
            )}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__local__">{t("widgetsHub.clock.localZone")}</SelectItem>
            {TIMEZONES.map((z) => (
              <SelectItem key={z.value} value={z.value}>
                {z.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
