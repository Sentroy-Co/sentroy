import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForInbox } from "@/lib/inbox-access"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; uid: string }> }
) {
  const { slug, uid } = await params

  let body: { mailbox?: string; folder?: string } = {}
  try {
    body = await request.json()
  } catch {
    // optional
  }

  const result = await getSentroyForInbox(request, slug, body.mailbox)
  if ("error" in result && result.error) return result.error

  try {
    await result.sentroy!.inbox.toggleFlag(
      Number(uid) as unknown as number,
      body.mailbox,
      body.folder,
    )
    return jsonSuccess({ message: "Flag toggled" })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to toggle flag"
    return jsonError(message, 500)
  }
}
