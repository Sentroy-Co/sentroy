"use client"

import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUp01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import { WidgetErrorState, WidgetSpinner } from "./widget-ui"
import { useCryptoTickers } from "./use-crypto-tickers"
import {
  CURATED_PAIRS,
  DEFAULT_SINGLE_SYMBOL,
  baseCoin,
  formatPct,
  formatPrice,
  prettyPair,
} from "./crypto-shared"

/**
 * Kripto tek-pair widget'ı — büyük fiyat + 24s değişim (yeşil↑/kırmızı↓),
 * pair etiketi, alt disclaimer. Veri Bitget (`/api/os/crypto/tickers`), 20sn
 * poll. Cam estetiği; fetch/hata/retry mevcut widget desenini izler.
 */
export function CryptoSingleWidgetContent({
  config,
  refreshKey = 0,
}: {
  config?: Record<string, unknown>
  refreshKey?: number
}) {
  const t = useTranslations("os")
  const symbol = typeof config?.symbol === "string" && config.symbol ? config.symbol : DEFAULT_SINGLE_SYMBOL
  const { data, failed, retry } = useCryptoTickers([symbol], refreshKey)

  if (failed) return <WidgetErrorState onRetry={retry} />
  if (!data) return <WidgetSpinner />

  const tk = data.get(symbol)
  const up = (tk?.changePct24h ?? 0) >= 0
  const toneClass = up ? "text-emerald-500" : "text-red-500"

  return (
    <div className="p-4">
      {/* Köşe halo — yön rengiyle */}
      <div
        className="pointer-events-none absolute -right-6 -top-6 size-20 rounded-full blur-2xl"
        style={{ background: `${up ? "#10b98133" : "#ef444433"}` }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">{prettyPair(symbol)}</span>
        <span className="rounded-md bg-foreground/5 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {baseCoin(symbol)}
        </span>
      </div>

      {tk ? (
        <>
          <div className="mt-2 text-[26px] font-semibold leading-none tabular-nums text-foreground">
            {formatPrice(tk.last)}
          </div>
          <div className={"mt-1.5 flex items-center gap-1 text-sm font-medium tabular-nums " + toneClass}>
            <HugeiconsIcon icon={up ? ArrowUp01Icon : ArrowDown01Icon} className="size-4" strokeWidth={2.5} />
            {formatPct(tk.changePct24h)}
          </div>
        </>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">{t("widgetsHub.crypto.noData")}</p>
      )}

      <p className="mt-3 text-[10px] leading-tight text-muted-foreground/70">
        {t("widgetsHub.crypto.disclaimer")}
      </p>
    </div>
  )
}

/** Config — tek pair seçimi (küratörlü liste). SelectValue YOK, manuel label. */
export function CryptoSingleConfig({
  config,
  onChange,
}: {
  config?: Record<string, unknown>
  onChange: (patch: Record<string, unknown>) => void
}) {
  const t = useTranslations("os")
  const selected = typeof config?.symbol === "string" && config.symbol ? config.symbol : DEFAULT_SINGLE_SYMBOL
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{t("widgetsHub.crypto.pair")}</label>
      <Select value={selected} onValueChange={(v) => onChange({ symbol: v })}>
        <SelectTrigger className="w-full">
          <span className="truncate">{prettyPair(selected)}</span>
        </SelectTrigger>
        <SelectContent>
          {CURATED_PAIRS.map((p) => (
            <SelectItem key={p} value={p}>
              {prettyPair(p)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
