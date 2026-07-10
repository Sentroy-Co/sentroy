import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForInbox, hasNoActiveDomain } from "@/lib/inbox-access"
import { inboxBlockModel } from "@workspace/db/models"
import { filterAndPurgePage } from "@/lib/inbox-block-purge"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const searchParams = request.nextUrl.searchParams
  const mailbox = searchParams.get("mailbox") || undefined
  const folder = searchParams.get("folder") || undefined

  const result = await getSentroyForInbox(request, slug, mailbox)
  if ("error" in result && result.error) return result.error

  // INBOX'ta bloklanan göndericileri dönen sayfadan çıkar + mail-server'dan
  // sil (güvenlik). Sadece INBOX + mailbox belirtildiğinde; Trash/Sent gibi
  // klasörlere dokunma. Block yoksa veri olduğu gibi döner (fast-path).
  const isInbox = !folder || folder.toUpperCase() === "INBOX"
  async function maybePurgeBlocked<
    T extends { uid: number; from?: { address?: string | null } | null },
  >(data: T[]): Promise<T[]> {
    if (!mailbox || !isInbox || !result.companyId) return data
    try {
      const blocks = await inboxBlockModel.findActiveForMailbox(
        result.companyId,
        mailbox,
      )
      if (blocks.length === 0) return data
      const blockedSet = new Set(blocks.map((b) => b.blockedEmail))
      return await filterAndPurgePage(
        result.sentroy!,
        mailbox,
        data,
        blockedSet,
      )
    } catch {
      return data
    }
  }

  try {
    const q = searchParams.get("q")

    if (q) {
      const messages = await result.sentroy!.inbox.search({
        q,
        mailbox,
        folder,
      })
      return jsonSuccess(await maybePurgeBlocked(messages.data))
    }

    const page = searchParams.get("page")
      ? Number(searchParams.get("page"))
      : undefined
    const limit = searchParams.get("limit")
      ? Number(searchParams.get("limit"))
      : undefined
    const unreadParam = searchParams.get("unread")
    const unread = unreadParam === "true" ? true : undefined

    const messages = await result.sentroy!.inbox.list({
      page,
      limit,
      unread,
      mailbox,
      folder,
    })
    return jsonSuccess(await maybePurgeBlocked(messages.data))
  } catch (err: unknown) {
    // Doğrulanmış domain yoksa mailbox da yoktur → list/connection hata verir.
    // Bunu 500 yapma; "henüz domain yok" durumunu boş kutu olarak dön.
    if (await hasNoActiveDomain(result.sentroy!)) return jsonSuccess([])
    const message =
      err instanceof Error ? err.message : "Failed to list messages"
    return jsonError(message, 500)
  }
}
