import { NextRequest } from "next/server"
import { getAuthSession, jsonError } from "@workspace/console/lib/api-helpers"

/** Admin rol kontrolu — system admin olmayan istekleri 401/403 ile reddeder. */
export async function assertAdmin(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return { error: jsonError("Unauthorized", 401) }
  if ((session.user as { role?: string }).role !== "admin") {
    return { error: jsonError("Forbidden", 403) }
  }
  return { session }
}
