"use client"

import * as React from "react"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Storage size input — byte sayısı tutar ama UI'da KB/MB/GB/TB cinsinden
 * gösterir. Kullanıcı 500 yazıp MB seçince state byte cinsinden 524288000
 * olarak güncellenir. İlk render'da değerin büyüklüğüne göre en uygun unit
 * seçilir (auto-detect): 5 GB için "5" + "GB", 250 MB için "250" + "MB".
 *
 * Pure controlled — parent her zaman byte sayısı görür, conversion bu
 * component'te.
 */

export type ByteUnit = "B" | "KB" | "MB" | "GB" | "TB"

const MULTIPLIERS: Record<ByteUnit, number> = {
  B: 1,
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
  TB: 1024 * 1024 * 1024 * 1024,
}

const UNITS_DESC: ByteUnit[] = ["TB", "GB", "MB", "KB", "B"]

/** Byte sayısından en yüksek "yuvarlanır" unit'i seç. 5GB ↔ "5" GB tercih
 *  edilir; 5.5GB ↔ "5632" MB seçilebilir. Toleranslı round (1e-6). */
export function detectBestUnit(bytes: number): ByteUnit {
  if (bytes === 0 || !Number.isFinite(bytes)) return "GB"
  const abs = Math.abs(bytes)
  for (const u of UNITS_DESC) {
    const v = abs / MULTIPLIERS[u]
    if (v >= 1 && Math.abs(v - Math.round(v)) < 1e-6) {
      return u
    }
  }
  // Yuvarlanmıyor: en büyük unit'te göster (ondalıklı).
  for (const u of UNITS_DESC) {
    if (abs >= MULTIPLIERS[u]) return u
  }
  return "B"
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (!bytes) return "0 B"
  const u = detectBestUnit(bytes)
  const v = bytes / MULTIPLIERS[u]
  return `${Number.isInteger(v) ? v : v.toFixed(decimals)} ${u}`
}

export interface BytesInputProps {
  value: number
  onChange: (bytes: number) => void
  disabled?: boolean
  className?: string
  /** Min değer (byte). UI input'ta hint olarak gösterilir. */
  min?: number
  /** Placeholder string. */
  placeholder?: string
  /** Default unit (auto-detect override). */
  defaultUnit?: ByteUnit
}

export function BytesInput({
  value,
  onChange,
  disabled,
  className,
  min,
  placeholder,
  defaultUnit,
}: BytesInputProps) {
  // Unit'i state'te tut ki kullanıcı değiştirsin; value değişimi ile
  // auto-detect'i yalnızca initial'da yap.
  const [unit, setUnit] = React.useState<ByteUnit>(
    () => defaultUnit ?? detectBestUnit(value),
  )
  // Display value — unit'e göre. Parent'a byte gönderirken çeviri.
  const displayValue =
    value === 0
      ? ""
      : (() => {
          const v = value / MULTIPLIERS[unit]
          return Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/\.?0+$/, "")
        })()

  const handleNumberChange = (raw: string) => {
    if (!raw) {
      onChange(0)
      return
    }
    const n = parseFloat(raw)
    if (Number.isNaN(n)) return
    onChange(Math.max(min ?? 0, Math.round(n * MULTIPLIERS[unit])))
  }

  const handleUnitChange = (next: ByteUnit) => {
    if (next === unit) return
    // Unit değişiminde aynı byte'ı koru — yeni unit'te display update olur.
    setUnit(next)
  }

  return (
    <div className={cn("flex items-stretch gap-2", className)}>
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={displayValue}
        onChange={(e) => handleNumberChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder ?? "0"}
        className="flex-1"
      />
      <Select
        value={unit}
        onValueChange={(v) => v && handleUnitChange(v as ByteUnit)}
        disabled={disabled}
      >
        <SelectTrigger className="w-[80px] shrink-0">
          <span>{unit}</span>
        </SelectTrigger>
        <SelectContent>
          {(["B", "KB", "MB", "GB", "TB"] as ByteUnit[]).map((u) => (
            <SelectItem key={u} value={u}>
              {u}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
