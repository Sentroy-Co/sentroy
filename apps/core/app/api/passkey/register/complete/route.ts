export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import { verifyRegistrationResponse } from "@simplewebauthn/server"
import type { RegistrationResponseJSON } from "@simplewebauthn/server"
import { userPasskeyModel, auditLogModel } from "@workspace/db/models"
import {
  authBaseURL,
  passkeyAllowedOrigins,
} from "@workspace/auth/server/passkey-session"

/**
 * POST /api/passkey/register/complete
 * Body: { name: string, response: RegistrationResponseJSON }
 *
 * Browser `startRegistration` çağrısının döndüğü response'u verify eder,
 * credentialID + publicKey + counter'ı saklar. Begin'de saklanan challenge
 * tek kullanımlık olarak silinir.
 */
export async function POST(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)

  let body: { name?: string; response?: RegistrationResponseJSON }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  if (!body.response) return jsonError("response is required")
  const name = (body.name ?? "").trim() || "Passkey"

  const challenge = await userPasskeyModel.consumeChallenge(session.user.id)
  if (!challenge) {
    return jsonError("Registration challenge expired — start again", 410)
  }

  const baseURL = authBaseURL()
  const rpID = new URL(baseURL).hostname

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challenge,
      // Profile sayfası core/mail/storage subdomain'lerinde açılabilir;
      // browser hangisinden geldiyse o origin'in clientDataJSON'da çıkar.
      // Hepsini allow list olarak geçiyoruz — rpID parent domain (sentroy.com)
      // olduğu için browser zaten subdomain'leri kapsıyor.
      expectedOrigin: passkeyAllowedOrigins(),
      expectedRPID: rpID,
    })
  } catch (err) {
    console.warn("[passkey/register] verify failed:", err)
    return jsonError("Registration verification failed", 400)
  }

  if (!verification.verified || !verification.registrationInfo) {
    return jsonError("Registration not verified", 400)
  }

  const { credential } = verification.registrationInfo
  const credentialID = credential.id
  // SWA 13.x publicKey is Uint8Array; serialize as base64url for storage.
  const publicKeyB64 = Buffer.from(credential.publicKey).toString("base64url")

  const created = await userPasskeyModel.create({
    userId: session.user.id,
    name,
    credentialID,
    publicKey: publicKeyB64,
    counter: credential.counter,
    transports: body.response.response.transports as string[] | undefined,
  })

  await auditLogModel
    .insert({
      userId: session.user.id,
      action: "passkey.register",
      resource: "passkey",
      resourceId: created.id,
      details: { name },
    })
    .catch(() => {})

  return jsonSuccess({
    id: created.id,
    name: created.name,
    createdAt: created.createdAt,
  })
}
