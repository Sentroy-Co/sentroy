import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"

const rawUrl =
  process.env.NEXT_PUBLIC_SENTROY_API_URL || "http://localhost:3000/api/v1"
const baseUrl = rawUrl.endsWith("/api/v1") ? rawUrl : `${rawUrl.replace(/\/+$/, "")}/api/v1`

/**
 * GET /api/bimi?domain=example.com
 * GET /api/bimi?domain=a.com,b.com,c.com (virgulle ayirilmis)
 *
 * Inbox'ta gonderici logolarini gostermek icin kullanilir. Auth gerektirmez
 * cunku BIMI kayitlari zaten public DNS'te. Server'daki public endpoint
 * cache ile calisir, buradan sadece proxy ediyoruz.
 */
export async function GET(request: NextRequest) {
  const domainParam = request.nextUrl.searchParams.get("domain")
  if (!domainParam) return jsonError("domain query param is required")

  const domains = domainParam
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)

  if (domains.length === 0) return jsonError("domain query param is required")

  try {
    if (domains.length === 1) {
      const res = await fetch(
        `${baseUrl}/public/bimi?domain=${encodeURIComponent(domains[0])}`,
        { signal: AbortSignal.timeout(8_000) },
      )
      const json = await res.json()
      return jsonSuccess(json.data)
    }

    // Batch
    const res = await fetch(`${baseUrl}/public/bimi/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domains }),
      signal: AbortSignal.timeout(15_000),
    })
    const json = await res.json()
    return jsonSuccess(json.data)
  } catch {
    return jsonSuccess(null)
  }
}
