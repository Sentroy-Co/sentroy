import { NextResponse } from "next/server"
import { sentroyAppModel } from "@workspace/db/models"

/**
 * Onaylı public store app origin'leri (CSP frame-src için). Public — origin'ler
 * zaten herkese açık mağaza app'lerine ait. 60s cache. Middleware bunu fetch
 * eder (Mongo'ya edge'den erişemez).
 */
export const revalidate = 60

export async function GET() {
  try {
    const origins = await sentroyAppModel.listApprovedEmbedOrigins()
    return NextResponse.json({ origins }, { headers: { "Cache-Control": "public, max-age=60" } })
  } catch {
    return NextResponse.json({ origins: [] })
  }
}
