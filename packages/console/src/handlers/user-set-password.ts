import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { auth } from "@workspace/auth/server/auth"

/**
 * OAuth-only kullanici icin ilk defa parola olusturur.
 * better-auth'un `setPassword` endpoint'i standart HTTP router'da expose
 * edilmediginden sunucu tarafi proxy olarak burada cagrilir.
 */
export async function POST(request: NextRequest) {
  let body: { newPassword?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.newPassword || body.newPassword.length < 8) {
    return jsonError("Password must be at least 8 characters")
  }

  try {
    await auth.api.setPassword({
      headers: request.headers,
      body: { newPassword: body.newPassword },
    })
    return jsonSuccess({ status: true })
  } catch (err: unknown) {
    const e = err as { statusCode?: number; body?: { message?: string } }
    if (e.statusCode === 401) return jsonError("Unauthorized", 401)
    return jsonError(
      e.body?.message || (err instanceof Error ? err.message : "Failed"),
      e.statusCode || 500,
    )
  }
}
