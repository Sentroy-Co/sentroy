import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getDb } from "@workspace/db/client"
import { ObjectId } from "mongodb"

/**
 * better-auth mongo-adapter id referanslarını ObjectId olarak saklar.
 * Ama bazı deploy'larda string olarak da kaydedilebiliyor — her iki biçimi
 * de sorgulayarak uyumluluğu sağlıyoruz.
 */
function userIdMatch(userId: string) {
  const variants: unknown[] = [userId]
  if (ObjectId.isValid(userId)) variants.push(new ObjectId(userId))
  return { $in: variants }
}

export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) {
    return jsonError("Unauthorized", 401)
  }

  const db = await getDb()
  const sessions = await db
    .collection("session")
    .find({ userId: userIdMatch(session.user.id) })
    .sort({ updatedAt: -1 })
    .toArray()

  const currentToken = session.session.token

  const mapped = sessions.map((s) => ({
    id: s._id.toString(),
    userId: typeof s.userId === "string" ? s.userId : s.userId?.toString(),
    token: s.token,
    expiresAt: s.expiresAt,
    ipAddress: s.ipAddress || null,
    userAgent: s.userAgent || null,
    ipInfo: s.ipInfo || null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    isCurrent: s.token === currentToken,
  }))

  return jsonSuccess(mapped)
}

export async function DELETE(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) {
    return jsonError("Unauthorized", 401)
  }

  let body: { sessionId?: string; revokeAll?: boolean }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const db = await getDb()

  if (body.revokeAll) {
    await db
      .collection("session")
      .deleteMany({
        userId: userIdMatch(session.user.id),
        token: { $ne: session.session.token },
      })
    return jsonSuccess({ revoked: "all" })
  }

  if (!body.sessionId) {
    return jsonError("sessionId is required")
  }

  if (!ObjectId.isValid(body.sessionId)) {
    return jsonError("Invalid sessionId")
  }

  const target = await db
    .collection("session")
    .findOne({ _id: new ObjectId(body.sessionId) })

  if (!target) {
    return jsonError("Session not found", 404)
  }

  const targetUserId =
    typeof target.userId === "string"
      ? target.userId
      : target.userId?.toString()

  if (targetUserId !== session.user.id) {
    return jsonError("Session not found", 404)
  }

  if (target.token === session.session.token) {
    return jsonError("Cannot revoke the current session")
  }

  await db
    .collection("session")
    .deleteOne({ _id: new ObjectId(body.sessionId) })

  return jsonSuccess({ revoked: body.sessionId })
}
