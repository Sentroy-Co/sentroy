/**
 * Kripto widget'ları (crypto-single / crypto-table) ortak yardımcıları:
 * küratörlü pair listesi (config seçicileri) + fiyat/yüzde biçimleme.
 * Veri Bitget'ten (`/api/os/crypto/tickers`) — sembol formatı BASE+QUOTE
 * bitişik (örn. BTCUSDT), tümü USDT quote.
 */

export interface CryptoTickerData {
  symbol: string
  last: number
  changePct24h: number
  high24h: number
  low24h: number
  quoteVolume: number
}

/** Config seçicilerinde gösterilen küratörlü major pair'ler (hepsi USDT). */
export const CURATED_PAIRS: string[] = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
  "TRXUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "DOTUSDT",
  "MATICUSDT",
  "TONUSDT",
  "LTCUSDT",
  "BCHUSDT",
  "ATOMUSDT",
  "NEARUSDT",
  "APTUSDT",
  "ARBUSDT",
  "OPUSDT",
]

export const DEFAULT_SINGLE_SYMBOL = "BTCUSDT"
export const DEFAULT_TABLE_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"]

/** "BTCUSDT" → "BTC/USDT" (USDT quote varsayımı; değilse ham gösterilir). */
export function prettyPair(symbol: string): string {
  if (symbol.endsWith("USDT")) return `${symbol.slice(0, -4)}/USDT`
  if (symbol.endsWith("USDC")) return `${symbol.slice(0, -4)}/USDC`
  return symbol
}

/** Base coin ("BTCUSDT" → "BTC"). */
export function baseCoin(symbol: string): string {
  if (symbol.endsWith("USDT")) return symbol.slice(0, -4)
  if (symbol.endsWith("USDC")) return symbol.slice(0, -4)
  return symbol
}

/** Fiyata göre uygun ondalık: <1 daha çok basamak, büyük fiyatlar sade. */
export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—"
  const abs = Math.abs(value)
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** Yüzde biçimi: işaretli, iki ondalık ("+1.23%" / "-0.45%"). */
export function formatPct(value: number): string {
  if (!Number.isFinite(value)) return "—"
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(2)}%`
}
