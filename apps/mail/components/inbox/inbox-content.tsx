"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import debounce from "lodash/debounce"
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { format } from "date-fns"
import { toast } from "sonner"
import { normalizeMime } from "@/lib/mime"
import { usePendingFolders } from "@/stores/pending-folders"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Mail01Icon,
  Loading03Icon,
  Search01Icon,
  InboxIcon,
  SentIcon,
  Delete02Icon,
  FolderEditIcon,
  SpamIcon,
  Folder01Icon,
  ArchiveIcon,
  Mailbox01Icon,
  ArrowLeft01Icon,
  ArrowMoveDownRightIcon,
  MailOpen01Icon,
  PlusSignIcon,
  MoreHorizontalIcon,
  PencilEdit01Icon,
  Cancel01Icon,
  Megaphone01Icon,
  Alert01Icon,
  ShieldBanIcon,
  ReceiptDollarIcon,
  UserGroupIcon,
  UnfoldMoreIcon,
  StarIcon,
  Menu01Icon,
  MenuSquareIcon,
} from "@hugeicons/core-free-icons"

import { PageTransition, EmptyState } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Badge } from "@workspace/ui/components/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@workspace/ui/components/dropdown-menu"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@workspace/ui/components/context-menu"
import { confirm } from "@workspace/console/stores/confirm"
import { useBimiStore } from "@/stores/bimi"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@workspace/ui/components/resizable"
import {
  MessageListItem,
  type MessageSummary,
  type MessageAddress,
  type MessageListDensity,
} from "@/components/inbox/message-list-item"
import {
  MessageDetailView,
  type MessageDetail,
  type Attachment as MessageAttachment,
} from "@/components/inbox/message-detail"
import { ComposeSheet, type ComposeDefaults } from "@/components/inbox/compose-sheet"
import {
  FilePreviewLightbox,
  type FilePreviewItem,
} from "@workspace/ui/components/file-preview-lightbox"
import { cn } from "@workspace/ui/lib/utils"

// ── Types ───────────────────────────────────────────────────────────────────

interface EmailAccount {
  email: string
  domain: string
  username: string
}

interface Folder {
  name: string
  path: string
  specialUse: string | null
  totalMessages: number
  unreadMessages: number
}

type MobileView = "folders" | "messages" | "detail"

const FOLDER_ICONS: Record<string, typeof InboxIcon> = {
  "\\All": MailOpen01Icon,
  "\\Inbox": InboxIcon,
  "\\Sent": SentIcon,
  "\\Trash": Delete02Icon,
  "\\Drafts": FolderEditIcon,
  "\\Junk": SpamIcon,
  "\\Archive": ArchiveIcon,
  "\\Promotions": Megaphone01Icon,
  "\\Updates": Alert01Icon,
  "\\Receipts": ReceiptDollarIcon,
  "\\Social": UserGroupIcon,
}

function getFolderIcon(folder: Folder) {
  if (folder.specialUse && FOLDER_ICONS[folder.specialUse])
    return FOLDER_ICONS[folder.specialUse]
  if (folder.path === "INBOX") return InboxIcon
  if (folder.path === "__ALL__") return MailOpen01Icon
  return Folder01Icon
}

function getFolderOrder(folder: Folder): number {
  const order: Record<string, number> = {
    __ALL__: -1, "\\All": -1,
    INBOX: 0, "\\Inbox": 0,
    "\\Promotions": 0.1, "\\Updates": 0.2, "\\Receipts": 0.3, "\\Social": 0.4,
    "\\Drafts": 1, "\\Sent": 2,
    "\\Junk": 3, "\\Trash": 4, "\\Archive": 5,
  }
  if (order[folder.path] !== undefined) return order[folder.path]
  if (folder.specialUse && order[folder.specialUse] !== undefined)
    return order[folder.specialUse]
  return 10
}

/** Sistem klasorleri — yeniden adlandirilamaz ve silinemez */
const SYSTEM_FOLDER_PATHS = new Set([
  "INBOX", "Sent", "Trash", "Drafts", "Spam", "Junk", "__ALL__",
  "__CAT_promotions__", "__CAT_updates__", "__CAT_receipts__", "__CAT_social__",
])

// ── Mappers ─────────────────────────────────────────────────────────────────

interface RawAddress {
  name?: string
  address?: string
}

function toAddress(raw: unknown): MessageAddress {
  if (!raw) return { name: "", address: "" }
  if (typeof raw === "string") return { name: "", address: raw }
  const r = raw as RawAddress
  return { name: r.name ?? "", address: r.address ?? "" }
}

function toAddressList(raw: unknown): MessageAddress[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(toAddress)
  return [toAddress(raw)]
}

function mapSdkMessage(raw: Record<string, unknown>): MessageSummary {
  // Mail-server includes `preview` in summary; opportunistically lift
  // `List-Unsubscribe` from the partial headers some servers attach so
  // the categorizer gets a strong "is this bulk?" signal without an
  // extra detail fetch.
  const headers = (raw.headers as Record<string, string> | undefined) ?? undefined
  const hasListUnsubscribe = Boolean(
    headers?.["list-unsubscribe"] ?? headers?.["List-Unsubscribe"],
  )
  return {
    uid: String(raw.uid ?? raw.id ?? ""),
    from: toAddress(raw.from),
    to: toAddressList(raw.to),
    subject: String(raw.subject ?? ""),
    date: String(raw.date ?? ""),
    unread:
      raw.seen !== undefined
        ? !raw.seen
        : Boolean(raw.unread ?? raw.unseen ?? false),
    flagged: Boolean(raw.flagged ?? false),
    hasAttachments: Boolean(raw.hasAttachments ?? false),
    messageId: (raw.messageId as string | null) ?? null,
    inReplyTo: (raw.inReplyTo as string | null) ?? null,
    preview: (raw.preview as string | null | undefined) ?? null,
    hasListUnsubscribe,
  }
}

function mapSdkDetail(raw: Record<string, unknown>): MessageDetail {
  // Wide alias chain — different IMAP backends use different casings
  // (Dovecot returns `partId`, some Cyrus deployments use `part_id`).
  // Falling through to "" lets the UI hide the download CTA instead of
  // building a bad URL with a double slash.
  const attachments = Array.isArray(raw.attachments)
    ? raw.attachments.map((a: Record<string, unknown>) => ({
        partId: String(
          a.partId ?? a.id ?? a.part_id ?? a.partID ?? "",
        ),
        filename: String(a.filename ?? a.name ?? "attachment"),
        // Normalize defensively — old messages cached before the
        // mail-server fix may still surface `image/png/octet-stream`.
        // The mime helper trims the malformed extra subtype so `<img>`
        // sniffing and the download dialog see a valid MIME.
        contentType: normalizeMime(
          (a.contentType ?? a.mimeType) as string | null | undefined,
        ),
        size: Number(a.size ?? 0),
        // Server-signed short URL (`/a/<token>`) — used by the lightbox
        // and download button so the user sees a clean, copy-safe link
        // instead of a long auth-bearing path. Missing when the secret
        // is unset; UI falls back to the long URL in that case.
        shortUrl:
          typeof a.shortUrl === "string" ? a.shortUrl : undefined,
      }))
    : []

  return {
    uid: String(raw.uid ?? raw.id ?? ""),
    from: toAddress(raw.from),
    to: toAddressList(raw.to),
    cc: toAddressList(raw.cc),
    replyTo: toAddressList(raw.replyTo),
    subject: String(raw.subject ?? ""),
    date: String(raw.date ?? ""),
    html: (raw.html ?? raw.htmlBody) as string | undefined,
    text: (raw.text ?? raw.textBody) as string | undefined,
    flagged: Boolean(raw.flagged ?? false),
    attachments,
    messageId: (raw.messageId as string | null) ?? null,
    inReplyTo: (raw.inReplyTo as string | null) ?? null,
    references: Array.isArray(raw.references) ? (raw.references as string[]) : [],
    folder: (raw.folder as string | undefined) ?? undefined,
    headers: (raw.headers as Record<string, string> | undefined) ?? undefined,
    listUnsubscribe:
      (raw.headers as Record<string, string> | undefined)?.["list-unsubscribe"] ??
      (raw.headers as Record<string, string> | undefined)?.["List-Unsubscribe"] ??
      null,
    listUnsubscribePost:
      (raw.headers as Record<string, string> | undefined)?.["list-unsubscribe-post"] ??
      (raw.headers as Record<string, string> | undefined)?.["List-Unsubscribe-Post"] ??
      null,
  }
}

/** Folder path "Sent" ya da special_use "\\Sent" ise giden mailler klasörü. */
function isOutgoingFolder(folderPath: string | null | undefined): boolean {
  if (!folderPath) return false
  return folderPath === "Sent" || folderPath.toLowerCase() === "sent"
}

function isSpamFolder(folderPath: string | null | undefined): boolean {
  if (!folderPath) return false
  const lower = folderPath.toLowerCase()
  return lower === "spam" || lower === "junk"
}

function isTrashFolder(folderPath: string | null | undefined): boolean {
  if (!folderPath) return false
  return folderPath.toLowerCase() === "trash"
}

// ── Thread grouping ────────────────────────────────────────────────────────

interface ThreadGroup {
  /** Thread root anahtari — root mesajinin Message-ID'si veya UID fallback */
  rootKey: string
  /** Thread'deki mesajlar, en yeni once */
  messages: MessageSummary[]
  /** En yeni mesaj — listede gosterilen */
  latest: MessageSummary
  count: number
  hasUnread: boolean
}

/**
 * Subject'ten Re: / Fwd: / Ynt: / İlt: vb. prefix'leri cikartip normalize eder.
 * Ayni thread'teki mesajlar (reply/forward) boylece eslesir.
 */
function normalizeSubject(s: string): string {
  return s
    .replace(/^(Re|Fwd|Fw|Ynt|Yanit|İlt):\s*/gi, "")
    .trim()
    .toLowerCase()
}

/**
 * Mesajlari thread'lere gruplar — iki katmanli strateji:
 *
 * 1. **Message-ID zinciri**: `inReplyTo` uzerinden parent'a ulasir (ayni klasorde
 *    her iki tarafin mesajlari varsa calısır).
 * 2. **Subject fallback**: Zincir kopuksa (yanit Sent'e gittiginde INBOX'ta
 *    `inReplyTo` hedefi bulunamaz) normalize edilmis konu basligiyla eslestirir.
 *    Bu Gmail/Apple Mail'in de kullandigi standart yaklasimdir.
 *
 * Iki strateji birlestirilerek calisir — once zincir gruplari olusturulur,
 * sonra ayni normalize subject'e sahip gruplar birlestirilir.
 */
function groupIntoThreads(messages: MessageSummary[]): ThreadGroup[] {
  // ── Adim 1: Message-ID zinciriyle gruplama ─────────────────────────────
  const byMid = new Map<string, MessageSummary>()
  for (const m of messages) {
    if (m.messageId) byMid.set(m.messageId, m)
  }

  function findChainRootKey(start: MessageSummary): string {
    const seen = new Set<string>()
    let curr = start
    while (
      curr.inReplyTo &&
      byMid.has(curr.inReplyTo) &&
      !seen.has(curr.uid)
    ) {
      seen.add(curr.uid)
      curr = byMid.get(curr.inReplyTo)!
    }
    return curr.messageId || curr.uid
  }

  const chainGroups = new Map<string, MessageSummary[]>()
  for (const m of messages) {
    const key = findChainRootKey(m)
    if (!chainGroups.has(key)) chainGroups.set(key, [])
    chainGroups.get(key)!.push(m)
  }

  // ── Adim 2: Subject fallback — ayni konu basligina sahip chain gruplari birlestir
  const subjectMap = new Map<string, string>() // normSubject → mergedRootKey
  const mergedGroups = new Map<string, MessageSummary[]>()

  for (const [chainKey, msgs] of chainGroups) {
    const normSubj = normalizeSubject(msgs[0].subject)
    // Bos/cok kisa subject'ler icin fallback yapma — yanlis birlestirme riski
    if (normSubj.length < 3) {
      mergedGroups.set(chainKey, msgs)
      continue
    }

    const existingKey = subjectMap.get(normSubj)
    if (existingKey && mergedGroups.has(existingKey)) {
      mergedGroups.get(existingKey)!.push(...msgs)
    } else {
      subjectMap.set(normSubj, chainKey)
      mergedGroups.set(chainKey, [...msgs])
    }
  }

  // ── ThreadGroup nesneleri olustur ──────────────────────────────────────
  const result: ThreadGroup[] = []
  for (const [rootKey, msgs] of mergedGroups) {
    msgs.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    )
    result.push({
      rootKey,
      messages: msgs,
      latest: msgs[0],
      count: msgs.length,
      hasUnread: msgs.some((m) => m.unread ?? false),
    })
  }

  result.sort(
    (a, b) =>
      new Date(b.latest.date).getTime() - new Date(a.latest.date).getTime(),
  )
  return result
}

