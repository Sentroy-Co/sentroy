import { NextResponse } from "next/server"
import { buildStatusSnapshot } from "../lib/aggregate"

/**
 * Vanity URL for status JSON — `/status/feed.json` reads better in
 * monitoring docs than `/api/public/status`. Same payload, same cache.
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
