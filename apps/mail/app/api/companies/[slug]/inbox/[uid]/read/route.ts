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
    // body is optional
  }

  const result = await getSentroyForInbox(request, slug, body.mailbox)
  if ("error" in result && result.error) return result.error

  try {
    await result.sentroy!.inbox.markAsRead(
      Number(uid) as unknown as number,
      body.mailbox,
      body.folder,
    )
    return jsonSuccess({ message: "Marked as read" })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to mark as read"
    return jsonError(message, 500)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; uid: string }> }
) {
  const { slug, uid } = await params

  let body: { mailbox?: string; folder?: string } = {}
  try {
    body = await request.json()
  } catch {
    // body is optional
  }

  const result = await getSentroyForInbox(request, slug, body.mailbox)
  if ("error" in result && result.error) return result.error

  try {
    await result.sentroy!.inbox.markAsUnread(
      Number(uid) as unknown as number,
      body.mailbox,
      body.folder,
    )
    return jsonSuccess({ message: "Marked as unread" })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to mark as unread"
    return jsonError(message, 500)
  }
}