// ── Reply / Forward body builders ──────────────────────────────────────────

function formatAddrLine(a: MessageAddress): string {
  if (a.name && a.name.trim()) return `${a.name.trim()} <${a.address}>`
  return a.address
}

function buildReplyBody(msg: MessageDetail): string {
  let dateStr = msg.date
  try {
    dateStr = format(new Date(msg.date), "PPpp")
  } catch {}
  const header = `On ${dateStr}, ${formatAddrLine(msg.from)} wrote:`
  const original = msg.html || (msg.text ? `<pre>${msg.text}</pre>` : "")
  return `<br/><br/><blockquote style="border-left:2px solid #ccc;padding-left:12px;color:#666;margin:0;"><p>${header}</p>${original}</blockquote>`
}

function buildForwardBody(msg: MessageDetail): string {
  let dateStr = msg.date
  try {
    dateStr = format(new Date(msg.date), "PPpp")
  } catch {}
  const head = [
    `<b>From:</b> ${formatAddrLine(msg.from)}`,
    `<b>Date:</b> ${dateStr}`,
    `<b>Subject:</b> ${msg.subject}`,
    `<b>To:</b> ${msg.to.map(formatAddrLine).join(", ")}`,
  ].join("<br/>")
  const original = msg.html || (msg.text ? `<pre>${msg.text}</pre>` : "")
  return `<br/><br/>---------- Forwarded message ---------<br/>${head}<br/><br/>${original}`
}

// ── Component ───────────────────────────────────────────────────────────────

