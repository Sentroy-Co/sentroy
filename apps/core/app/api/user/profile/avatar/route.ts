import { NextRequest } from "next/server"
import { ObjectId } from "mongodb"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import { cdnUpload } from "@workspace/cdn-client"
import { getDb } from "@workspace/db/client"
import { getOrCreateSystemBucket } from "@/lib/system-mail"

/**
 * POST /api/user/profile/avatar — kullanıcı profil fotosu upload.
 *
 * multipart/form-data → field "file" (image).
 * System bucket'a public asset olarak yazılır, returned URL `user.image`'e
 * yazılır. Önceki avatar varsa silmeyiz (CDN history için kalır).
 *
 * DELETE → user.image=null (avatar kaldırma).
 */
export async function POST(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return jsonError("Expected multipart/form-data body")
  }
  const file = form.get("file")
  if (!(file instanceof Blob) || file.size === 0) {
    return jsonError("No file provided")
  }
  if (file.size > 5 * 1024 * 1024) {
    return jsonError("Avatar must be 5 MB or less", 413)
  }
  if (!file.type.startsWith("image/")) {
    return jsonError("Only image files are accepted")
  }

  let bucket
  try {
    bucket = await getOrCreateSystemBucket(session.user.id)
  } catch (err) {
    console.error("[avatar] system bucket failed:", err)
    return jsonError(
      `System bucket unavailable: ${err instanceof Error ? err.message : "unknown"}`,
      503,
    )
  }

  const ext = file.type.split("/").pop() ?? "png"
  const filename = `avatar-${session.user.id}-${Date.now()}.${ext}`

  let result
  try {
    result = await cdnUpload(
      {
        companyId: bucket.companyId,
        bucketId: bucket.id,
        userId: session.user.id,
        userEmail: session.user.email ?? undefined,
      },
      file,
      {
        filename,
        folder: "avatars",
        isPublic: true,
        alt: `Avatar for ${session.user.email ?? session.user.id}`,
        tags: ["avatar", "user-profile"],
      },
    )
  } catch (err) {
    console.error("[avatar] cdnUpload failed:", err)
    return jsonError(
      `CDN upload failed: ${err instanceof Error ? err.message : "unknown"}`,
      502,
    )
  }
  if (!result?.url) return jsonError("CDN returned no url", 502)

  const db = await getDb()
  await db.collection("user").updateOne(
    { _id: new ObjectId(session.user.id) },
    { $set: { image: result.url, updatedAt: new Date() } },
  )

  return jsonSuccess({ image: result.url })
}

export async function DELETE(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)

  const db = await getDb()
  await db.collection("user").updateOne(
    { _id: new ObjectId(session.user.id) },
    { $set: { image: null, updatedAt: new Date() } },
  )
  return jsonSuccess({ image: null })
}
