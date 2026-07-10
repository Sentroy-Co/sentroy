import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { getAuthSession, jsonError } from "@workspace/console/lib/api-helpers"
import { getDb } from "@workspace/db/client"
import { audit } from "@workspace/console/lib/audit"
import { issueSessionForUser } from "@workspace/auth/server/passkey-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST — admin'in hedef kullanıcı olarak oturum açması (impersonation).
 * Hedef kullanıcı için yeni bir better-auth session cookie set eder; admin
 * bu noktadan sonra o kullanıcı olarak gezinir. Audit'e işlenir.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const { id } = await params
  if (id === session.user.id) {
    return jsonError("You are already signed in as this user", 400)
  }

  let oid: ObjectId
  try {
    oid = new ObjectId(id)
  } catch {
    return jsonError("Invalid user id", 400)
  }

  const db = await getDb()
  const user = await db.collection("user").findOne({ _id: oid })
  if (!user) return jsonError("User not found", 404)

  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined
  const userAgent = request.headers.get("user-agent") || undefined

  const issued = await issueSessionForUser(id, { ipAddress, userAgent })

  await audit({
    userId: session.user.id,
    action: "admin.user.impersonate",
    resource: "user",
    resourceId: id,
    details: { targetEmail: user.email },
    request,
  })

  const res = NextResponse.json({ data: { ok: true } })
  res.cookies.set(
    issued.cookieName,
    issued.cookieValue,
    issued.cookieAttributes,
  )
  return res
}
