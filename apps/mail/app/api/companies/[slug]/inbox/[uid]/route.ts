export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import {
  getSentroyForInbox,
  statusFromMailServerError,
} from "@/lib/inbox-access"
import {
  buildAttachmentUrl,
  signAttachmentToken,
} from "@/lib/attachment-token"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; uid: string }> }
) {
  const { slug, uid } = await params
  const mailbox =
    request.nextUrl.searchParams.get("mailbox") || undefined
  const folder =
    request.nextUrl.searchParams.get("folder") || undefined

  const result = await getSentroyForInbox(request, slug, mailbox)
  if ("error" in result && result.error) return result.error

  try {
    const uidNum = Number(uid)
    const message = await result.sentroy!.inbox.get(uidNum, mailbox, folder)
    const data =
      (message.data as unknown as Record<string, unknown> | null) ?? null

    // Always replace MessageDetail.attachments with the dedicated list
    // endpoint output. Two reasons:
    //
    //   1. Some IMAP backends return `attachments[]` without a usable
    //      partId — UI then builds `…/attachments//download` and 404s.
    //   2. Even when partId IS present in the detail payload, it may be
    //      a *different* numbering than what the download endpoint
    //      expects (e.g. detail returns the structural index "5" while
    //      the IMAP server's BODY[] addressing wants "2.3"). The list
    //      endpoint is authoritative for download-time identifiers.
    //
    // Cost: one extra IMAP call per detail fetch. Acceptable for now —
    // attachments are the rare path. If profiling shows latency we can
    // skip when filenames+sizes match perfectly.
    const detailAttachments = Array.isArray(data?.attachments)
      ? (data!.attachments as Array<Record<string, unknown>>)
      : []

    if (detailAttachments.length > 0 && data) {
      try {
        const enriched = await result.sentroy!.inbox.getAttachments(
          uidNum,
          mailbox,
          folder,
        )
        const list =
          (enriched.data as unknown as Array<Record<string, unknown>>) ?? []
        if (list.length > 0) {
          // Use the list response as the source of truth, but preserve
          // any extra fields the detail payload carried (e.g. inline
          // `contentId` for cid: references in the HTML body).
          const merged = list.map((l) => {
            const detailMatch = detailAttachments.find(
              (a) =>
                String(a.filename ?? "") === String(l.filename ?? "") &&
                Number(a.size ?? -1) === Number(l.size ?? -2),
            )
            return detailMatch ? { ...detailMatch, ...l } : l
          })
          data.attachments = merged
        }
      } catch {
        // Enrichment is best-effort. The UI hardens against bad
        // partIds; we'd rather return the raw detail than 500.
      }
    }

    // Pre-sign each attachment so the UI gets short, public-safe URLs
    // (`/a/<token>`) without round-tripping for every preview/download.
    // Tokens carry the slug+mailbox+uid+partId tuple and a 1-hour
    // expiry — long enough to read the message, short enough to limit
    // replay if a link leaks.
    const finalAttachments = Array.isArray(data?.attachments)
      ? (data!.attachments as Array<Record<string, unknown>>)
      : []
    for (const a of finalAttachments) {
      const partId = String(
        a.partId ?? a.id ?? a.part_id ?? a.partID ?? "",
      )
      if (!partId) continue
      try {
        const token = await signAttachmentToken({
          s: slug,
          m: mailbox ? mailbox.toLowerCase() : null,
          u: String(uidNum),
          p: partId,
          f: folder,
        })
        a.shortUrl = buildAttachmentUrl(token)
      } catch {
        // Secret missing — skip silently; UI falls back to long URL.
      }
    }

    return jsonSuccess(data)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to get message"
    return jsonError(message, statusFromMailServerError(err))
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; uid: string }> }
) {
  const { slug, uid } = await params
  const mailbox =
    request.nextUrl.searchParams.get("mailbox") || undefined
  const folder =
    request.nextUrl.searchParams.get("folder") || undefined

  const result = await getSentroyForInbox(request, slug, mailbox)
  if ("error" in result && result.error) return result.error

  try {
    await result.sentroy!.inbox.delete(
      Number(uid) as unknown as number,
      mailbox,
      folder,
    )
    return jsonSuccess({ message: "Message deleted" })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to delete message"
    return jsonError(message, statusFromMailServerError(err))
  }
}
