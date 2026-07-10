import { NextRequest } from "next/server"
import { jsonError } from "@workspace/console/lib/api-helpers"
import { getSentroyForInbox } from "@/lib/inbox-access"
import { normalizeMime } from "@/lib/mime"

export async function GET(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ slug: string; uid: string; partId: string }> },
) {
  const { slug, uid, partId } = await params
  const mailbox = request.nextUrl.searchParams.get("mailbox") || undefined
  const folder = request.nextUrl.searchParams.get("folder") || undefined

  // Empty partId used to reach this handler when the UI built a URL
  // from a MessageDetail attachment with no `partId` field — the result
  // was a confusing 404 from upstream IMAP. Fail fast with a clear 400.
  if (!partId || partId.length === 0) {
    return jsonError("partId is required", 400)
  }

  const result = await getSentroyForInbox(request, slug, mailbox)
  if ("error" in result && result.error) return result.error

  try {
    const buffer = await result.sentroy!.inbox.downloadAttachment(
      Number(uid),
      partId,
      mailbox,
      folder,
    )

    // Recover real filename + content-type from the dedicated list
    // endpoint so the browser renders / saves the file correctly. The
    // raw download API doesn't surface either, so without this lookup
    // the response would arrive as `application/octet-stream` named
    // after the IMAP partId (e.g. "5") instead of "photo.png".
    let filename = `attachment-${partId}`
    let contentType = "application/octet-stream"
    try {
      const list = await result.sentroy!.inbox.getAttachments(
        Number(uid),
        mailbox,
        folder,
      )
      const items = (list.data as unknown as Array<{
        partId: string
        filename: string
        contentType: string
      }>) ?? []
      const match = items.find((it) => it.partId === partId)
      if (match) {
        if (match.filename) filename = match.filename
        if (match.contentType) contentType = normalizeMime(match.contentType)
      }
    } catch {
      // Best-effort enrichment.
    }

    const dispositionFilename = filename.replace(/"/g, "")
    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        // `inline` lets `<img src>` previews render the bytes; the UI's
        // download button forces a save via the `download` attribute on
        // the anchor, so this disposition serves both call sites.
        "Content-Disposition": `inline; filename="${dispositionFilename}"`,
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (err: unknown) {
    return jsonError(
      err instanceof Error ? err.message : "Download failed",
      500,
    )
  }
}
