import { NextRequest } from "next/server"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import {
  oauthConsentModel,
  oauthAccessTokenModel,
  oauthRefreshTokenModel,
} from "@workspace/db/models"

/**
 * DELETE /api/profile/connected-apps/[clientId]
 *
 * Connected apps revoke cascade:
 *   1. (user, client) consent kaydını sil — sonraki authorize tekrar
 *      consent ekranı isteyecek
 *   2. Aktif tüm access token'ları revoke (userinfo 401 dönmeye başlar)
 *   3. Aktif tüm refresh token'ları revoke (refresh fail eder)
 *
 * Session-auth.
 */

export const dynamic = "force-dynamic"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  const userId = (session.user as { id?: string }).id
  if (!userId) return jsonError("Unauthorized", 401)

  const { clientId } = await params

  // Cascade — best-effort her step
  const [consentRevoked, accessRevoked, refreshRevoked] = await Promise.all([
    oauthConsentModel.revokeForUserClient(userId, clientId).catch(() => false),
    oauthAccessTokenModel.revokeForUserClient(userId, clientId).catch(() => 0),
    oauthRefreshTokenModel.revokeForUserClient(userId, clientId).catch(() => 0),
  ])

  if (!consentRevoked && accessRevoked === 0 && refreshRevoked === 0) {
    return jsonError("no consent or active tokens for this client", 404)
  }

  return jsonSuccess({
    consentRevoked,
    accessTokensRevoked: accessRevoked,
    refreshTokensRevoked: refreshRevoked,
  })
}