export function InboxContent() {
  const t = useTranslations("inbox")
  const ts = useTranslations("send")
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // URL'den gelen deep-link parametreleri (bildirime tiklandiginda).
  // `mailbox` + `folder` + `uid` page-state'in her parçasını yansıtır,
  // sayfa yenilemesi sonrası kullanıcı kaldığı yerden devam edebilsin.
  const urlMailbox = searchParams.get("mailbox")
  const urlSubject = searchParams.get("subject")
  const urlFolder = searchParams.get("folder")
  const urlUid = searchParams.get("uid")
  /** Mount-once flag — URL → state hydration sadece ilk render'da koşar
   *  ki state-driven URL update'leri hydration'ı tetiklemesin (sonsuz
   *  döngü engeli). Browser back/forward de URL change → searchParams
   *  re-render → ama hydratedRef true olduğu için state ezilmez. */
  const hydratedRef = useRef(false)

  // Email account selection
  const [accounts, setAccounts] = useState<EmailAccount[]>([])
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null)
  /** Account email → toplam okunmamis mesaj sayisi */
  const [accountUnreads, setAccountUnreads] = useState<Record<string, number>>({})

  // Folders & messages
  const [folders, setFolders] = useState<Folder[]>([])
  const [foldersLoading, setFoldersLoading] = useState(false)
  const [selectedFolder, setSelectedFolder] = useState<string>("INBOX")

  // Folder CRUD
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null)
  const [renameFolderName, setRenameFolderName] = useState("")
  const [messages, setMessages] = useState<MessageSummary[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  // AI category cache — uid → category. Populated lazily after each
  // message-list load. Categories outside this map are unknown to the
  // UI and surface as "primary" by default in the filter.
  const [categorizations, setCategorizations] = useState<Record<string, string>>({})
  const [categorizing, setCategorizing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedUid, setSelectedUid] = useState<string | null>(null)
  const [detail, setDetail] = useState<MessageDetail | null>(null)
  const [threadDetails, setThreadDetails] = useState<MessageDetail[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  // Bulk-select — independent of `selectedUid` so the user can scrub
  // through messages without losing their selection. Cleared whenever
  // the active account or folder changes (a mailbox switch should not
  // carry stale UIDs from the previous folder into a new context).
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set())
  /** Anchor for shift-click range select — last single-toggled UID. */
  const [lastSelectedUid, setLastSelectedUid] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  // Mobile view state (lg altinda aktif)
  const [mobileView, setMobileView] = useState<MobileView>("folders")

  // Liste yoğunluğu — comfortable (default) veya compact. localStorage'a
  // yazılır ki kullanıcı tercihi sayfa yenilemelerinde kalıcı olsun.
  // SSR-safe: ilk render'da default, mount sonrası gerçek değer.
  const [messageDensity, setMessageDensity] = useState<MessageListDensity>(
    "comfortable",
  )
  useEffect(() => {
    if (typeof window === "undefined") return
    const v = window.localStorage.getItem("sentroy.mail.density")
    if (v === "compact" || v === "comfortable") setMessageDensity(v)
  }, [])
  const persistDensity = useCallback((d: MessageListDensity) => {
    setMessageDensity(d)
    if (typeof window !== "undefined") {
      window.localStorage.setItem("sentroy.mail.density", d)
    }
  }, [])

  // Compose — controlled. `?compose=1` URL param'ı (floating widget'tan
  // gelen cross-app deep link) tetiklendiğinde otomatik açılır.
  const [composeOpen, setComposeOpen] = useState(
    () => searchParams.get("compose") === "1",
  )
  const [composeDefaults, setComposeDefaults] = useState<
    ComposeDefaults | undefined
  >(undefined)

  // Inbox sender block listesi — kullanıcının "bu gönderici beni rahatsız
  // ediyor" dediği adresler. Server'dan çekilir, mesaj listesi client-side
  // filtrelenir; mail-server'da silme yapılmaz (geri alınabilirlik için).
  interface BlockEntry {
    id: string
    blockedEmail: string
    mailbox: string | null
  }
  const [blocks, setBlocks] = useState<BlockEntry[]>([])
  const blocksApi = `/api/companies/${slug}/inbox-blocks`

  const fetchBlocks = useCallback(async () => {
    try {
      const res = await fetch(blocksApi)
      const json = await res.json()
      if (res.ok && Array.isArray(json.data)) {
        setBlocks(
          (json.data as Array<Record<string, unknown>>).map((b) => ({
            id: b.id as string,
            blockedEmail: (b.blockedEmail as string).toLowerCase(),
            mailbox: (b.mailbox as string | null) ?? null,
          })),
        )
      }
    } catch {
      // silent — block list non-critical
    }
  }, [blocksApi])

  useEffect(() => {
    fetchBlocks()
  }, [fetchBlocks])

  /** Tek mailbox için aktif blocked email Set'i — list filter'da kullanılır. */
  const blockedSetForMailbox = useMemo(() => {
    if (!selectedAccount) return new Set<string>()
    const mb = selectedAccount.toLowerCase()
    return new Set(
      blocks
        .filter((b) => b.mailbox === null || b.mailbox === mb)
        .map((b) => b.blockedEmail),
    )
  }, [blocks, selectedAccount])

  async function blockSender(email: string, scope: "mailbox" | "company") {
    if (!email) return
    try {
      const res = await fetch(blocksApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          mailbox: scope === "mailbox" ? selectedAccount : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Block failed")
      await fetchBlocks()
      toast.success(t("senderBlocked", { email }))
      // Aktif detail bu sender'a aitse panelden çıkar.
      if (
        detail &&
        detail.from?.address?.toLowerCase() === email.toLowerCase()
      ) {
        setSelectedUid(null)
        setDetail(null)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Block failed")
    }
  }

  async function unblockSender(email: string) {
    const target = email.toLowerCase()
    const matching = blocks.filter((b) => b.blockedEmail === target)
    if (matching.length === 0) return
    try {
      await Promise.all(
        matching.map((b) =>
          fetch(`${blocksApi}/${b.id}`, { method: "DELETE" }),
        ),
      )
      await fetchBlocks()
      toast.success(t("senderUnblocked", { email }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unblock failed")
    }
  }

  useEffect(() => {
    if (searchParams.get("compose") === "1") {
      setComposeOpen(true)
      // URL'i temizle ki refresh'te tekrar açılmasın.
      const url = new URL(window.location.href)
      url.searchParams.delete("compose")
      window.history.replaceState({}, "", url.toString())
    }
  }, [searchParams])

  // Floating compose button (same-app, same-page) → router.push yerine
  // CustomEvent ile direkt composer'ı tetikler. Sayfa zaten inbox olduğu
  // için soft nav bile lazım değil — re-render maliyeti sıfır.
  useEffect(() => {
    function open() {
      setComposeDefaults(undefined)
      setComposeOpen(true)
    }
    window.addEventListener("sentroy:compose-open", open)
    return () => window.removeEventListener("sentroy:compose-open", open)
  }, [])

  // Attachment lightbox state — preview tetiklendiğinde set edilir.
  // items: tıklanan mesajdaki tüm attachment'lardan üretilir, kullanıcı
  // arrow tuşlarıyla aralarında geçiş yapar. URL signed download endpoint;
  // mailbox + folder query param'ları zorunlu (sentroy backend recipient
  // resolve için kullanır).
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxItems, setLightboxItems] = useState<FilePreviewItem[]>([])
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const inboxApi = `/api/companies/${slug}/inbox`

  /** Sanal klasor path'lerini IMAP'e uygun hale getirir — __ALL__ ve __CAT_*__ → undefined (INBOX fallback). */
  function resolveFolder(folder: string | null | undefined): string | undefined {
    if (!folder) return undefined
    if (folder === "__ALL__" || folder.startsWith("__CAT_")) return undefined
    return folder
  }
  const mailboxesApi = `/api/companies/${slug}/mailboxes`

  const messagesAbortRef = useRef<AbortController | null>(null)
  const detailAbortRef = useRef<AbortController | null>(null)

  // ── Fetch email accounts ───────────────────────────────────────────────

  const fetchAccounts = useCallback(async () => {
    setAccountsLoading(true)
    try {
      const res = await fetch(mailboxesApi)
      const json = await res.json()
      if (res.ok && json.data) {
        const list = (json.data as EmailAccount[]) ?? []
        setAccounts(list)
        setSelectedAccount((prev) => {
          if (urlMailbox && list.some((a) => a.email === urlMailbox)) {
            return urlMailbox
          }
          return prev || (list.length > 0 ? list[0].email : null)
        })

        // Her account icin INBOX unread sayisini paralel cek
        // (secili account icin fetchFolders de ayni islemi yapar — ikisi de guvenlik)
        try {
          const results = await Promise.all(
            list.map(async (acc) => {
              try {
                // Otoriter unread kaynağı: /inbox/unread-count (sidebar
                // badge ile aynı). Folder listesinin `unreadMessages` alanı
                // mail-server'da güvenilmez — hep 0 gelip picker'da her
                // mailbox'ta yanlış "all caught up" gösteriyordu.
                const r = await fetch(
                  `${inboxApi}/unread-count?mailbox=${encodeURIComponent(acc.email)}`,
                )
                const j = await r.json()
                if (!r.ok) return { email: acc.email, unread: 0 }
                return {
                  email: acc.email,
                  unread: (j?.data?.count as number) ?? 0,
                }
              } catch {
                return { email: acc.email, unread: 0 }
              }
            }),
          )
          const map: Record<string, number> = {}
          for (const r of results) map[r.email] = r.unread
          setAccountUnreads(map)
        } catch {
          // paralel fetch basarisiz olursa bile account listesi gorunsun
        }
      }
    } catch {
      // silent
    } finally {
      setAccountsLoading(false)
    }
  }, [mailboxesApi, inboxApi])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  // ── Deep-link hydration (mount only) ───────────────────────────────────
  // URL → state on first render so a page reload (or a notification deep
  // link) lands the user back on exactly the mailbox / folder / message
  // they were viewing. Subsequent state changes write the URL via the
  // `useEffect` below; the `hydratedRef` guard keeps that loop from
  // re-firing this branch.
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    if (urlFolder) setSelectedFolder(urlFolder)
    if (urlUid) setSelectedUid(urlUid)
  }, [urlFolder, urlUid])

  // ── State → URL sync ──────────────────────────────────────────────────
  // Mirror the active mailbox / folder / uid into the URL with
  // `router.replace` so back/forward and bookmarks land on the same
  // view. `pathname` keeps the canonical path stable; we only swap the
  // query string. INBOX + null uid omitted from the URL because they're
  // the implicit defaults — keeps the bar clean.
  useEffect(() => {
    if (!hydratedRef.current) return
    const next = new URLSearchParams()
    if (selectedAccount) next.set("mailbox", selectedAccount)
    if (selectedFolder && selectedFolder !== "INBOX") {
      next.set("folder", selectedFolder)
    }
    if (selectedUid) next.set("uid", selectedUid)
    const qs = next.toString()
    const target = qs ? `${pathname}?${qs}` : pathname
    if (typeof window !== "undefined") {
      const current = `${window.location.pathname}${window.location.search}`
      if (current !== target) {
        router.replace(target, { scroll: false })
      }
    }
  }, [selectedAccount, selectedFolder, selectedUid, pathname, router])

  // ── Fetch folders ──────────────────────────────────────────────────────

  const fetchFolders = useCallback(
    async (account: string) => {
      setFoldersLoading(true)
      try {
        const res = await fetch(
          `${inboxApi}/mailboxes?mailbox=${encodeURIComponent(account)}`,
        )
        const json = await res.json()
        if (res.ok && json.data) {
          const list = (json.data as Folder[]).sort(
            (a, b) => getFolderOrder(a) - getFolderOrder(b),
          )
          // Merge with both transient component state and the persisted
          // pending-folders store. IMAP `LIST` after a `CREATE` doesn't
          // always surface the new folder on the next call (Dovecot or
          // Cyrus namespace cache lag, sometimes minutes); the persisted
          // store keeps the optimistic row alive across page reloads, so
          // the user doesn't see their new folder evaporate on refresh.
          // Auto-cleanup: store entries that DO appear in the canonical
          // list drop right here — they're now upstream-real.
          const incomingPaths = new Set(list.map((f) => f.path))
          const pendingStore = usePendingFolders.getState()
          const pendingForAccount =
            pendingStore.pending[account.toLowerCase()] ?? []
          for (const p of pendingForAccount) {
            if (incomingPaths.has(p)) {
              pendingStore.remove(account, p)
            }
          }
          const stillPending = pendingForAccount.filter(
            (p) => !incomingPaths.has(p),
          )

          setFolders((prev) => {
            const stateCarryOver = prev.filter(
              (p) =>
                !incomingPaths.has(p.path) &&
                !SYSTEM_FOLDER_PATHS.has(p.path) &&
                !p.specialUse,
            )
            const stateCarryPaths = new Set(stateCarryOver.map((f) => f.path))
            const storeOnly: Folder[] = stillPending
              .filter((p) => !stateCarryPaths.has(p))
              .map((p) => ({
                path: p,
                name: p,
                specialUse: null,
                totalMessages: 0,
                unreadMessages: 0,
              }))

            if (stateCarryOver.length === 0 && storeOnly.length === 0) {
              return list
            }
            return [...list, ...stateCarryOver, ...storeOnly].sort(
              (a, b) => getFolderOrder(a) - getFolderOrder(b),
            )
          })

          // Seçili account'un unread'ini otoriter kaynaktan (unread-count)
          // tazele — folder listesinin `unreadMessages` alanı güvenilmez.
          try {
            const cr = await fetch(
              `${inboxApi}/unread-count?mailbox=${encodeURIComponent(account)}`,
            )
            const cj = await cr.json()
            if (cr.ok) {
              setAccountUnreads((prev) => ({
                ...prev,
                [account]: (cj?.data?.count as number) ?? 0,
              }))
            }
          } catch {
            /* unread tazeleme best-effort */
          }
        }
      } catch {
        // silent
      } finally {
        setFoldersLoading(false)
      }
    },
    [inboxApi],
  )

  useEffect(() => {
    if (!selectedAccount) {
      setFolders([])
      return
    }
    // Switching mailboxes — clear stale entries first so an optimistic
    // folder created in mailbox A doesn't leak into mailbox B's view.
    // Hydrate immediately from the persisted pending-folders store so
    // a page reload doesn't show a blank list while IMAP `LIST` is in
    // flight; the canonical list will merge in when fetchFolders lands.
    const pending =
      usePendingFolders.getState().pending[selectedAccount.toLowerCase()] ?? []
    const hydrated: Folder[] = pending.map((p) => ({
      path: p,
      name: p,
      specialUse: null,
      totalMessages: 0,
      unreadMessages: 0,
    }))
    setFolders(hydrated)
    fetchFolders(selectedAccount)
  }, [selectedAccount, fetchFolders])

  // ── Fetch messages ─────────────────────────────────────────────────────

  const fetchMessages = useCallback(
    async (query?: string) => {
      if (!selectedAccount) return
      messagesAbortRef.current?.abort()
      const controller = new AbortController()
      messagesAbortRef.current = controller

      setMessagesLoading(true)
      try {
        const p = new URLSearchParams()
        p.set("mailbox", selectedAccount)
        if (selectedFolder) p.set("folder", selectedFolder)
        if (query) {
          p.set("q", query)
        } else {
          p.set("limit", "50")
        }

        const res = await fetch(`${inboxApi}?${p.toString()}`, {
          signal: controller.signal,
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Failed to load messages")
        const list = (json.data as Record<string, unknown>[]) ?? []
        const mapped = list.map(mapSdkMessage)
        setMessages(mapped)

        // BIMI — gonderici domainlerini batch cozumle (avatarlar icin)
        const domains = Array.from(
          new Set(
            mapped
              .map((m) => m.from?.address || "")
              .filter(Boolean)
              .map((addr) => {
                const at = addr.lastIndexOf("@")
                return at < 0 ? "" : addr.slice(at + 1).toLowerCase()
              })
              .filter(Boolean),
          ),
        )
        if (domains.length > 0) {
          void useBimiStore.getState().resolveMany(domains)
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return
        const message =
          err instanceof Error ? err.message : "Failed to load messages"
        toast.error(message)
      } finally {
        if (!controller.signal.aborted) {
          setMessagesLoading(false)
        }
      }
    },
    [inboxApi, selectedAccount, selectedFolder],
  )

  useEffect(() => {
    fetchMessages(searchQuery || undefined)
  }, [fetchMessages, searchQuery])

  // ── AI categorization (lazy) ────────────────────────────────────────
  // Whenever the message list changes, hand the still-unclassified UIDs
  // to the categorize endpoint. Endpoint hits MongoDB cache first and
  // only calls Gemini for new ones; we merge whatever it returns into
  // local state and the `__CAT_*` filter does the rest.
  //
  // `attemptedUidsRef` makes the loop idempotent: a UID gets POSTed at
  // most once per mailbox session. If the classifier doesn't return a
  // particular UID (it occasionally drops one), we just leave it
  // unclassified rather than re-POSTing forever.
  const categorizeAbortRef = useRef<AbortController | null>(null)
  const attemptedUidsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!selectedAccount || messages.length === 0) return
    const uncached = messages
      .filter(
        (m) => !categorizations[m.uid] && !attemptedUidsRef.current.has(m.uid),
      )
      .slice(0, 30)
    if (uncached.length === 0) return

    for (const m of uncached) attemptedUidsRef.current.add(m.uid)

    categorizeAbortRef.current?.abort()
    const controller = new AbortController()
    categorizeAbortRef.current = controller
    setCategorizing(true)

    const payload = {
      mailbox: selectedAccount,
      messages: uncached.map((m) => ({
        uid: m.uid,
        subject: m.subject,
        fromName: m.from?.name || null,
        fromAddress: m.from?.address || "",
        preview: m.preview ?? null,
        hasListUnsubscribe: m.hasListUnsubscribe ?? false,
      })),
    }

    fetch(`${inboxApi}/categorize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((json) => {
        if (controller.signal.aborted) return
        const data = json?.data as
          | {
              classifications?: Array<{ uid: string; category: string }>
            }
          | undefined
        const incoming = data?.classifications ?? []
        if (incoming.length === 0) return
        setCategorizations((prev) => {
          const next = { ...prev }
          for (const c of incoming) next[c.uid] = c.category
          return next
        })
      })
      .catch(() => {
        // Silent — classifier is best-effort, the inbox keeps working
        // even if Gemini or the AI gateway is temporarily unavailable.
      })
      .finally(() => {
        if (!controller.signal.aborted) setCategorizing(false)
      })

    return () => {
      controller.abort()
    }
    // categorizations is read inside but intentionally omitted from
    // deps: we use attemptedUidsRef to gate retries, so re-running on
    // every classification just to re-check uncached is wasted work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, selectedAccount, inboxApi])

  // Reset the cache + attempt set when switching mailboxes — UIDs are
  // namespaced per mailbox so a stale entry would mis-classify a
  // different account.
  useEffect(() => {
    setCategorizations({})
    attemptedUidsRef.current = new Set()
  }, [selectedAccount])

  // ── Unread count helpers ────────────────────────────────────────────

  /** Folder listesindeki unread sayisini optimistik guncelle */
  const adjustFolderUnread = useCallback(
    (folderPath: string | null | undefined, delta: number) => {
      const target = folderPath || "INBOX"
      setFolders((prev) =>
        prev.map((f) =>
          f.path === target
            ? { ...f, unreadMessages: Math.max(0, f.unreadMessages + delta) }
            : f,
        ),
      )
    },
    [],
  )

  /** Account unread sayisini optimistik guncelle */
  const adjustAccountUnread = useCallback(
    (email: string | null | undefined, delta: number) => {
      if (!email) return
      setAccountUnreads((prev) => ({
        ...prev,
        [email]: Math.max(0, (prev[email] ?? 0) + delta),
      }))
    },
    [],
  )

  // NotificationsProvider `sentroy:mail-delivered` custom event'ini fırlatır.
  // Event aktif mailbox'a aitse mesajlari + klasorleri yeniden yukleriz.
  // Farkli mailbox'a geldiyse sadece account unread sayisini arttirir.
  useEffect(() => {
    function handler(e: Event) {
      const evt = (e as CustomEvent<{ mailbox?: string; folder?: string }>)
        .detail
      if (!evt) return

      const eventMailbox = evt.mailbox?.toLowerCase()

      // Aktif mailbox'a geldiyse mesaj + folder listesi yenile
      if (
        selectedAccount &&
        eventMailbox === selectedAccount.toLowerCase()
      ) {
        // INBOX veya __ALL__ aciksa mesajlari yenile
        if (
          !selectedFolder ||
          selectedFolder === "INBOX" ||
          selectedFolder === "__ALL__"
        ) {
          fetchMessages(searchQuery || undefined)
        }
        // Folder listesini yenile (unread count guncellenir)
        fetchFolders(selectedAccount)
        // Account unread'ini de artir
        adjustAccountUnread(selectedAccount, 1)
      } else if (evt.mailbox) {
        // Farkli account'a gelen mail — sadece badge guncelle
        adjustAccountUnread(evt.mailbox, 1)
      }
    }
    window.addEventListener("sentroy:mail-delivered", handler)
    return () => window.removeEventListener("sentroy:mail-delivered", handler)
  }, [
    selectedAccount,
    selectedFolder,
    searchQuery,
    fetchMessages,
    fetchFolders,
    adjustAccountUnread,
  ])

  // ── Folder CRUD handlers ──────────────────────────────────────────────

  const foldersApi = `/api/companies/${slug}/inbox/folders`

  async function handleCreateFolder() {
    if (!newFolderName.trim() || !selectedAccount) return
    const name = newFolderName.trim()
    try {
      const res = await fetch(foldersApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailbox: selectedAccount,
          name,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      toast.success(t("folderCreated"))
      setNewFolderName("")
      setCreatingFolder(false)

      // Optimistic insert + persisted mirror. IMAP `LIST` after `CREATE`
      // doesn't always surface the new folder on the very next call
      // (server-side cache, namespace propagation). Insert the row from
      // the create response immediately so the user sees it; persist it
      // in `pending-folders` so a page reload doesn't drop the row;
      // re-fetch in the background to reconcile with the canonical list.
      const path =
        ((json.data as { path?: string } | undefined)?.path as string) ?? name
      usePendingFolders.getState().add(selectedAccount, path)
      setFolders((prev) =>
        prev.some((f) => f.path === path)
          ? prev
          : [
              ...prev,
              {
                path,
                name: path,
                specialUse: null,
                totalMessages: 0,
                unreadMessages: 0,
              } as Folder,
            ].sort((a, b) => getFolderOrder(a) - getFolderOrder(b)),
      )

      // Background reconcile — short delay covers most IMAP servers'
      // propagation window without making the user wait.
      setTimeout(() => {
        if (selectedAccount) fetchFolders(selectedAccount)
      }, 600)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }

  async function handleRenameFolder(oldPath: string) {
    if (!renameFolderName.trim() || !selectedAccount) return
    try {
      const res = await fetch(foldersApi, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailbox: selectedAccount,
          oldPath,
          newPath: renameFolderName.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      toast.success(t("folderRenamed"))
      setRenamingFolder(null)
      setRenameFolderName("")
      if (selectedFolder === oldPath) {
        setSelectedFolder(renameFolderName.trim())
      }
      fetchFolders(selectedAccount)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }

  async function handleDeleteFolder(path: string) {
    if (!selectedAccount) return
    const ok = await confirm({
      title: t("deleteFolderTitle"),
      description: t("deleteFolderDesc", { name: path }),
      confirmText: t("deleteFolder"),
      destructive: true,
    })
    if (!ok) return
    try {
      const qs = new URLSearchParams({ path, mailbox: selectedAccount })
      const res = await fetch(`${foldersApi}?${qs.toString()}`, {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      toast.success(t("folderDeleted"))
      if (selectedFolder === path) {
        setSelectedFolder("INBOX")
      }
      // Drop the persisted optimistic mirror — folder is gone upstream.
      usePendingFolders.getState().remove(selectedAccount, path)
      // Optimistic remove from local state so the row disappears
      // immediately even if mail-server LIST cache still surfaces it.
      setFolders((prev) => prev.filter((f) => f.path !== path))
      fetchFolders(selectedAccount)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }

  // Inbox'ta sadece blocked olmayan gönderileri göster — silmiyoruz, sadece
  // gizliyoruz ki kullanıcı block'u kaldırırsa eski mesajlar yine erişilebilir
  // olsun (server'da hâlâ duruyor).
  const visibleMessages = useMemo(() => {
    const blockFiltered = messages.filter((m) => {
      const addr = m.from?.address?.toLowerCase()
      return !addr || !blockedSetForMailbox.has(addr)
    })
    // Virtual category filter — `__CAT_promotions__` etc. show only
    // messages the AI labeled with that bucket. Unknown UIDs (still
    // classifying or classifier failed) drop out of the view; they
    // reappear once the next batch resolves.
    if (selectedFolder.startsWith("__CAT_")) {
      const target = selectedFolder.replace(/^__CAT_/, "").replace(/__$/, "")
      return blockFiltered.filter(
        (m) => categorizations[m.uid] === target,
      )
    }
    return blockFiltered
  }, [messages, blockedSetForMailbox, selectedFolder, categorizations])

  // Mesajlari thread'lere grupla — In-Reply-To zinciri uzerinden
  const threads = useMemo(
    () => groupIntoThreads(visibleMessages),
    [visibleMessages],
  )

  // ── Handlers ───────────────────────────────────────────────────────────

  const debouncedSetSearch = useMemo(
    () => debounce((value: string) => setSearchQuery(value), 400),
    [],
  )

  useEffect(() => {
    return () => {
      debouncedSetSearch.cancel()
      messagesAbortRef.current?.abort()
      detailAbortRef.current?.abort()
    }
  }, [debouncedSetSearch])

  const handleSearchChange = useCallback(
    (value: string) => debouncedSetSearch(value),
    [debouncedSetSearch],
  )

  const handleSelectAccount = useCallback((email: string) => {
    setSelectedAccount(email)
    setSelectedFolder("INBOX")
    setSelectedUid(null)
    setDetail(null)
    setMessages([])
    setSelectedUids(new Set())
    setLastSelectedUid(null)
  }, [])

  const handleSelectFolder = useCallback((path: string) => {
    setSelectedFolder(path)
    setSelectedUid(null)
    setDetail(null)
    setMobileView("messages")
    setSelectedUids(new Set())
    setLastSelectedUid(null)
  }, [])

  const handleSelectMessage = useCallback(
    async (uid: string) => {
      if (!selectedAccount) return
      detailAbortRef.current?.abort()
      const controller = new AbortController()
      detailAbortRef.current = controller

      setSelectedUid(uid)
      setDetailLoading(true)
      setMobileView("detail")

      try {
        // Thread grubundaki mesajin subject'ini al
        const thread = threads.find((t) =>
          t.messages.some((m) => m.uid === uid),
        )
        const subject = thread?.latest.subject || ""

        // Server-side thread fetch — INBOX + Sent cross-search
        const qs = new URLSearchParams()
        qs.set("mailbox", selectedAccount)
        qs.set("subject", subject)

        const res = await fetch(
          `${inboxApi}/thread?${qs.toString()}`,
          { signal: controller.signal },
        )
        const json = await res.json()

        let fetched: MessageDetail[]
        if (res.ok && Array.isArray(json.data) && json.data.length > 0) {
          fetched = (json.data as Record<string, unknown>[]).map(
            mapSdkDetail,
          )
          // Kronolojik sira (eskiden yeniye) — server zaten siralamali ama garanti
          fetched.sort(
            (a, b) =>
              new Date(a.date).getTime() - new Date(b.date).getTime(),
          )
        } else {
          // Fallback: tek mesaj fetch et (thread endpoint calismadiysa)
          const p = new URLSearchParams()
          p.set("mailbox", selectedAccount)
          if (selectedFolder) p.set("folder", selectedFolder)
          const singleRes = await fetch(
            `${inboxApi}/${uid}?${p.toString()}`,
            { signal: controller.signal },
          )
          const singleJson = await singleRes.json()
          if (!singleRes.ok)
            throw new Error(singleJson.error || "Failed to load message")
          fetched = [
            mapSdkDetail(singleJson.data as Record<string, unknown>),
          ]
        }

        setThreadDetails(fetched)
        const latest =
          fetched.length > 0 ? fetched[fetched.length - 1] : null
        setDetail(latest)

        // Thread'teki INBOX mesajlarini okundu isaretle
        const threadUids = thread
          ? thread.messages.map((m) => m.uid)
          : [uid]

        setMessages((prev) => {
          const unreadUids = threadUids.filter((u) => {
            const m = prev.find((msg) => msg.uid === u)
            return m?.unread
          })
          if (unreadUids.length === 0) return prev
          for (const u of unreadUids) {
            fetch(`${inboxApi}/${u}/read`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mailbox: selectedAccount,
                folder: resolveFolder(selectedFolder),
              }),
            }).catch(() => {})
          }
          // Unread count'lari optimistik dusur
          const count = unreadUids.length
          adjustFolderUnread(resolveFolder(selectedFolder), -count)
          adjustAccountUnread(selectedAccount, -count)

          const set = new Set(unreadUids)
          return prev.map((m) =>
            set.has(m.uid) ? { ...m, unread: false } : m,
          )
        })
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return
        const message =
          err instanceof Error ? err.message : "Failed to load message"
        toast.error(message)
      } finally {
        if (!controller.signal.aborted) {
          setDetailLoading(false)
        }
      }
    },
    [inboxApi, selectedAccount, selectedFolder, threads, adjustFolderUnread, adjustAccountUnread],
  )

  // ── Deep-link: URL'den gelen ?subject= parametresine uyan thread'i otomatik ac
  const deepLinkHandled = useRef(false)
  useEffect(() => {
    if (deepLinkHandled.current) return
    if (!urlSubject || threads.length === 0 || !selectedAccount) return

    const normTarget = normalizeSubject(urlSubject)
    const match = threads.find(
      (t) => normalizeSubject(t.latest.subject) === normTarget,
    )
    if (match) {
      deepLinkHandled.current = true
      handleSelectMessage(match.latest.uid)
      // URL'den parametreleri temizle (tekrar tetiklemesin)
      const url = new URL(window.location.href)
      url.searchParams.delete("mailbox")
      url.searchParams.delete("subject")
      window.history.replaceState({}, "", url.pathname)
    }
  }, [urlSubject, threads, selectedAccount, handleSelectMessage])

  /**
   * Wrapper'daki dot-menü > Sil butonu. Thread açıksa **tüm** thread
   * mesajlarını siler (kullanıcı beklentisi: kapsayıcı = thread, satır
   * silmek isteniyorsa thread içindeki bireysel mesaj menüsü kullanılır).
   * Tek mail görüntüleniyorsa (threadDetails boş) sadece selectedUid silinir.
   */
  const deleteMessages = useCallback(
    async (uids: string[], opts?: { resetSelection?: boolean }) => {
      if (!selectedAccount) return
      const f = resolveFolder(selectedFolder)
      const uidsToDelete = uids.filter(Boolean)
      if (uidsToDelete.length === 0) return

      try {
        let unreadDecrement = 0
        const failed: string[] = []
        for (const uid of uidsToDelete) {
          const p = new URLSearchParams()
          p.set("mailbox", selectedAccount)
          if (f) p.set("folder", f)
          const res = await fetch(
            `${inboxApi}/${uid}?${p.toString()}`,
            { method: "DELETE" },
          )
          if (!res.ok) {
            failed.push(uid)
            continue
          }
          const msg = messages.find((m) => m.uid === uid)
          if (msg?.unread) unreadDecrement++
        }

        if (unreadDecrement > 0) {
          adjustFolderUnread(f, -unreadDecrement)
          adjustAccountUnread(selectedAccount, -unreadDecrement)
        }
        const deletedSet = new Set(uidsToDelete.filter((u) => !failed.includes(u)))
        setMessages((prev) => prev.filter((m) => !deletedSet.has(m.uid)))
        if (opts?.resetSelection !== false) {
          setSelectedUid((prev) => (prev && deletedSet.has(prev) ? null : prev))
          setDetail((prev) => (prev && deletedSet.has(prev.uid) ? null : prev))
          setThreadDetails((prev) =>
            prev.some((m) => deletedSet.has(m.uid))
              ? prev.filter((m) => !deletedSet.has(m.uid))
              : prev,
          )
        }

        if (failed.length === 0) {
          toast.success(
            uidsToDelete.length > 1
              ? t("threadDeleted", { count: uidsToDelete.length })
              : t("messageDeleted"),
          )
        } else if (failed.length === uidsToDelete.length) {
          toast.error(t("messageDeleteFailed") || "Failed to delete")
        } else {
          toast.warning(
            t("threadPartialDelete", {
              ok: uidsToDelete.length - failed.length,
              failed: failed.length,
            }),
          )
        }
        fetchFolders(selectedAccount)
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to delete")
      }
    },
    [
      inboxApi,
      selectedAccount,
      selectedFolder,
      messages,
      t,
      adjustFolderUnread,
      adjustAccountUnread,
      fetchFolders,
    ],
  )

  const handleDelete = useCallback(async () => {
    if (!selectedUid) return
    const uids =
      threadDetails.length > 0
        ? threadDetails.map((m) => m.uid)
        : [selectedUid]
    await deleteMessages(uids)
    setMobileView("messages")
  }, [selectedUid, threadDetails, deleteMessages])

  const markMessageUnread = useCallback(
    async (uid: string) => {
      if (!uid || !selectedAccount) return
      try {
        await fetch(`${inboxApi}/${uid}/read`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mailbox: selectedAccount,
            folder: resolveFolder(selectedFolder),
          }),
        })
        setMessages((prev) => {
          const msg = prev.find((m) => m.uid === uid)
          if (msg && !msg.unread) {
            adjustFolderUnread(resolveFolder(selectedFolder), 1)
            adjustAccountUnread(selectedAccount, 1)
          }
          return prev.map((m) =>
            m.uid === uid ? { ...m, unread: true } : m,
          )
        })
        toast.success(t("markUnread"))
      } catch (err: unknown) {
        toast.error(
          err instanceof Error ? err.message : "Failed to mark as unread",
        )
      }
    },
    [inboxApi, selectedAccount, selectedFolder, t, adjustFolderUnread, adjustAccountUnread],
  )

  const handleMarkUnread = useCallback(async () => {
    if (!selectedUid) return
    await markMessageUnread(selectedUid)
  }, [selectedUid, markMessageUnread])

  const handleToggleFlag = useCallback(
    async (uid: string) => {
      if (!selectedAccount) return
      setMessages((prev) =>
        prev.map((m) => (m.uid === uid ? { ...m, flagged: !m.flagged } : m)),
      )
      setDetail((prev) =>
        prev && prev.uid === uid ? { ...prev, flagged: !prev.flagged } : prev,
      )
      try {
        const res = await fetch(`${inboxApi}/${uid}/flag`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mailbox: selectedAccount,
            folder: resolveFolder(selectedFolder),
          }),
        })
        if (!res.ok) throw new Error("Failed")
      } catch {
        setMessages((prev) =>
          prev.map((m) => (m.uid === uid ? { ...m, flagged: !m.flagged } : m)),
        )
        setDetail((prev) =>
          prev && prev.uid === uid
            ? { ...prev, flagged: !prev.flagged }
            : prev,
        )
        toast.error("Failed to toggle favorite")
      }
    },
    [inboxApi, selectedAccount, selectedFolder],
  )

  const handleMoveToFolder = useCallback(
    async (uid: string, to: string) => {
      if (!selectedAccount) return
      try {
        const msg = messages.find((m) => m.uid === uid)
        const res = await fetch(`${inboxApi}/${uid}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to,
            from: resolveFolder(selectedFolder),
            mailbox: selectedAccount,
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Failed to move")
        // Okunmamis mesaj tasiniyorsa kaynak klasor count dusur
        if (msg?.unread) {
          adjustFolderUnread(resolveFolder(selectedFolder), -1)
        }
        setMessages((prev) => prev.filter((m) => m.uid !== uid))
        setSelectedUid((prev) => (prev === uid ? null : prev))
        setDetail((prev) => (prev && prev.uid === uid ? null : prev))
        // Folder count'larini guncelle
        fetchFolders(selectedAccount)
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to move")
      }
    },
    [inboxApi, selectedAccount, selectedFolder, messages, adjustFolderUnread, fetchFolders],
  )

  const handleMove = useCallback(
    async (to: string) => {
      if (!selectedUid) return
      await handleMoveToFolder(selectedUid, to)
    },
    [selectedUid, handleMoveToFolder],
  )

  const handleMoveToSpam = useCallback(
    async (uid: string) => {
      const spamFolder =
        folders.find((f) => f.specialUse === "\\Junk")?.path ||
        folders.find((f) => f.path === "Spam" || f.path === "Junk")?.path ||
        "Spam"
      await handleMoveToFolder(uid, spamFolder)
    },
    [folders, handleMoveToFolder],
  )

  // Sets a "Always categorize as <cat>" rule for the given sender. Mirrors
  // the inline implementation in message-detail's wrapper dot-menu so the
  // row context menu and the per-thread dot menu use the same endpoint
  // shape (kind=category).
  const applyAlwaysCategorize = useCallback(
    async (sender: string, cat: string) => {
      if (!slug || !selectedAccount || !sender) return
      try {
        const res = await fetch(
          `/api/companies/${slug}/inbox/rules`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mailbox: selectedAccount,
              sender,
              kind: "category",
              category: cat,
            }),
          },
        )
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Failed")
        const updated = (json.data as { updated?: number })?.updated ?? 0
        toast.success(
          t("ruleAdded", {
            category: t(`ruleCategory_${cat}`),
            count: updated,
          }),
        )
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("ruleFailed"))
      }
    },
    [slug, selectedAccount, t],
  )

  // ── Bulk selection handlers ───────────────────────────────────────────
  // The visible UID list as the user actually sees it (post block-filter,
  // post category-filter). Used for shift-click range and "select all
  // visible" so neither operation accidentally touches a hidden UID.
  const visibleUidOrder = useMemo(
    () => threads.flatMap((th) => th.messages.map((m) => m.uid)),
    [threads],
  )

  const selectAllVisible = useCallback(() => {
    setSelectedUids(new Set(visibleUidOrder))
  }, [visibleUidOrder])

  const clearSelection = useCallback(() => {
    setSelectedUids(new Set())
    setLastSelectedUid(null)
  }, [])

  const allVisibleSelected =
    visibleUidOrder.length > 0 &&
    selectedUids.size >= visibleUidOrder.length &&
    visibleUidOrder.every((u) => selectedUids.has(u))

  const handleBulkDelete = useCallback(async () => {
    if (selectedUids.size === 0 || !selectedAccount) return
    const ok = await confirm({
      title: t("bulkDeleteTitle"),
      description: t("bulkDeleteDesc", { count: selectedUids.size }),
      confirmText: t("bulkDeleteConfirm"),
      destructive: true,
    })
    if (!ok) return
    const f = resolveFolder(selectedFolder)
    setBulkBusy(true)
    let okCount = 0
    let failCount = 0
    let unreadDecrement = 0
    const uids = Array.from(selectedUids)
    try {
      for (const uid of uids) {
        const p = new URLSearchParams()
        p.set("mailbox", selectedAccount)
        if (f) p.set("folder", f)
        const res = await fetch(`${inboxApi}/${uid}?${p.toString()}`, {
          method: "DELETE",
        })
        if (res.ok) {
          okCount += 1
          const m = messages.find((mm) => mm.uid === uid)
          if (m?.unread) unreadDecrement += 1
        } else {
          failCount += 1
        }
      }
      if (unreadDecrement > 0) {
        adjustFolderUnread(f, -unreadDecrement)
        adjustAccountUnread(selectedAccount, -unreadDecrement)
      }
      const okSet = new Set(uids.slice(0, okCount))
      // Removing by membership rather than slice index keeps things
      // correct even if a parallel update reorders the array.
      const removedUids = new Set(uids.filter((u) => !okSet.has(u) ? false : true))
      setMessages((prev) => prev.filter((m) => !removedUids.has(m.uid)))
      if (selectedUid && removedUids.has(selectedUid)) {
        setSelectedUid(null)
        setDetail(null)
        setThreadDetails([])
      }
      clearSelection()
      if (failCount === 0) {
        toast.success(t("bulkDeleted", { count: okCount }))
      } else if (okCount === 0) {
        toast.error(t("bulkDeleteFailedAll"))
      } else {
        toast.warning(t("bulkPartial", { ok: okCount, failed: failCount }))
      }
      fetchFolders(selectedAccount)
    } finally {
      setBulkBusy(false)
    }
  }, [
    selectedUids,
    selectedAccount,
    selectedFolder,
    selectedUid,
    inboxApi,
    messages,
    t,
    adjustFolderUnread,
    adjustAccountUnread,
    clearSelection,
    fetchFolders,
  ])

  const handleBulkMove = useCallback(
    async (to: string) => {
      if (selectedUids.size === 0 || !selectedAccount) return
      const f = resolveFolder(selectedFolder)
      setBulkBusy(true)
      let okCount = 0
      let failCount = 0
      let unreadDecrement = 0
      const uids = Array.from(selectedUids)
      try {
        // Sequential — IMAP MOVE renumbers UIDs as it goes; parallel
        // would race against the same session and lose messages.
        for (const uid of uids) {
          const res = await fetch(`${inboxApi}/${uid}/move`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to,
              from: f,
              mailbox: selectedAccount,
            }),
          })
          if (res.ok) {
            okCount += 1
            const m = messages.find((mm) => mm.uid === uid)
            if (m?.unread) unreadDecrement += 1
          } else {
            failCount += 1
          }
        }
        if (unreadDecrement > 0) {
          adjustFolderUnread(f, -unreadDecrement)
        }
        const movedUids = new Set(uids.slice(0, okCount))
        setMessages((prev) => prev.filter((m) => !movedUids.has(m.uid)))
        if (selectedUid && movedUids.has(selectedUid)) {
          setSelectedUid(null)
          setDetail(null)
          setThreadDetails([])
        }
        clearSelection()
        if (failCount === 0) {
          toast.success(t("bulkMoved", { count: okCount, folder: to }))
        } else if (okCount === 0) {
          toast.error(t("bulkMoveFailedAll"))
        } else {
          toast.warning(t("bulkPartial", { ok: okCount, failed: failCount }))
        }
        fetchFolders(selectedAccount)
      } finally {
        setBulkBusy(false)
      }
    },
    [
      selectedUids,
      selectedAccount,
      selectedFolder,
      selectedUid,
      inboxApi,
      messages,
      t,
      adjustFolderUnread,
      clearSelection,
      fetchFolders,
    ],
  )

  const handleBulkMarkRead = useCallback(
    async (read: boolean) => {
      if (selectedUids.size === 0 || !selectedAccount) return
      const f = resolveFolder(selectedFolder)
      setBulkBusy(true)
      let okCount = 0
      let failCount = 0
      let unreadDelta = 0
      const uids = Array.from(selectedUids)
      try {
        for (const uid of uids) {
          const path = `${inboxApi}/${uid}/read`
          const res = await fetch(path, {
            method: read ? "POST" : "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mailbox: selectedAccount,
              folder: f,
            }),
          })
          if (res.ok) {
            okCount += 1
            const m = messages.find((mm) => mm.uid === uid)
            if (m) {
              if (read && m.unread) unreadDelta -= 1
              if (!read && !m.unread) unreadDelta += 1
            }
          } else {
            failCount += 1
          }
        }
        if (unreadDelta !== 0) {
          adjustFolderUnread(f, unreadDelta)
          adjustAccountUnread(selectedAccount, unreadDelta)
        }
        const okSet = new Set(uids.slice(0, okCount))
        setMessages((prev) =>
          prev.map((m) =>
            okSet.has(m.uid) ? { ...m, unread: !read } : m,
          ),
        )
        if (failCount === 0) {
          toast.success(
            read
              ? t("bulkMarkedRead", { count: okCount })
              : t("bulkMarkedUnread", { count: okCount }),
          )
        } else if (okCount === 0) {
          toast.error(t("bulkActionFailed"))
        } else {
          toast.warning(t("bulkPartial", { ok: okCount, failed: failCount }))
        }
      } finally {
        setBulkBusy(false)
      }
    },
    [
      selectedUids,
      selectedAccount,
      selectedFolder,
      inboxApi,
      messages,
      t,
      adjustFolderUnread,
      adjustAccountUnread,
    ],
  )

  // ── Empty trash ────────────────────────────────────────────────────────
  // Wipes every message in the Trash folder. Sentroy's trash isn't a
  // tombstone — it's a real IMAP folder, so "empty" means hard-delete
  // each UID. We hit the per-message DELETE in a loop rather than
  // adding a destructive bulk endpoint; the action is rare enough that
  // the extra round-trips don't matter, and keeping it client-side
  // means audit log entries stay 1:1 with what the user sees.
  const trashFolderPath = useMemo(() => {
    return (
      folders.find((f) => f.specialUse === "\\Trash")?.path ||
      folders.find((f) => f.path.toLowerCase() === "trash")?.path ||
      null
    )
  }, [folders])

  const handleEmptyTrash = useCallback(async () => {
    if (!selectedAccount || !trashFolderPath) return
    if (!isTrashFolder(selectedFolder)) return
    if (visibleMessages.length === 0) return
    const ok = await confirm({
      title: t("emptyTrashTitle"),
      description: t("emptyTrashDesc", { count: visibleMessages.length }),
      confirmText: t("emptyTrashConfirm"),
      destructive: true,
    })
    if (!ok) return
    setBulkBusy(true)
    let okCount = 0
    let failCount = 0
    try {
      for (const m of visibleMessages) {
        const p = new URLSearchParams()
        p.set("mailbox", selectedAccount)
        p.set("folder", trashFolderPath)
        const res = await fetch(`${inboxApi}/${m.uid}?${p.toString()}`, {
          method: "DELETE",
        })
        if (res.ok) okCount += 1
        else failCount += 1
      }
      if (okCount > 0) {
        setMessages((prev) =>
          prev.filter(
            (m) => !visibleMessages.some((vm) => vm.uid === m.uid),
          ),
        )
        setSelectedUid(null)
        setDetail(null)
        setThreadDetails([])
        clearSelection()
      }
      if (failCount === 0) {
        toast.success(t("emptyTrashDone", { count: okCount }))
      } else if (okCount === 0) {
        toast.error(t("emptyTrashFailed"))
      } else {
        toast.warning(t("bulkPartial", { ok: okCount, failed: failCount }))
      }
      fetchFolders(selectedAccount)
    } finally {
      setBulkBusy(false)
    }
  }, [
    selectedAccount,
    trashFolderPath,
    selectedFolder,
    visibleMessages,
    inboxApi,
    t,
    clearSelection,
    fetchFolders,
  ])

  // ── Reply / Forward / Start compose ───────────────────────────────────

  function openCompose(defaults?: ComposeDefaults) {
    setComposeDefaults(defaults)
    setComposeOpen(true)
  }

  // RFC 5322: References = parent.references + parent.messageId (sirayla, dup yok)
  function buildThreadHeaders(parent: MessageDetail) {
    const inReplyTo = parent.messageId ?? undefined
    const refs = [...(parent.references ?? [])]
    if (parent.messageId && !refs.includes(parent.messageId)) {
      refs.push(parent.messageId)
    }
    return {
      inReplyTo,
      references: refs.length > 0 ? refs : undefined,
    }
  }

  const handleReply = useCallback(() => {
    if (!detail) return
    const replyTarget =
      detail.replyTo && detail.replyTo.length > 0
        ? detail.replyTo[0].address
        : detail.from.address
    openCompose({
      from: selectedAccount ?? undefined,
      to: replyTarget ? [replyTarget] : [],
      subject: detail.subject.startsWith("Re:")
        ? detail.subject
        : `Re: ${detail.subject}`,
      body: buildReplyBody(detail),
      ...buildThreadHeaders(detail),
    })
  }, [detail, selectedAccount])

  const handleReplyAll = useCallback(() => {
    if (!detail) return
    const selfLower = (selectedAccount ?? "").toLowerCase()
    const replyTarget =
      detail.replyTo && detail.replyTo.length > 0
        ? detail.replyTo[0].address
        : detail.from.address
    const toList = new Set<string>()
    if (replyTarget) toList.add(replyTarget)
    for (const a of detail.to) {
      if (a.address && a.address.toLowerCase() !== selfLower) {
        toList.add(a.address)
      }
    }
    const ccList = (detail.cc ?? [])
      .map((a) => a.address)
      .filter((a) => a && a.toLowerCase() !== selfLower)
    openCompose({
      from: selectedAccount ?? undefined,
      to: Array.from(toList),
      cc: ccList,
      subject: detail.subject.startsWith("Re:")
        ? detail.subject
        : `Re: ${detail.subject}`,
      body: buildReplyBody(detail),
      ...buildThreadHeaders(detail),
    })
  }, [detail, selectedAccount])

  const handleForward = useCallback(() => {
    if (!detail) return
    // Forward yeni bir thread baslatir — In-Reply-To/References gondermiyoruz
    openCompose({
      from: selectedAccount ?? undefined,
      to: [],
      subject: detail.subject.startsWith("Fwd:")
        ? detail.subject
        : `Fwd: ${detail.subject}`,
      body: buildForwardBody(detail),
    })
  }, [detail, selectedAccount])

  const handleStartComposeTo = useCallback(
    (address: string) => {
      openCompose({
        from: selectedAccount ?? undefined,
        to: [address],
      })
    },
    [selectedAccount],
  )

  // ── No mailboxes ───────────────────────────────────────────────────────

  if (!accountsLoading && accounts.length === 0) {
    return (
      <PageTransition className="flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
        </div>
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed">
          <EmptyState
            icon={<HugeiconsIcon icon={Mailbox01Icon} strokeWidth={1.5} />}
            title={t("noMailboxes")}
            description={t("noMailboxesDescription")}
          />
        </div>
      </PageTransition>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────

  // Sidebar (accounts + folders)
  const sidebarPane = (
    <div className="flex h-full flex-col">
      {/* Accounts — dropdown switcher */}
      <div className="border-b p-3">
        
        {accountsLoading ? (
          <Skeleton className="h-9 w-full rounded-lg" />
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="data-open:bg-muted/60 flex w-full items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-1.5 text-start text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <HugeiconsIcon
                icon={Mailbox01Icon}
                strokeWidth={2}
                className="size-3.5 shrink-0 text-muted-foreground"
              />
              <span className="min-w-0 flex-1 truncate text-xs">
                {selectedAccount ?? t("selectMailbox")}
              </span>
              {selectedAccount &&
                (accountUnreads[selectedAccount] ?? 0) > 0 && (
                  <Badge
                    variant="secondary"
                    className="h-4 min-w-4 justify-center px-1 text-[10px] font-semibold tabular-nums bg-primary/15 text-primary"
                  >
                    {accountUnreads[selectedAccount]}
                  </Badge>
                )}
              <HugeiconsIcon
                icon={UnfoldMoreIcon}
                strokeWidth={2}
                className="size-3.5 shrink-0 text-muted-foreground"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[--radix-dropdown-menu-trigger-width] min-w-72 p-1.5"
            >
              <div className="flex items-center justify-between px-2 pb-1.5 pt-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>{t("mailboxes")}</span>
                <span className="font-mono normal-case tracking-normal">
                  {accounts.length}
                </span>
              </div>
              {accounts.length === 0 ? (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                  {t("noMailboxes")}
                </div>
              ) : (
                accounts.map((acc) => {
                  const isActive = selectedAccount === acc.email
                  const unread = accountUnreads[acc.email] ?? 0
                  // Two-letter initials from the local part — avoids
                  // every mailbox sharing the same monogram on a busy
                  // company.
                  const local = acc.email.split("@")[0] ?? ""
                  const initials =
                    (local
                      .split(/[._-]+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((p) => p[0])
                      .join("") || acc.email.slice(0, 2))
                      .toUpperCase()
                  return (
                    <DropdownMenuItem
                      key={acc.email}
                      onClick={() => handleSelectAccount(acc.email)}
                      className={cn(
                        "group/mailbox gap-3 rounded-lg px-2 py-2",
                        isActive && "bg-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold ring-1",
                          isActive
                            ? "bg-foreground text-background ring-foreground"
                            : "bg-muted text-foreground/80 ring-border",
                        )}
                        aria-hidden
                      >
                        {initials}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[13px] font-medium text-foreground">
                          {acc.email}
                        </span>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {unread > 0
                            ? t("unreadMail", { count: unread })
                            : t("allCaughtUp")}
                        </span>
                      </span>
                      {unread > 0 && (
                        <Badge
                          variant="secondary"
                          className={cn(
                            "h-5 min-w-5 justify-center px-1.5 text-[10px] font-semibold tabular-nums",
                            isActive
                              ? "bg-foreground text-background"
                              : undefined,
                          )}
                        >
                          {unread}
                        </Badge>
                      )}
                    </DropdownMenuItem>
                  )
                })
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Folders */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("folders")}
        </span>
        {selectedAccount && !foldersLoading && (
          <button
            type="button"
            onClick={() => setCreatingFolder(true)}
            className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            title={t("createFolder")}
          >
            <HugeiconsIcon
              icon={PlusSignIcon}
              strokeWidth={2}
              className="size-3.5"
            />
          </button>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-0.5 p-1.5">
          {/* Create folder inline input */}
          {creatingFolder && (
            <div className="flex items-center gap-1.5 px-2.5 py-1">
              <Input
                value={newFolderName}
                onChange={(e) =>
                  setNewFolderName((e.target as HTMLInputElement).value)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFolder()
                  if (e.key === "Escape") {
                    setCreatingFolder(false)
                    setNewFolderName("")
                  }
                }}
                placeholder={t("folderNamePlaceholder")}
                className="h-7 text-xs"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  setCreatingFolder(false)
                  setNewFolderName("")
                }}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  strokeWidth={2}
                  className="size-3"
                />
              </button>
            </div>
          )}

          {foldersLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2"
              >
                <Skeleton className="size-4 rounded" />
                <Skeleton className="h-3.5 flex-1" />
              </div>
            ))
          ) : !selectedAccount ? (
            <div className="px-2.5 py-4 text-center text-xs text-muted-foreground">
              {t("selectMailboxFirst")}
            </div>
          ) : (
            (() => {
              // Virtual entries — synthesised on every render so labels
              // honour the active locale and the totals stay in sync with
              // whatever IMAP last returned.
              const inboxUnread =
                folders.find(
                  (f) => f.path === "INBOX" || f.specialUse === "\\Inbox",
                )?.unreadMessages ?? 0
              const allUnread = folders.reduce(
                (acc, f) => acc + (f.unreadMessages || 0),
                0,
              )

              const virtualAll: Folder = {
                name: t("categoryAll"),
                path: "__ALL__",
                specialUse: null,
                totalMessages: 0,
                unreadMessages: allUnread || inboxUnread,
              }

              // Kategori unread sayıları yalnızca *yüklü* mesajların
                // classifier önbelleğinden hesaplanır — IMAP tarafında
                // kategori-folder yok, dolayısıyla server-side bir
                // unread sayısı da yok. Liste görüntülendikçe sayım daha
                // doğrulaşır; ilk açılışta tahmini değer olur. Yine de
                // kullanıcıya "ne kadar okunmamış kalmış" sinyali verir.
                const catUnread = (cat: string) =>
                  messages.reduce(
                    (acc, m) =>
                      acc +
                      (m.unread && categorizations[m.uid] === cat ? 1 : 0),
                    0,
                  )
              const virtualCategories: Folder[] = [
                { name: t("categoryPromotions"), path: "__CAT_promotions__", specialUse: "\\Promotions", totalMessages: 0, unreadMessages: catUnread("promotions") },
                { name: t("categoryUpdates"),    path: "__CAT_updates__",    specialUse: "\\Updates",    totalMessages: 0, unreadMessages: catUnread("updates") },
                { name: t("categoryReceipts"),   path: "__CAT_receipts__",   specialUse: "\\Receipts",   totalMessages: 0, unreadMessages: catUnread("receipts") },
                { name: t("categorySocial"),     path: "__CAT_social__",     specialUse: "\\Social",     totalMessages: 0, unreadMessages: catUnread("social") },
              ]

              const realFolders = folders.filter(
                (f) => f.path !== "__ALL__" && !f.path.startsWith("__CAT_"),
              )

              // Kategori folder'ların icon kutusu — inline category
                // badge'lerde kullanılan palet ile aynı tonlar. Sidebar'da
                // gözle ayrılması bu sayede tek bakışta yapılabiliyor.
                const CAT_TONE: Record<string, { box: string; icon: string }> = {
                  __CAT_promotions__: {
                    box: "bg-rose-500/15 ring-rose-500/20",
                    icon: "text-rose-700 dark:text-rose-400",
                  },
                  __CAT_updates__: {
                    box: "bg-blue-500/15 ring-blue-500/20",
                    icon: "text-blue-700 dark:text-blue-400",
                  },
                  __CAT_receipts__: {
                    box: "bg-emerald-500/15 ring-emerald-500/20",
                    icon: "text-emerald-700 dark:text-emerald-400",
                  },
                  __CAT_social__: {
                    box: "bg-violet-500/15 ring-violet-500/20",
                    icon: "text-violet-700 dark:text-violet-400",
                  },
                }
              const renderRow = (folder: Folder) => {
                const icon = getFolderIcon(folder)
                const isActive = selectedFolder === folder.path
                const isSystem =
                  SYSTEM_FOLDER_PATHS.has(folder.path) || !!folder.specialUse
                const isRenaming = renamingFolder === folder.path
                const catTone = CAT_TONE[folder.path]

                return (
                  <div
                    key={folder.path}
                    className={cn(
                      "group/folder flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-sm transition-colors",
                      "hover:bg-muted/50",
                      isActive && "bg-muted font-medium",
                    )}
                  >
                    {isRenaming ? (
                      <>
                        <HugeiconsIcon
                          icon={icon}
                          strokeWidth={2}
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                        <Input
                          value={renameFolderName}
                          onChange={(e) =>
                            setRenameFolderName((e.target as HTMLInputElement).value)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameFolder(folder.path)
                            if (e.key === "Escape") {
                              setRenamingFolder(null)
                              setRenameFolderName("")
                            }
                          }}
                          className="h-6 flex-1 text-xs"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingFolder(null)
                            setRenameFolderName("")
                          }}
                          className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                        >
                          <HugeiconsIcon
                            icon={Cancel01Icon}
                            strokeWidth={2}
                            className="size-3"
                          />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleSelectFolder(folder.path)}
                          className="flex min-w-0 flex-1 items-center gap-2.5 text-start"
                        >
                          {catTone ? (
                            <span
                              className={cn(
                                "flex size-5 shrink-0 items-center justify-center rounded-md ring-1 ring-inset",
                                catTone.box,
                              )}
                            >
                              <HugeiconsIcon
                                icon={icon}
                                strokeWidth={2}
                                className={cn("size-3", catTone.icon)}
                              />
                            </span>
                          ) : (
                            <HugeiconsIcon
                              icon={icon}
                              strokeWidth={2}
                              className={cn(
                                "size-4 shrink-0",
                                isActive ? "text-foreground" : "text-muted-foreground",
                              )}
                            />
                          )}
                          <span className="flex-1 truncate text-start">
                            {folder.name}
                          </span>
                        </button>
                        {/* Trash unread'i göstermiyoruz — silinmiş mail'in
                            okunmamış olması kullanıcı için anlamlı bir
                            sinyal değil; rakam dikkat dağıtıyor. */}
                        {folder.unreadMessages > 0 &&
                          !isTrashFolder(folder.path) && (
                            <Badge
                              variant="secondary"
                              className="h-5 min-w-5 justify-center px-1.5 text-[10px] font-semibold tabular-nums"
                            >
                              {folder.unreadMessages}
                            </Badge>
                          )}
                        {!isSystem && (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <button
                                  type="button"
                                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 group-hover/folder:opacity-100"
                                >
                                  <HugeiconsIcon
                                    icon={MoreHorizontalIcon}
                                    strokeWidth={2}
                                    className="size-3.5"
                                  />
                                </button>
                              }
                            />
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setRenamingFolder(folder.path)
                                  setRenameFolderName(folder.name)
                                }}
                              >
                                <HugeiconsIcon
                                  icon={PencilEdit01Icon}
                                  strokeWidth={2}
                                  data-icon="inline-start"
                                />
                                {t("renameFolder")}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => handleDeleteFolder(folder.path)}
                              >
                                <HugeiconsIcon
                                  icon={Delete02Icon}
                                  strokeWidth={2}
                                  data-icon="inline-start"
                                />
                                {t("deleteFolder")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </>
                    )}
                  </div>
                )
              }

              return (
                <>
                  {/* All (virtual top-level) */}
                  {renderRow(virtualAll)}

                  {/* Categories — visual grouping, each entry is a virtual
                      mailbox path the message list translates to "all". */}
                  <div className="mt-3 flex items-center justify-between gap-1.5 px-2.5 pb-1">
                    <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("categories")}
                    </span>
                    {categorizing ? (
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        strokeWidth={2}
                        className="size-3 animate-spin text-muted-foreground"
                        aria-label={t("categorizing")}
                      />
                    ) : null}
                  </div>
                  {virtualCategories.map(renderRow)}

                  {/* Real IMAP folders */}
                  <div className="mt-3 px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("folders")}
                  </div>
                  {realFolders.length === 0 ? (
                    <div className="px-2.5 py-2 text-center text-xs text-muted-foreground">
                      {t("noFolders")}
                    </div>
                  ) : (
                    realFolders.map(renderRow)
                  )}
                </>
              )
            })()
          )}
        </div>
      </ScrollArea>
    </div>
  )

  // Messages list
  const selectionActive = selectedUids.size > 0
  // Folders the user can move into — strip system + special-use entries
  // so the bulk-move dropdown only lists user-created folders. The
  // current folder is also dropped (moving from X to X is a no-op IMAP
  // would error on).
  const moveDestinations = useMemo(() => {
    return folders.filter((f) => {
      if (f.specialUse) return false
      if (SYSTEM_FOLDER_PATHS.has(f.path)) return false
      if (f.path === selectedFolder) return false
      return true
    })
  }, [folders, selectedFolder])
  const messagesPane = (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center gap-2 border-b p-2.5">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setMobileView("folders")}
          className="lg:hidden"
          aria-label={t("back")}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
        </Button>
        <div className="relative flex-1">
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder={t("search")}
            onChange={(e) =>
              handleSearchChange((e.target as HTMLInputElement).value)
            }
            className="h-8 pl-8 text-sm"
          />
        </div>
        {/* Density toggle — comfortable (iki satır, geniş padding) ↔
            compact (tek satır, ekrana ~%30 daha fazla satır). Tercih
            localStorage'a yazılır, refresh'te kalıcı. */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() =>
                  persistDensity(
                    messageDensity === "compact" ? "comfortable" : "compact",
                  )
                }
                aria-label={
                  messageDensity === "compact"
                    ? t("densityComfortable")
                    : t("densityCompact")
                }
              >
                <HugeiconsIcon
                  icon={
                    messageDensity === "compact" ? MenuSquareIcon : Menu01Icon
                  }
                  strokeWidth={2}
                />
              </Button>
            }
          />
          <TooltipContent>
            {messageDensity === "compact"
              ? t("densityComfortable")
              : t("densityCompact")}
          </TooltipContent>
        </Tooltip>
        {blocks.length > 0 && (
          <BlockedSendersPopover
            blocks={blocks}
            onUnblock={(email) => unblockSender(email)}
            t={t}
          />
        )}
        {/* Empty-trash button — only when sitting on the Trash folder
            with at least one visible message. Confirm modal handles
            the destructive guard. */}
        {isTrashFolder(selectedFolder) &&
        visibleMessages.length > 0 &&
        !selectionActive ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleEmptyTrash}
            disabled={bulkBusy}
            className="text-destructive hover:text-destructive"
          >
            {bulkBusy ? (
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="animate-spin"
                data-icon="inline-start"
              />
            ) : (
              <HugeiconsIcon
                icon={Delete02Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
            )}
            {t("emptyTrash")}
          </Button>
        ) : null}
      </div>

      {!selectedAccount ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-sm text-muted-foreground">
            {t("selectMailboxFirst")}
          </p>
        </div>
      ) : messagesLoading ? (
        <div className="flex flex-col gap-0.5 p-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-lg px-3 py-2.5"
            >
              <Skeleton className="mt-1 size-2 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : visibleMessages.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <EmptyState
            icon={<HugeiconsIcon icon={Mail01Icon} strokeWidth={1.5} />}
            title={t("noMessages")}
            description={t("noMessagesDescription")}
          />
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-0.5 p-1.5">
            {threads.map((thread) => {
              const m = thread.latest
              // Selected: thread'in herhangi bir mesaji acik mi
              const isThreadSelected = thread.messages.some(
                (msg) => msg.uid === selectedUid,
              )
              // Bulk-select treats a thread as a unit — checking the
              // row pulls every UID in the thread into the selection
              // so "delete 5 selected" matches what the user sees.
              const threadUids = thread.messages.map((msg) => msg.uid)
              const isThreadMultiSelected = threadUids.every((u) =>
                selectedUids.has(u),
              )
              const senderEmail = m.from?.address?.toLowerCase() ?? ""
              const inSpam = isSpamFolder(selectedFolder)
              const inTrash = isTrashFolder(selectedFolder)
              const inOutgoing = isOutgoingFolder(selectedFolder)
              // Move-to candidates exclude the current folder itself and
              // virtual category folders (those are read-only views).
              const currentFolderResolved = resolveFolder(selectedFolder)
              const moveTargets = folders.filter(
                (f) =>
                  f.path !== "__ALL__" &&
                  !f.path.startsWith("__CAT_") &&
                  f.path !== currentFolderResolved,
              )
              return (
                <ContextMenu key={thread.rootKey}>
                  <ContextMenuTrigger>
                    <MessageListItem
                      message={{
                        ...m,
                        unread: thread.hasUnread,
                      }}
                      isSelected={isThreadSelected}
                      showRecipient={inOutgoing}
                      threadCount={thread.count}
                      threadMessages={thread.messages}
                      currentMailbox={selectedAccount}
                      isMultiSelected={isThreadMultiSelected}
                      selectionActive={selectionActive}
                      category={categorizations[m.uid]}
                      density={messageDensity}
                      onToggleMultiSelect={(evt) => {
                        setSelectedUids((prev) => {
                          const next = new Set(prev)
                          const fullySelected = threadUids.every((u) =>
                            next.has(u),
                          )
                          // Shift-click extends a range from the previously
                          // toggled UID to the latest message in this thread.
                          if (
                            evt.shiftKey &&
                            lastSelectedUid &&
                            lastSelectedUid !== m.uid
                          ) {
                            const a = visibleUidOrder.indexOf(lastSelectedUid)
                            const b = visibleUidOrder.indexOf(m.uid)
                            if (a >= 0 && b >= 0) {
                              const [lo, hi] = a < b ? [a, b] : [b, a]
                              const turningOn = !fullySelected
                              for (let i = lo; i <= hi; i++) {
                                const u = visibleUidOrder[i]!
                                if (turningOn) next.add(u)
                                else next.delete(u)
                              }
                              setLastSelectedUid(m.uid)
                              return next
                            }
                          }
                          if (fullySelected) {
                            for (const u of threadUids) next.delete(u)
                          } else {
                            for (const u of threadUids) next.add(u)
                          }
                          setLastSelectedUid(m.uid)
                          return next
                        })
                      }}
                      onClick={() => handleSelectMessage(m.uid)}
                      onToggleFlag={() => handleToggleFlag(m.uid)}
                      onMoveToSpam={
                        inOutgoing || inSpam || inTrash
                          ? undefined
                          : () => handleMoveToSpam(m.uid)
                      }
                    />
                  </ContextMenuTrigger>
                  <ContextMenuContent align="start">
                    <ContextMenuItem onClick={() => handleSelectMessage(m.uid)}>
                      <HugeiconsIcon icon={MailOpen01Icon} strokeWidth={2} />
                      {t("open")}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => markMessageUnread(m.uid)}>
                      <HugeiconsIcon icon={Mail01Icon} strokeWidth={2} />
                      {t("markUnread")}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleToggleFlag(m.uid)}>
                      <HugeiconsIcon icon={StarIcon} strokeWidth={2} />
                      {m.flagged ? t("unfavorite") : t("favorite")}
                    </ContextMenuItem>
                    {moveTargets.length > 0 ? (
                      <ContextMenuSub>
                        <ContextMenuSubTrigger>
                          <HugeiconsIcon
                            icon={ArrowMoveDownRightIcon}
                            strokeWidth={2}
                          />
                          {t("moveTo")}
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent>
                          {moveTargets.map((f) => (
                            <ContextMenuItem
                              key={f.path}
                              onClick={() =>
                                handleMoveToFolder(m.uid, f.path)
                              }
                            >
                              {f.name}
                            </ContextMenuItem>
                          ))}
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                    ) : null}
                    {!inOutgoing && !inSpam && !inTrash ? (
                      <ContextMenuItem
                        onClick={async () => {
                          const ok = await confirm({
                            title: t("moveToSpam"),
                            description: t("moveToSpamConfirm"),
                            confirmText: t("moveToSpam"),
                            destructive: true,
                          })
                          if (ok) await handleMoveToSpam(m.uid)
                        }}
                      >
                        <HugeiconsIcon icon={SpamIcon} strokeWidth={2} />
                        {t("moveToSpam")}
                      </ContextMenuItem>
                    ) : null}
                    {senderEmail ? (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onClick={() => blockSender(senderEmail, "mailbox")}
                        >
                          <HugeiconsIcon
                            icon={ShieldBanIcon}
                            strokeWidth={2}
                          />
                          <div className="flex min-w-0 flex-col items-start">
                            <span>{t("blockSender")}</span>
                            <span
                              className="max-w-[14rem] truncate text-[10.5px] text-muted-foreground"
                              title={senderEmail}
                            >
                              {senderEmail}
                            </span>
                          </div>
                        </ContextMenuItem>
                        <ContextMenuSub>
                          <ContextMenuSubTrigger>
                            <HugeiconsIcon
                              icon={UserGroupIcon}
                              strokeWidth={2}
                            />
                            <div className="flex min-w-0 flex-col items-start">
                              <span>{t("ruleAlwaysCategorize")}</span>
                              <span
                                className="max-w-[14rem] truncate text-[10.5px] text-muted-foreground"
                                title={senderEmail}
                              >
                                {senderEmail}
                              </span>
                            </div>
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent>
                            {(
                              [
                                "promotions",
                                "updates",
                                "receipts",
                                "social",
                                "primary",
                              ] as const
                            ).map((cat) => (
                              <ContextMenuItem
                                key={cat}
                                onClick={() =>
                                  applyAlwaysCategorize(senderEmail, cat)
                                }
                              >
                                {t(`ruleCategory_${cat}`)}
                              </ContextMenuItem>
                            ))}
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                      </>
                    ) : null}
                    {!inTrash ? (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          variant="destructive"
                          onClick={async () => {
                            const ok = await confirm({
                              title: t("delete"),
                              description: t("deleteMessageConfirm"),
                              confirmText: t("delete"),
                              destructive: true,
                            })
                            if (ok) await deleteMessages(threadUids)
                          }}
                        >
                          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                          {t("delete")}
                        </ContextMenuItem>
                      </>
                    ) : null}
                  </ContextMenuContent>
                </ContextMenu>
              )
            })}
          </div>
        </ScrollArea>
      )}

      {/* Floating bulk-action bar — overlays the bottom of the
          message pane only when at least one row is selected. Single
          row of icon-only buttons with tooltips so it stays compact
          even on narrow viewports. Backdrop-blur + shadow lifts it
          off the list visually; pointer-events on the wrapper isolate
          it from the list scroll behind. */}
      {selectionActive ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-3">
          <div className="pointer-events-auto flex h-11 max-w-full items-center gap-1 rounded-full border border-border bg-popover/95 px-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-popover/80">
            <button
              type="button"
              onClick={
                allVisibleSelected ? clearSelection : selectAllVisible
              }
              disabled={bulkBusy}
              className="flex h-7 items-center gap-1.5 rounded-full bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              title={allVisibleSelected ? t("clearSelection") : t("selectAll")}
            >
              <span className="tabular-nums">{selectedUids.size}</span>
              <span className="hidden sm:inline">
                {t("selectedShort")}
              </span>
            </button>
            <span className="mx-0.5 h-5 w-px bg-border/80" aria-hidden />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleBulkMarkRead(true)}
                    disabled={bulkBusy}
                    aria-label={t("bulkMarkRead")}
                  >
                    <HugeiconsIcon icon={MailOpen01Icon} strokeWidth={2} />
                  </Button>
                }
              />
              <TooltipContent>{t("bulkMarkRead")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleBulkMarkRead(false)}
                    disabled={bulkBusy}
                    aria-label={t("bulkMarkUnread")}
                  >
                    <HugeiconsIcon icon={Mail01Icon} strokeWidth={2} />
                  </Button>
                }
              />
              <TooltipContent>{t("bulkMarkUnread")}</TooltipContent>
            </Tooltip>
            {moveDestinations.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={bulkBusy}
                      aria-label={t("bulkMove")}
                      title={t("bulkMove")}
                    >
                      <HugeiconsIcon icon={Folder01Icon} strokeWidth={2} />
                    </Button>
                  }
                />
                <DropdownMenuContent
                  align="center"
                  side="top"
                  className="max-h-72 overflow-y-auto"
                >
                  {moveDestinations.map((f) => (
                    <DropdownMenuItem
                      key={f.path}
                      onClick={() => handleBulkMove(f.path)}
                    >
                      <HugeiconsIcon
                        icon={Folder01Icon}
                        strokeWidth={2}
                        data-icon="inline-start"
                      />
                      <span className="truncate">{f.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleBulkDelete}
                    disabled={bulkBusy}
                    aria-label={t("bulkDelete")}
                    className="text-destructive hover:text-destructive"
                  >
                    {bulkBusy ? (
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        strokeWidth={2}
                        className="animate-spin"
                      />
                    ) : (
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                    )}
                  </Button>
                }
              />
              <TooltipContent>{t("bulkDelete")}</TooltipContent>
            </Tooltip>
            <span className="mx-0.5 h-5 w-px bg-border/80" aria-hidden />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={clearSelection}
                    disabled={bulkBusy}
                    aria-label={t("clearSelection")}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                  </Button>
                }
              />
              <TooltipContent>{t("clearSelection")}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      ) : null}
    </div>
  )

  // Detail pane
  const detailPane = detailLoading ? (
    <div className="flex h-full items-center justify-center">
      <HugeiconsIcon
        icon={Loading03Icon}
        strokeWidth={2}
        className="size-6 animate-spin text-muted-foreground"
      />
    </div>
  ) : detail && selectedUid ? (
    <MessageDetailView
      message={detail}
      threadMessages={threadDetails}
      currentMailbox={selectedAccount}
      currentFolder={selectedFolder}
      availableFolders={folders}
      onDelete={isTrashFolder(selectedFolder) ? undefined : handleDelete}
      onDeleteMessage={
        isTrashFolder(selectedFolder)
          ? undefined
          : (uid) => deleteMessages([uid])
      }
      onMarkUnread={handleMarkUnread}
      onToggleFlag={() => selectedUid && handleToggleFlag(selectedUid)}
      onMoveToSpam={
        isOutgoingFolder(selectedFolder) ||
        isSpamFolder(selectedFolder) ||
        isTrashFolder(selectedFolder)
          ? undefined
          : () => selectedUid && handleMoveToSpam(selectedUid)
      }
      onMove={handleMove}
      onReply={handleReply}
      onReplyAll={handleReplyAll}
      onForward={handleForward}
      onReplyToMessage={(msg) => {
        const replyTarget =
          msg.replyTo && msg.replyTo.length > 0
            ? msg.replyTo[0].address
            : msg.from.address
        openCompose({
          from: selectedAccount ?? undefined,
          to: replyTarget ? [replyTarget] : [],
          subject: msg.subject.startsWith("Re:")
            ? msg.subject
            : `Re: ${msg.subject}`,
          body: buildReplyBody(msg),
          ...buildThreadHeaders(msg),
        })
      }}
      onForwardMessage={(msg) => {
        openCompose({
          from: selectedAccount ?? undefined,
          to: [],
          subject: msg.subject.startsWith("Fwd:")
            ? msg.subject
            : `Fwd: ${msg.subject}`,
          body: buildForwardBody(msg),
        })
      }}
      onStartComposeTo={handleStartComposeTo}
      onStartComposeFromAi={(defaults) => {
        setComposeDefaults(defaults)
        setComposeOpen(true)
      }}
      onBlockSender={(email) => blockSender(email, "mailbox")}
      onDownloadAttachment={async (uid, partId, filename) => {
        if (!selectedAccount) return
        if (!partId) {
          toast.error(t("attachmentPartIdMissing"))
          return
        }
        // Prefer the server-signed short URL when the detail payload
        // included one — keeps the network request short and the URL
        // copy-pasteable. Fall back to the long auth URL if the secret
        // wasn't configured.
        const shortUrl = detail?.attachments?.find(
          (a) => a.partId === partId,
        )?.shortUrl
        try {
          let downloadUrl: string
          if (shortUrl) {
            downloadUrl = shortUrl
          } else {
            const p = new URLSearchParams()
            p.set("mailbox", selectedAccount)
            const f = resolveFolder(selectedFolder)
            if (f) p.set("folder", f)
            downloadUrl = `${inboxApi}/${uid}/attachments/${encodeURIComponent(partId)}/download?${p.toString()}`
          }
          const res = await fetch(downloadUrl)
          if (!res.ok) throw new Error("Download failed")
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement("a")
          a.href = url
          a.download = filename
          document.body.appendChild(a)
          a.click()
          setTimeout(() => {
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
          }, 100)
        } catch (err: unknown) {
          toast.error(
            err instanceof Error ? err.message : "Download failed",
          )
        }
      }}
      onPreviewAttachment={(uid, attachments, initialPartId) => {
        if (!selectedAccount) return
        const params = new URLSearchParams()
        params.set("mailbox", selectedAccount)
        const f = resolveFolder(selectedFolder)
        if (f) params.set("folder", f)
        const qs = params.toString()
        // Tüm attachment'ları items'a dönüştür — lightbox arrows ile
        // arasında geçiş yapar.
        // Drop attachments without a usable partId — better to show a
        // shorter list than to feed the lightbox a URL that 404s. Prefer
        // the signed short URL so the lightbox renders `<img src="/a/…">`
        // instead of a long auth-bearing path.
        const items: FilePreviewItem[] = attachments
          .filter((att: MessageAttachment) => Boolean(att.partId))
          .map((att: MessageAttachment) => ({
            id: att.partId,
            url:
              att.shortUrl ??
              `${inboxApi}/${uid}/attachments/${encodeURIComponent(att.partId)}/download?${qs}`,
            name: att.filename,
            mimeType: att.contentType,
            size: att.size,
          }))
        if (items.length === 0) {
          toast.error(t("attachmentPartIdMissing"))
          return
        }
        const idx = Math.max(
          0,
          attachments.findIndex(
            (a: MessageAttachment) => a.partId === initialPartId,
          ),
        )
        setLightboxItems(items)
        setLightboxIndex(idx)
        setLightboxOpen(true)
      }}
      onBack={() => setMobileView("messages")}
    />
  ) : (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-muted-foreground">
        {t("noMessageSelected")}
      </p>
    </div>
  )

  return (
    <PageTransition className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        {/* Static "Compose" butonu kaldırıldı — global FloatingComposeButton
         *  bu işlevi her sayfadan magnetik widget olarak sunuyor. Reply /
         *  Forward / "compose to address" akışları openCompose'u dahili
         *  olarak çağırmaya devam eder. */}
      </div>

      {/* Desktop: resizable 3-pane */}
      <div className="hidden flex-1 overflow-hidden rounded-xl border lg:flex">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize="20%" minSize="15%" maxSize="28%">
            {sidebarPane}
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize="30%" minSize="20%" maxSize="45%">
            {messagesPane}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="50%">{detailPane}</ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Mobile: stacked single-pane navigation */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border lg:hidden">
        {mobileView === "folders" && sidebarPane}
        {mobileView === "messages" && messagesPane}
        {mobileView === "detail" && detailPane}
      </div>

      {/* Controlled compose sheet — Reply/Forward/New cagrilari uzerinden */}
      <ComposeSheet
        slug={slug}
        open={composeOpen}
        onOpenChange={setComposeOpen}
        defaults={composeDefaults}
      />

      {/* Attachment preview lightbox — onPreviewAttachment tetikledi */}
      <FilePreviewLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        items={lightboxItems}
        initialIndex={lightboxIndex}
      />
    </PageTransition>
  )
}

