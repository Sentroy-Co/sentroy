/**
 * ipinfo.io Lite API entegrasyonu — IP adresinden ülke/ASN bilgisini alır.
 * `IPINFO_TOKEN` önce vault'tan, yoksa `process.env`'den okunur.
 */

import { getEnvWithFallback } from "@sentroy-co/client-sdk/vault"

export interface IpInfoResult {
  ip: string
  asn?: string
  as_name?: string
  as_domain?: string
  country_code?: string
  country?: string
  continent_code?: string
  continent?: string
}

/** Gelen IP private/localhost ise dışarıya sorgulama yapma. */
function isPrivateOrLocal(ip: string): boolean {
  if (!ip || ip === "::1" || ip === "127.0.0.1") return true
  // IPv4 özel aralıklar
  if (/^10\./.test(ip)) return true
  if (/^192\.168\./.test(ip)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true
  // IPv6 link-local / unique-local
  if (/^fe80:/i.test(ip)) return true
  if (/^fc|^fd/i.test(ip)) return true
  return false
}

export async function fetchIpInfo(ip: string): Promise<IpInfoResult | null> {
  if (isPrivateOrLocal(ip)) return null
  const token = await getEnvWithFallback("IPINFO_TOKEN")
  if (!token) return null

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(`https://api.ipinfo.io/lite/${ip}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const data = (await res.json()) as IpInfoResult
    return data
  } catch {
    return null
  }
}
