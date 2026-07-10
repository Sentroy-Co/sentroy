"use client"

import { useEffect, useState } from "react"
import type { CryptoTickerData } from "./crypto-shared"

const POLL_MS = 20_000

/**
 * Kripto ticker fetch kancası — `/api/os/crypto/tickers?symbols=...` (session).
 * Şirket-bağımsız veri ama mevcut widget fetch/hata/retry desenini izler:
 * ilk yükte null (spinner), hata → failed (retry), poll 20sn. `refreshKey`
 * (sağ-tık "Refresh widgets") ve sembol listesi değişince yeniden çeker.
 */
export function useCryptoTickers(symbols: string[], refreshKey = 0) {
  // Sembol dizisini stabil anahtara indir (dep — referans değil değer).
  const key = symbols.join(",")
  const [data, setData] = useState<Map<string, CryptoTickerData> | null>(null)
  const [failed, setFailed] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!key) {
      setData(new Map())
      return
    }
    let cancelled = false
    setData(null)
    setFailed(false)
    const load = async () => {
      try {
        const res = await fetch(`/api/os/crypto/tickers?symbols=${encodeURIComponent(key)}`)
        if (!res.ok) throw new Error(String(res.status))
        const json = (await res.json()) as { data?: { tickers?: CryptoTickerData[] } }
        if (cancelled) return
        const map = new Map<string, CryptoTickerData>()
        for (const t of json.data?.tickers ?? []) map.set(t.symbol, t)
        setData(map)
        setFailed(false)
      } catch {
        if (!cancelled) setFailed(true)
      }
    }
    void load()
    const id = setInterval(() => void load(), POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [key, nonce, refreshKey])

  return { data, failed, retry: () => setNonce((n) => n + 1) }
}
