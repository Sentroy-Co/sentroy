import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForInbox } from "@/lib/inbox-access"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; uid: string }> }
) {
  const { slug, uid } = await params
  const mailbox =
    request.nextUrl.searchParams.get("mailbox") || undefined
  const folder =
    request.nextUrl.searchParams.get("folder") || undefined

  const uidNum = Number(uid)
  if (!Number.isFinite(uidNum)) {
    return jsonError("Invalid uid")
  }

  const result = await getSentroyForInbox(request, slug, mailbox)
  if ("error" in result && result.error) return result.error

  try {
    const attachments = await result.sentroy!.inbox.getAttachments(
      uidNum,
      mailbox,
      folder,
    )
    return jsonSuccess(attachments.data)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to get attachments"
    return jsonError(message, 500)
  }
}
