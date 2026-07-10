import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForInbox } from "@/lib/inbox-access"
import { mailFolderModel } from "@workspace/db/models"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  let body: { mailbox?: string; name?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const result = await getSentroyForInbox(request, slug, body.mailbox)
  if ("error" in result && result.error) return result.error

  try {
    const res = await result.sentroy!.inbox.createFolder(
      body.name || "",
      body.mailbox,
    )
    // Mirror server-side so a fresh sign-in on a different device still
    // sees the folder. The mail-server's own LIST cache may take a few
    // minutes to surface the new entry; the dashboard's mailbox-list
    // GET below merges this row into the response in the meantime.
    if (body.mailbox && result.companyId) {
      const path =
        ((res.data as { path?: string } | undefined)?.path as string) ??
        body.name ??
        ""
      if (path) {
        await mailFolderModel
          .add({
            companyId: result.companyId,
            mailbox: body.mailbox,
            path,
          })
          .catch(() => {
            // Best-effort persistence — never fail the create on a DB hiccup.
          })
      }
    }
    return jsonSuccess(res.data, 201)
  } catch (err: unknown) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to create folder",
      500,
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  let body: { mailbox?: string; oldPath?: string; newPath?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const result = await getSentroyForInbox(request, slug, body.mailbox)
  if ("error" in result && result.error) return result.error

  try {
    const res = await result.sentroy!.inbox.renameFolder(
      body.oldPath || "",
      body.newPath || "",
      body.mailbox,
    )
    // Keep the persisted mirror aligned with the IMAP rename so the
    // cross-device merge surfaces the new path, not the stale one.
    if (body.mailbox && result.companyId && body.oldPath && body.newPath) {
      await mailFolderModel
        .rename({
          companyId: result.companyId,
          mailbox: body.mailbox,
          oldPath: body.oldPath,
          newPath: body.newPath,
        })
        .catch(() => {})
    }
    return jsonSuccess(res.data)
  } catch (err: unknown) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to rename folder",
      500,
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const mailbox = request.nextUrl.searchParams.get("mailbox") || undefined
  const path = request.nextUrl.searchParams.get("path")

  if (!path) return jsonError("path is required")

  const result = await getSentroyForInbox(request, slug, mailbox)
  if ("error" in result && result.error) return result.error

  try {
    const res = await result.sentroy!.inbox.deleteFolder(path, mailbox)
    if (mailbox && result.companyId) {
      await mailFolderModel
        .remove({ companyId: result.companyId, mailbox, path })
        .catch(() => {})
    }
    return jsonSuccess(res.data)
  } catch (err: unknown) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to delete folder",
      500,
    )
  }
}
