import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForInbox } from "@/lib/inbox-access"

/**
 * GET /api/companies/{slug}/inbox/thread?mailbox=X&subject=Y
 *
 * Server-side thread toplama — INBOX + Sent klasorlerinde subject bazli arama
 * yaparak thread'teki tum mesajlari kronolojik sirada doner.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const mailbox = request.nextUrl.searchParams.get("mailbox") || undefined
  const subject = request.nextUrl.searchParams.get("subject")

  if (!subject) {
    return jsonError("subject query parameter is required")
  }

  const result = await getSentroyForInbox(request, slug, mailbox)
  if ("error" in result && result.error) return result.error

  try {
    const thread = await result.sentroy!.inbox.getThread(subject, mailbox)
    return jsonSuccess(thread.data)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to load thread"
    return jsonError(message, 500)
  }
}
