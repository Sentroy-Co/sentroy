import { NextResponse } from "next/server"
import {
  isRegistrySigningConfigured,
  signAttached,
} from "@workspace/console/lib/app-registry-jws"
import { buildSingleAppCatalog } from "@/lib/app-registry/catalog-build"

/**
 * GET /api/public/app-registry/apps/[appId] — tek app detay envelope'u,
 * kendi başına imzalı (attached JWS). 503 gate + oauth-hariç (H1) katalog ile
 * aynı. Bir client tek satırı çekip doğrulayabilsin diye.
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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  if (!isRegistrySigningConfigured()) {
    return NextResponse.json(
      { error: "registry not configured" },
      { status: 503, headers: CORS },
    )
  }
  const { appId } = await params
  const envelope = await buildSingleAppCatalog(appId, new Date())
  if (!envelope) {
    return NextResponse.json({ error: "not found" }, { status: 404, headers: CORS })
  }
  const jws = signAttached(envelope)
  return new NextResponse(jws, {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type": "application/jose",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  })
}
