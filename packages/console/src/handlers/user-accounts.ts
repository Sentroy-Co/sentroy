import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { auth } from "@workspace/auth/server/auth"

/** Kullanıcının bağlı provider hesaplarını döner (credential, google, vb.). */
export async function GET(request: NextRequest) {
  try {
    const accounts = await auth.api.listUserAccounts({
      headers: request.headers,
    })
    return jsonSuccess(accounts ?? [])
  } catch (err: unknown) {
    if ((err as { statusCode?: number }).statusCode === 401) {
      return jsonError("Unauthorized", 401)
    }
    return jsonError(
      err instanceof Error ? err.message : "Failed to list accounts",
      500,
    )
  }
}

/** Belirli bir provider hesabını çözer (unlink). */
export async function DELETE(request: NextRequest) {
  let body: { providerId?: string; accountId?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.providerId) {
    return jsonError("providerId is required")
  }

  try {
    await auth.api.unlinkAccount({
      headers: request.headers,
      body: {
        providerId: body.providerId,
        accountId: body.accountId,
      },
    })
    return jsonSuccess({ message: "Account unlinked" })
  } catch (err: unknown) {
    if ((err as { statusCode?: number }).statusCode === 401) {
      return jsonError("Unauthorized", 401)
    }
    return jsonError(
      err instanceof Error ? err.message : "Failed to unlink account",
      500,
    )
  }
}
