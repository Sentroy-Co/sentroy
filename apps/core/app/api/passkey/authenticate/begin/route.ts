import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { generateAuthenticationOptions } from "@simplewebauthn/server"
import { userPasskeyModel } from "@workspace/db/models"
import { authBaseURL } from "@workspace/auth/server/passkey-session"
import { randomBytes } from "node:crypto"

/**
 * POST /api/passkey/authenticate/begin
 * Body: { email?: string }
 *
 * - Email verilirse: o kullanıcının credential'larını allowCredentials'a koyar
 *   (auto-fill / non-discoverable flow için)
 * - Email yoksa: discoverable credential (resident key) flow — browser
 *   user'ın hangi passkey'i kullanacağını seçer
 *
 * Challenge mongo'da `flowId` (random) key ile saklanır; client complete'te
 * aynı flowId'yi geri gönderir.
 */
export async function POST(request: NextRequest) {
  let body: { email?: string }
  try {
    body = await request.json().catch(() => ({}))
  } catch {
    body = {}
  }

  const baseURL = authBaseURL()
  const rpID = new URL(baseURL).hostname

  let allowCredentials: { id: string; transports?: AuthenticatorTransport[] }[] | undefined
  if (body.email) {
    const { getDb } = await import("@workspace/db/client")
    const db = await getDb()
    const user = await db
      .collection("user")
      .findOne({ email: body.email.toLowerCase() })
    if (user) {
      const passkeys = await userPasskeyModel.listForUser(user._id.toString())
      allowCredentials = passkeys.map((p) => ({
        id: p.credentialID,
        transports: (p.transports ?? []) as AuthenticatorTransport[],
      }))
    }
  }

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials,
  })

  const flowId = randomBytes(16).toString("hex")
  await userPasskeyModel.storeChallenge(
    `auth:${flowId}`,
    options.challenge,
    "authentication",
  )

  return jsonSuccess({ flowId, options })
}

type AuthenticatorTransport =
  | "ble"
  | "internal"
  | "nfc"
  | "usb"
  | "cable"
  | "hybrid"
  | "smart-card"
