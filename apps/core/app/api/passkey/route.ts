import { NextRequest } from "next/server"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import { userPasskeyModel } from "@workspace/db/models"

/** GET /api/passkey — kullanıcının passkey listesi (credentialID hariç). */
export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  const items = await userPasskeyModel.listForUser(session.user.id)
  // public key + credentialID UI'ya gönderme — sadece label info.
  return jsonSuccess(
    items.map((p) => ({
      id: p.id,
      name: p.name,
      transports: p.transports,
      createdAt: p.createdAt,
      lastUsedAt: p.lastUsedAt,
    })),
  )
}
