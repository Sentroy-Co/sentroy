import { NextResponse } from "next/server"
import { getJwks } from "@workspace/console/lib/oauth-jwt"

/**
 * GET /.well-known/jwks.json — RFC 7517
 *
 * RP'ler id_token signature'ını verify etmek için public key'i buradan
 * çeker. RS256 modunda dolu (`{ keys: [{kty:"RSA", e, n, kid, use, alg}] }`),
 * HS256 modunda boş (`{ keys: [] }`) — symmetric secret asla publish edilmez,
 * RP userinfo'ya başvurmak zorunda.
 */

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json(getJwks(), {
    headers: { "Cache-Control": "public, max-age=3600" },
  })
}
