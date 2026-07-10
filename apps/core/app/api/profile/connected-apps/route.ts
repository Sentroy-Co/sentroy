import { NextRequest } from "next/server"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import {
  oauthConsentModel,
  oauthClientModel,
} from "@workspace/db/models"

/**
 * GET /api/profile/connected-apps
 *
 * Mevcut kullanıcının daha önce "Sign in with Sentroy" üzerinden onay
 * verdiği OAuth client'ları döner. Her satırda client meta + onaylanan
 * scope'lar + grant tarihi.
 *
 * Session-auth (cross-subdomain `.sentroy.com` cookie).
 */

export const dynamic = "force-dynamic"

interface ConnectedApp {
  consentId: string
  clientId: string
  name: string
  description: string | null
  homepageUrl: string | null
  logoUrl: string | null
  scopes: string[]
  grantedAt: string
  updatedAt: string
}

export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  const userId = (session.user as { id?: string }).id
  if (!userId) return jsonError("Unauthorized", 401)

  const consents = await oauthConsentModel.findByUser(userId)
  const out: ConnectedApp[] = []
  for (const c of consents) {
    const client = await oauthClientModel.findByClientId(c.clientId)
    if (!client) continue // orphaned consent — defensive skip
    out.push({
      consentId: c.id,
      clientId: c.clientId,
      name: client.name,
      description: client.description,
      homepageUrl: client.homepageUrl,
      logoUrl: client.logoUrl,
      scopes: c.scopes,
      grantedAt:
        c.grantedAt instanceof Date
          ? c.grantedAt.toISOString()
          : (c.grantedAt as unknown as string),
      updatedAt:
        c.updatedAt instanceof Date
          ? c.updatedAt.toISOString()
          : (c.updatedAt as unknown as string),
    })
  }
  return jsonSuccess(out)
}
