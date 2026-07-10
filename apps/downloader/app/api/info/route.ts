import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, rateLimitResponse } from "@workspace/console/lib/rate-limit"
import { isValidUrl, type Platform } from "@/lib/platform"
import { workerUrl, workerHeaders } from "@/lib/worker"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST { url, platform } → worker /info (metadata + max kalite). */
export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, { key: "dl:info", window: 3600, max: 60 })
  if (!rl.allowed) return rateLimitResponse(rl)

  let body: { url?: string; platform?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }
  if (!body.url || !body.platform) {
    return NextResponse.json({ error: "Missing url or platform" }, { status: 400 })
  }
  if (!isValidUrl(body.url, body.platform as Platform)) {
    return NextResponse.json({ error: "invalidUrl" }, { status: 400 })
  }

  let res: Response
  try {
    res = await fetch(workerUrl("/info"), {
      method: "POST",
      headers: workerHeaders(),
      body: JSON.stringify({ url: body.url.trim(), platform: body.platform }),
    })
  } catch {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
  }
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}
