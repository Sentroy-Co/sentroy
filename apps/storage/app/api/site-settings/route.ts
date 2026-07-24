export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { getDb } from "@workspace/db/client"

/**
 * Public site-settings — auth gerektirmez. Storage upload UI ve route'ları
 * limit'i bu endpoint'ten okur. Diğer client-needs-to-know değerler için
 * de buraya field eklenir.
 *
 * Cache: 60s public — admin değişiklik 1 dakika içinde frontend'e yansır.
 */

const DEFAULT_MAX_UPLOAD_BYTES = 524288000 // 500 MB

export async function GET() {
  const db = await getDb()
  const doc = await db.collection("system_settings").findOne({ key: "global" })
  const maxUploadBytes =
    typeof doc?.maxUploadBytes === "number"
      ? (doc.maxUploadBytes as number)
      : DEFAULT_MAX_UPLOAD_BYTES

  return NextResponse.json(
    { data: { maxUploadBytes } },
    {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    },
  )
}
