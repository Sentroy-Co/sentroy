"use client"

import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { ChartLineData01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { WidgetErrorState, WidgetHeader, WidgetSpinner } from "./widget-ui"
import { useCryptoTickers } from "./use-crypto-tickers"
import {
  CURATED_PAIRS,
  DEFAULT_TABLE_SYMBOLS,
  baseCoin,
  formatPct,
  formatPrice,
} from "./crypto-shared"

const CRYPTO_COLOR = "#f59e0b"

function resolveSymbols(config?: Record<string, unknown>): string[] {
  const raw = config?.symbols
  if (Array.isArray(raw)) {
    const list = raw.filter((s): s is string => typeof s === "string" && s.length > 0)
    if (list.length > 0) return list
  }
  return DEFAULT_TABLE_SYMBOLS
}

/**
 * Kripto çok-pair tablo widget'ı — satır: sembol | fiyat | %24s (renkli).
 * Veri Bitget (`/api/os/crypto/tickers`), 20sn poll. Cam estetiği; fetch/hata/
 * retry mevcut widget desenini izler. Alt disclaimer.
 */
export function CryptoTableWidgetContent({
  config,
  refreshKey = 0,
}: {
  config?: Record<string, unknown>
  refreshKey?: number
}) {
  const t = useTranslations("os")
  const symbols = resolveSymbols(config)
  const { data, failed, retry } = useCryptoTickers(symbols, refreshKey)

  return (
    <div className="p-3">
      <WidgetHeader
        icon={ChartLineData01Icon}
        color={CRYPTO_COLOR}
        title={t("widgetsHub.types.crypto-table.title")}
      />
      <div className="mt-2">
        {failed ? (
          <WidgetErrorState onRetry={retry} />
        ) : !data ? (
          <WidgetSpinner />
        ) : (
          <ul className="space-y-0.5">
            {symbols.map((sym) => {
              const tk = data.get(sym)
              const up = (tk?.changePct24h ?? 0) >= 0
              return (
                <li
                  key={sym}
                  className="flex items-center gap-2 rounded-lg px-1.5 py-1.5"
                >
                  <span className="w-16 shrink-0 truncate text-xs font-medium text-foreground">
                    {baseCoin(sym)}
                    <span className="text-muted-foreground/60">/{sym.endsWith("USDT") ? "USDT" : ""}</span>
                  </span>
                  <span className="flex-1 truncate text-right text-xs tabular-nums text-foreground/90">
                    {tk ? formatPrice(tk.last) : "—"}
                  </span>
                  <span
                    className={
                      "w-16 shrink-0 text-right text-xs font-medium tabular-nums " +
                      (tk ? (up ? "text-emerald-500" : "text-red-500") : "text-muted-foreground")
                    }
                  >
                    {tk ? formatPct(tk.changePct24h) : "—"}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        <p className="mt-2.5 px-1.5 text-[10px] leading-tight text-muted-foreground/70">
          {t("widgetsHub.crypto.disclaimer")}
        </p>
      </div>
    </div>
  )
}

/**
 * Config — çoklu pair seçimi (küratörlü listeden ekle/çıkar chip'ler; en az 1).
 * Select değil chip toggle (SelectValue tuzağı yok, çoklu-seçim doğal).
 */
export function CryptoTableConfig({
  config,
  onChange,
}: {
  config?: Record<string, unknown>
  onChange: (patch: Record<string, unknown>) => void
}) {
  const t = useTranslations("os")
  const selected = resolveSymbols(config)
  const selectedSet = new Set(selected)

  function toggle(sym: string) {
    if (selectedSet.has(sym)) {
      // En az 1 pair kalmalı.
      if (selected.length <= 1) return
      onChange({ symbols: selected.filter((s) => s !== sym) })
    } else {
      onChange({ symbols: [...selected, sym] })
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{t("widgetsHub.crypto.pairs")}</label>
      <div className="flex flex-wrap gap-1.5">
        {CURATED_PAIRS.map((p) => {
          const active = selectedSet.has(p)
          return (
            <button
              key={p}
              type="button"
              onClick={() => toggle(p)}
              className={
                "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors " +
                (active
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border/60 bg-foreground/5 text-muted-foreground hover:text-foreground")
              }
            >
              {active ? <HugeiconsIcon icon={Tick02Icon} className="size-3" strokeWidth={2.5} /> : null}
              {baseCoin(p)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