/**
 * Mesaj listesi başlığında engellenen gönderici sayısını badge ile gösterir;
 * tıklanınca her satırda email + X butonu ile unblock akışı sunan kompakt
 * popover. Kullanıcının "yanlış blockladım" senaryosunu kurtarır.
 */
function BlockedSendersPopover({
  blocks,
  onUnblock,
  t,
}: {
  blocks: Array<{ id: string; blockedEmail: string; mailbox: string | null }>
  onUnblock: (email: string) => void
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("blockedSenders")}
            title={t("blockedSenders")}
            className="relative"
          >
            <HugeiconsIcon icon={ShieldBanIcon} strokeWidth={2} />
            <span className="absolute -top-1 -right-1 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full border-2 border-background bg-amber-500 px-1 text-[9px] font-semibold leading-none text-background">
              {blocks.length > 9 ? "9+" : blocks.length}
            </span>
          </Button>
        }
      />
      <PopoverContent align="end" className="w-[280px] p-2">
        <div className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("blockedSendersList", { count: blocks.length })}
        </div>
        <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
          {blocks.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
            >
              <span className="min-w-0 flex-1 truncate text-xs">
                {b.blockedEmail}
              </span>
              {b.mailbox === null && (
                <Badge variant="outline" className="h-4 px-1 text-[9px]">
                  {t("blockedAllMailboxes")}
                </Badge>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-6"
                onClick={() => onUnblock(b.blockedEmail)}
                title={t("unblock")}
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  strokeWidth={2}
                  className="size-3.5"
                />
              </Button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
