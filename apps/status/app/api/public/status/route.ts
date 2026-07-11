export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { buildStatusSnapshot } from "@/app/lib/aggregate"

/**
 * Public status JSON. CORS-open so external monitors and embeds can
 * fetch from any origin. 30-second cache window matches the probe
 * dedup interval so the snapshot doesn't churn faster than the data
 * underneath it can change.
 */
export const revalidate = 30

export async function GET() {
  try {
    const snapshot = await buildStatusSnapshot()
    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        "Access-Control-Allow-Origin": "*",
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build status" },
      { status: 500 },
    )
  }
}
