import { NextRequest, NextResponse } from "next/server"
import { oauthAccessTokenModel } from "@workspace/db/models"
import { getDb } from "@workspace/db/client"
import { ObjectId } from "mongodb"

/**
 * GET /oauth/userinfo — OIDC §5.3
 *
 * `Authorization: Bearer <access_token>` zorunlu. Token aktif + scope set'e
 * göre claim'leri döner. Spec uyumlu — sub her zaman, email/profile claim'leri
 * scope'a bağlı.
 *
 * Response: JSON. WWW-Authenticate header set on auth failures per RFC 6750.
 */

export const dynamic = "force-dynamic"

function unauthorized(error: string, description: string): NextResponse {
  return new NextResponse(JSON.stringify({ error, error_description: description }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer error="${error}", error_description="${description}"`,
      "Cache-Control": "no-store",
    },
  })
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || ""
  const match = authHeader.match(/^Bearer\s+(\S+)$/)
  if (!match) {
    return unauthorized(
      "invalid_request",
      "Missing or malformed Authorization Bearer header.",
    )
  }
  const token = match[1]

  const record = await oauthAccessTokenModel.findByToken(token)
  if (!record) {
    return unauthorized("invalid_token", "Token not recognised.")
  }
  if (record.revokedAt) {
    return unauthorized("invalid_token", "Token revoked.")
  }
  if (record.expiresAt && record.expiresAt < new Date()) {
    return unauthorized("invalid_token", "Token expired.")
  }

  // Sentroy user'ı çek
  interface SentroyUserDoc {
    name?: string
    email?: string
    emailVerified?: boolean
    image?: string
  }
  let user: SentroyUserDoc | null = null
  try {
    const db = await getDb()
    const doc = await db
      .collection("user")
      .findOne({ _id: new ObjectId(record.userId) })
    user = doc as SentroyUserDoc | null
  } catch {
    user = null
  }
  if (!user) {
    return unauthorized("invalid_token", "User no longer exists.")
  }

  // OIDC claims, scope-aware
  const out: Record<string, unknown> = { sub: record.userId }
  if (record.scopes.includes("profile")) {
    if (user.name) {
      out.name = user.name
      out.preferred_username = user.name
    }
    if (user.image) out.picture = user.image
  }
  if (record.scopes.includes("email") && user.email) {
    out.email = user.email
    out.email_verified = user.emailVerified ?? false
  }

  return new NextResponse(JSON.stringify(out), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  })
}
