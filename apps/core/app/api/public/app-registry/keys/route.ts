import { NextResponse } from "next/server"
import {
  isRegistrySigningConfigured,
  getRegistryPublicJwks,
} from "@workspace/console/lib/app-registry-jws"

/**
 * GET /api/public/app-registry/keys — public OKP JWKS (primary + previous).
 *
 * Yalnız DISCOVERY içindir; NON-authoritative. Instance'lar katalogu PINNED
 * key'lere (baked SENTROY_REGISTRY_PUBLIC_KEY / APP_REGISTRY_PUBLIC_KEY env)
 * karşı doğrular, buna ASLA güvenmez → sunucu ele geçirilse bile bir instance'ın
 * güven kökü bu endpoint üzerinden değiştirilemez.
 */
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export function GET() {
  if (!isRegistrySigningConfigured()) {
    return NextResponse.json(
      { error: "registry not configured" },
      { status: 503, headers: CORS },
    )
  }
  return NextResponse.json(getRegistryPublicJwks(), {
    status: 200,
    headers: { ...CORS, "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  })
}
