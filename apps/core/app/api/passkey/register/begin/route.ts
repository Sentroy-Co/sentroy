import { NextRequest } from "next/server"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import { generateRegistrationOptions } from "@simplewebauthn/server"
import { userPasskeyModel } from "@workspace/db/models"
import { authBaseURL } from "@workspace/auth/server/passkey-session"

/**
 * POST /api/passkey/register/begin
 * Logged-in user için yeni passkey kaydı başlatır. Challenge cookie değil
 * mongo'da saklanır → user'ın userId'si key olarak kullanılır.
 *
 * Mevcut credential'lar `excludeCredentials`'a konur ki kullanıcı aynı
 * cihazı tekrar kaydedemez (browser hata gösterir).
 */
export async function POST(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)

  const baseURL = authBaseURL()
  const rpID = new URL(baseURL).hostname

  const existing = await userPasskeyModel.listForUser(session.user.id)

  const options = await generateRegistrationOptions({
    rpName: "Sentroy",
    rpID,
    userName: session.user.email ?? session.user.id,
    userDisplayName: session.user.name ?? session.user.email ?? "User",
    attestationType: "none",
    authenticatorSelection: {
      // Platform veya cross-platform — kullanıcı seçsin
      residentKey: "preferred",
      userVerification: "preferred",
    },
    excludeCredentials: existing.map((p) => ({
      id: p.credentialID,
      transports: (p.transports ?? []) as AuthenticatorTransport[],
    })),
  })

  await userPasskeyModel.storeChallenge(
    session.user.id,
    options.challenge,
    "registration",
  )

  return jsonSuccess(options)
}

// Re-export helper alias to avoid TS unused import noise — minimal type for transports.
type AuthenticatorTransport =
  | "ble"
  | "internal"
  | "nfc"
  | "usb"
  | "cable"
  | "hybrid"
  | "smart-card"
