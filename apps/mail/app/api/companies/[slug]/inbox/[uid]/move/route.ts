export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForInbox } from "@/lib/inbox-access"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; uid: string }> }
) {
  const { slug, uid } = await params

  let body: { to?: string; from?: string; mailbox?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.to || typeof body.to !== "string" || !body.to.trim()) {
    return jsonError("Destination folder is required")
  }

  const result = await getSentroyForInbox(request, slug, body.mailbox)
  if ("error" in result && result.error) return result.error

  try {
    await result.sentroy!.inbox.move(
      Number(uid) as unknown as number,
      body.to.trim(),
      body.from,
      body.mailbox,
    )
    return jsonSuccess({ message: "Message moved" })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to move message"
    return jsonError(message, 500)
  }
}
