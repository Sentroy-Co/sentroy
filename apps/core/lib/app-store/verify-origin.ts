import { resolveTxt } from "node:dns/promises"

/**
 * Embed origin sahiplik doğrulama (onay öncesi). İKİ yöntemden biri geçerse OK:
 *
 *  1. **.well-known**: `https://<host>/.well-known/sentroy-app-verification.txt`
 *     ilk satırı = token.
 *  2. **DNS TXT**: `_sentroy-app-verification.<host>` TXT kaydı = token, VEYA
 *     `<host>` TXT kaydında `sentroy-app-verification=<token>`.
 *
 * Geliştirici hangisi kolaysa onu kullanır. İsim/origin taklidini engeller
 * (origin'i kontrol etmeyen token'ı koyamaz).
 */

const WELL_KNOWN_PATH = "/.well-known/sentroy-app-verification.txt"

async function verifyViaWellKnown(embedOrigin: string, token: string): Promise<{ ok: boolean; reason?: string }> {
  let url: string
  try {
    const u = new URL(WELL_KNOWN_PATH, embedOrigin)
    if (u.protocol !== "https:") return { ok: false, reason: "origin must be https" }
    url = u.toString()
  } catch {
    return { ok: false, reason: "invalid origin" }
  }
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(url, { signal: controller.signal, redirect: "error", headers: { accept: "text/plain" } })
    clearTimeout(timeout)
    if (!res.ok) return { ok: false, reason: `well-known returned ${res.status}` }
    const firstLine = (await res.text()).trim().split(/\r?\n/)[0]?.trim() ?? ""
    if (firstLine !== token) return { ok: false, reason: "well-known token mismatch" }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: `well-known fetch failed: ${(e as Error).message}` }
  }
}

async function verifyViaDns(hostname: string, token: string): Promise<{ ok: boolean; reason?: string }> {
  const targets = [`_sentroy-app-verification.${hostname}`, hostname]
  for (const target of targets) {
    let records: string[][]
    try {
      records = await resolveTxt(target)
    } catch {
      continue // bu hedefte TXT yok → diğerini dene
    }
    const flat = records.map((r) => r.join("").trim())
    if (flat.includes(token) || flat.includes(`sentroy-app-verification=${token}`)) {
      return { ok: true }
    }
  }
  return { ok: false, reason: "no matching DNS TXT record" }
}

export async function verifyOriginOwnership(
  embedOrigin: string,
  expectedToken: string,
): Promise<{ ok: boolean; reason?: string; method?: "well-known" | "dns" }> {
  let hostname: string
  try {
    const u = new URL(embedOrigin)
    if (u.protocol !== "https:") return { ok: false, reason: "origin must be https" }
    hostname = u.hostname
  } catch {
    return { ok: false, reason: "invalid origin" }
  }

  const wk = await verifyViaWellKnown(embedOrigin, expectedToken)
  if (wk.ok) return { ok: true, method: "well-known" }

  const dns = await verifyViaDns(hostname, expectedToken)
  if (dns.ok) return { ok: true, method: "dns" }

  return { ok: false, reason: `${wk.reason}; ${dns.reason}` }
}
