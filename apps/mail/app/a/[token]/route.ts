import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@workspace/db/client"
import { createSentroyClient } from "@/lib/sentroy"
import { verifyAttachmentToken } from "@/lib/attachment-token"
import { normalizeMime } from "@/lib/mime"

/**
 * Public, token-authenticated attachment delivery. The dashboard signs
 * a short URL when it loads a message; this route verifies the HMAC,
 * resolves the company's mail-server credentials, and streams the
 * attachment back. No session cookie required — the token *is* the
 * permission. Expiry is enforced inside `verifyAttachmentToken`.
 *
 * Why public: signed URLs can travel into `<img src>` for inline
 * preview, into anchor `download` attributes, into copy-paste links
 * the user shares with a colleague — none of which carry the user's
 * cookies. The HMAC + expiry combo is the access control.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const payload = await verifyAttachmentToken(token)
  if (!payload) {
    return new NextResponse("Invalid or expired link", { status: 403 })
  }

  const db = await getDb()
  const company = await db
    .collection("companies")
    .findOne({ slug: payload.s })
  if (!company) {
    return new NextResponse("Not found", { status: 404 })
  }
  const apiKey = company.sentroyApiKey as string | undefined
  if (!apiKey) {
    return new NextResponse("Mail server not provisioned", { status: 502 })
  }

  const sentroy = createSentroyClient(apiKey)

  try {
    const buffer = await sentroy.inbox.downloadAttachment(
      Number(payload.u),
      payload.p,
      payload.m ?? undefined,
      payload.f ?? undefined,
    )

    // We don't know the original filename here — the token only carries
    // the IMAP partId. Fetch the attachment list to recover it; if the
    // call fails (or the part has been deleted), fall back to a generic
    // name so the browser still saves the bytes.
    let filename = `attachment-${payload.p}`
    let contentType = "application/octet-stream"
    try {
      const list = await sentroy.inbox.getAttachments(
        Number(payload.u),
        payload.m ?? undefined,
        payload.f ?? undefined,
      )
      const items = (list.data as Array<{
        partId: string
        filename: string
        contentType: string
      }>) ?? []
      const match = items.find((it) => it.partId === payload.p)
      if (match) {
        if (match.filename) filename = match.filename
        if (match.contentType) contentType = normalizeMime(match.contentType)
      }
    } catch {
      // Best-effort enrichment; continue with generic headers.
    }

    // Inline disposition lets `<img src>` and `<iframe>` previews work
    // straight from the signed URL. Browsers still let the user save it
    // explicitly via the inbox UI's Download button.
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (err) {
    return new NextResponse(
      err instanceof Error ? err.message : "Download failed",
      { status: 502 },
    )
  }
}
