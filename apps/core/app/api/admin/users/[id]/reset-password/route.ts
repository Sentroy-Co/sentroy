import { NextRequest } from "next/server"
import { ObjectId } from "mongodb"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import { getDb } from "@workspace/db/client"
import { audit } from "@workspace/console/lib/audit"
import { auth } from "@workspace/auth/server/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST — kullanıcının e-postasına şifre sıfırlama bağlantısı gönderir. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const { id } = await params
  let oid: ObjectId
  try {
    oid = new ObjectId(id)
  } catch {
    return jsonError("Invalid user id", 400)
  }

  const db = await getDb()
  const user = await db.collection("user").findOne({ _id: oid })
  if (!user?.email) return jsonError("User not found", 404)

  try {
    await auth.api.requestPasswordReset({
      body: { email: user.email as string },
    })
  } catch (err) {
    console.error("[admin] reset-password trigger failed:", err)
    return jsonError("Failed to send reset link", 502)
  }

  await audit({
    userId: session.user.id,
    action: "admin.user.reset-password",
    resource: "user",
    resourceId: id,
    request,
  })

  return jsonSuccess({ ok: true, email: user.email })
}
