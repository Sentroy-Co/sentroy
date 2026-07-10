import { NextResponse } from "next/server"
import {
  isRegistrySigningConfigured,
  signAttached,
} from "@workspace/console/lib/app-registry-jws"
import { buildFullCatalog } from "@/lib/app-registry/catalog-build"

/**
 * GET /api/public/app-registry/catalog — imzalı global app katalogu.
 *
 * - Auth YOK, CORS-open, CDN-cacheable (yalnız 200'de).
 * - APP_REGISTRY_PRIVATE_KEY set DEĞİLSE 503 (house pattern) — bu kontrol EN
 *   ÖNCE çalışır, herhangi bir lazy key erişiminden önce → route public repo'da
 *   INERT gönderilir, import/build'de asla throw etmez.
 * - Yanıt gövdesinin TAMAMI Ed25519 attached compact JWS'tir
 *   (Content-Type application/jose) — header/gövde ayrımı YOK.
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

export async function GET() {
  if (!isRegistrySigningConfigured()) {
    return NextResponse.json(
      { error: "registry not configured" },
      { status: 503, headers: CORS },
    )
  }
  const envelope = await buildFullCatalog(new Date())
  const jws = signAttached(envelope)
  return new NextResponse(jws, {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type": "application/jose",
      // Katalog TTL'inden bağımsız, edge'te kısa cache (imza freshness'i içerir).
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  })
}
