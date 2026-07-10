import { NextRequest } from "next/server"
import { RestClientV2, type SpotTickerV2 } from "bitget-api"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/os/crypto/tickers?symbols=BTCUSDT,ETHUSDT — Sentroy OS kripto
 * widget'ları (crypto-single / crypto-table) için Bitget spot ticker verisi.
 *
 * SESSION-only (herhangi bir üye). Bitget secret'ları SUNUCUDA kalır
 * (bitget-api yalnız burada; client düz fetch yapar). Public spot ticker
 * endpoint'i imza gerektirmez ama org kuralı gereği client keys ile başlatılır
 * (browser'a hiçbir secret sızmaz).
 *
 * Rate-limit koruması: tek `getSpotTicker()` çağrısı TÜM sembolleri döner;
 * sonuç module-level ~8sn cache'lenir ve istenen semboller buradan süzülür
 * (kaç sembol istenirse istensin en fazla 8sn'de bir upstream isteği).
 */

const SYMBOL_RE = /^[A-Z0-9]{4,20}$/
const MAX_SYMBOLS = 15
const CACHE_MS = 8_000

export interface CryptoTicker {
  symbol: string
  last: number
  changePct24h: number
  high24h: number
  low24h: number
  quoteVolume: number
}

let client: RestClientV2 | null = null
function getClient(): RestClientV2 {
  if (!client) {
    const apiKey = process.env.BITGET_API_KEY
    const apiSecret = process.env.BITGET_API_SECRET
    const apiPass = process.env.BITGET_API_PASSPHRASE
    // ⚠ bitget-api: key verilirse key+secret+PASSPHRASE ÜÇÜ DE zorunlu (yoksa
    // constructor THROW → her istek 502; canlı bug buydu). Spot ticker PUBLIC,
    // imza gerektirmez; passphrase yoksa KEYSİZ public client (ticker yine
    // çalışır). Üçü de varsa authenticated (ileride yüksek rate-limit için).
    client =
      apiKey && apiSecret && apiPass
        ? new RestClientV2({ apiKey, apiSecret, apiPass })
        : new RestClientV2()
  }
  return client
}

// TÜM sembollerin son snapshot'ı (symbol → normalized). Warm instance'ta paylaşılır.
let cache: { at: number; map: Map<string, CryptoTicker> } | null = null

function normalize(tk: SpotTickerV2): CryptoTicker {
  return {
    symbol: tk.symbol,
    last: Number(tk.lastPr),
    // Bitget `change24h`: 24s fiyat değişim oranı (0.0123 → %1.23).
    changePct24h: Number(tk.change24h) * 100,
    high24h: Number(tk.high24h),
    low24h: Number(tk.low24h),
    quoteVolume: Number(tk.quoteVolume),
  }
}

async function loadAllTickers(): Promise<Map<string, CryptoTicker>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.map
  const res = await getClient().getSpotTicker()
  const map = new Map<string, CryptoTicker>()
  for (const tk of res.data ?? []) {
    if (tk?.symbol) map.set(tk.symbol, normalize(tk))
  }
  cache = { at: Date.now(), map }
  return map
}

export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)

  const raw = request.nextUrl.searchParams.get("symbols") ?? ""
  const requested = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)

  // Whitelist + tekilleştir + limit. Geçersizler sessizce atılır.
  const valid = Array.from(new Set(requested.filter((s) => SYMBOL_RE.test(s)))).slice(0, MAX_SYMBOLS)
  if (valid.length === 0) return jsonSuccess({ tickers: [], missing: [] })

  let map: Map<string, CryptoTicker>
  try {
    map = await loadAllTickers()
  } catch {
    return jsonError("Failed to load market data", 502)
  }

  const tickers: CryptoTicker[] = []
  const missing: string[] = []
  for (const sym of valid) {
    const t = map.get(sym)
    if (t) tickers.push(t)
    else missing.push(sym)
  }

  return jsonSuccess({ tickers, missing })
}
