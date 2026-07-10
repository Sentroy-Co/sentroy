import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForInbox, hasNoActiveDomain } from "@/lib/inbox-access"
import { mailFolderModel } from "@workspace/db/models"

interface FolderInfo {
  name: string
  path: string
  specialUse: string | null
  totalMessages: number
  unreadMessages: number
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const mailbox = request.nextUrl.searchParams.get("mailbox") || undefined

  const result = await getSentroyForInbox(request, slug, mailbox)
  if ("error" in result && result.error) return result.error

  try {
    const mailboxes = await result.sentroy!.inbox.listMailboxes()
    const list = (mailboxes.data as unknown as FolderInfo[]) ?? []

    // Server-side mirror: fold in any custom folders the user created
    // from the dashboard but that the mail-server's IMAP `LIST` cache
    // hasn't surfaced yet (Dovecot namespace lag, fresh sign-in on a
    // new device, etc). Without this union the user lands on a clean
    // browser and their custom folder — and any mail moved into it —
    // is invisible until the cache catches up.
    if (mailbox && result.companyId) {
      const companyId = result.companyId
      // Lazy backfill: any user-created folder coming back from IMAP
      // (non-system, no special-use) gets mirrored into our DB on
      // sight. Folders created before mail-folder mirroring shipped
      // weren't persisted at create time — without this pass they'd
      // never make it onto a fresh-device session. Cheap upsert,
      // best-effort, never fails the request.
      const SYSTEM_PATHS = new Set([
        "INBOX",
        "Sent",
        "Drafts",
        "Trash",
        "Spam",
        "Junk",
        "Archive",
      ])
      const userFolders = list.filter(
        (f) => !f.specialUse && !SYSTEM_PATHS.has(f.path),
      )
      if (userFolders.length > 0) {
        await Promise.all(
          userFolders.map((f) =>
            mailFolderModel
              .add({ companyId, mailbox, path: f.path })
              .catch(() => {}),
          ),
        )
      }

      try {
        const persisted = await mailFolderModel.listForMailbox({
          companyId,
          mailbox,
        })
        if (persisted.length > 0) {
          const existing = new Set(list.map((f) => f.path))
          for (const path of persisted) {
            if (existing.has(path)) continue
            list.push({
              name: path,
              path,
              specialUse: null,
              totalMessages: 0,
              unreadMessages: 0,
            })
          }
        }
      } catch {
        // Persisted-merge is best-effort; never fail the mailbox list
        // because of a DB hiccup.
      }
    }

    return jsonSuccess(list)
  } catch (err: unknown) {
    // Doğrulanmış domain yoksa klasör listesi de hata verir → 500 yerine boş.
    if (await hasNoActiveDomain(result.sentroy!)) return jsonSuccess([])
    const message =
      err instanceof Error ? err.message : "Failed to list mailboxes"
    return jsonError(message, 500)
  }
}
