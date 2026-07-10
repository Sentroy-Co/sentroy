import { NextRequest, NextResponse } from "next/server"
import { peekRateLimit } from "@workspace/console/lib/rate-limit"
import { DOWNLOAD_QUOTA } from "@/lib/quota"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET → { remaining, max, resetAt } — IP'nin günlük indirme hakkı (peek). */
export async function GET(request: NextRequest) {
  const peek = peekRateLimit(request, DOWNLOAD_QUOTA)
  return NextResponse.json(
    { remaining: peek.remaining, max: DOWNLOAD_QUOTA.max, resetAt: peek.resetAt },
    { headers: { "Cache-Control": "no-store" } },
  )
}
