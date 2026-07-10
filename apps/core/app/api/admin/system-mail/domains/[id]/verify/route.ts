import { NextRequest } from "next/server"
import {
  jsonError,
  jsonSuccess,
  getAuthSession,
} from "@workspace/console/lib/api-helpers"
import { getSystemSentroyClient } from "@/lib/system-mail"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const { id } = await params
  try {
    const sentroy = await getSystemSentroyClient(session.user.id)
    const res = await sentroy.domains.verify(id)
    return jsonSuccess(res.data)
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Verify failed",
      502,
    )
  }
}
