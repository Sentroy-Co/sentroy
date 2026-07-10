"use client"

import { useRef, useEffect, useMemo, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { format, formatDistanceToNow } from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete02Icon,
  Mail01Icon,
  ArrowMoveDownRightIcon,
  StarIcon,
  SpamIcon,
  ArrowLeft01Icon,
  ArrowDown01Icon,
  ArrowTurnBackwardIcon as MailReply01Icon,
  MailReplyAll01Icon,
  ArrowTurnForwardIcon as ArrowRight02Icon,
  MoreHorizontalIcon,
  SourceCodeIcon,
  Tick02Icon,
  Folder01Icon,
  Moon02Icon,
  Sun03Icon,
  LinkSquare01Icon,
  AiBrain01Icon,
  ShieldBanIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@workspace/ui/components/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { cn } from "@workspace/ui/lib/utils"
import { confirm } from "@workspace/console/stores/confirm"
import { AttachmentList } from "@workspace/ui/components/file-attachment"
import { SenderAvatar } from "@/components/inbox/sender-avatar"
import { useParams } from "next/navigation"
import type { MessageAddress } from "@/components/inbox/message-list-item"
import { MessageAiAssistant } from "@/components/inbox/message-ai-assistant"
import type { ComposeDefaults } from "@/components/inbox/compose-sheet"

export interface MoveFolder {
  path: string
  name: string
  specialUse: string | null
}

export interface MessageDetail {
  uid: string
  from: MessageAddress
  to: MessageAddress[]
  cc?: MessageAddress[]
  replyTo?: MessageAddress[]
  subject: string
  date: string
  html?: string
  text?: string
  flagged?: boolean
  attachments?: Attachment[]
  /** RFC 5322 Message-ID — thread bagi icin */
  messageId?: string | null
  /** Yanit verilen mesajin Message-ID'si */
  inReplyTo?: string | null
  /** Thread'deki onceki Message-ID'lerin tam zinciri */
  references?: string[]
  /** Mesajin geldigi IMAP klasoru (thread endpoint'inden) */
  folder?: string
  /** List-Unsubscribe header'i — varsa kullanici abonelikten cikabilir */
  listUnsubscribe?: string | null
  /** RFC 8058 List-Unsubscribe-Post header'i — varsa one-click POST yapilabilir */
  listUnsubscribePost?: string | null
  /** Mesaj header'lari (raw) */
  headers?: Record<string, string>
}

export interface Attachment {
  partId: string
  filename: string
  contentType: string
  size: number
  /** Server-signed `/a/<token>` URL. Short, public-safe, expires after
   *  ~1 hour. Used by previews and download buttons; the long URL
   *  remains as a fallback when this is empty. */
  shortUrl?: string
}

interface MessageDetailProps {
  message: MessageDetail
  /** Thread'teki tum mesajlar — kronolojik (eskiden yeniye). Varsa thread gorunumu render edilir. */
  threadMessages?: MessageDetail[]
  /** Su an acik olan sirket mailbox'i — "Siz" gorunumunu tetikler */
  currentMailbox?: string | null
  currentFolder?: string
  availableFolders?: MoveFolder[]
  onDelete?: () => void
  /** Thread içinden tek bir mesajı silmek — wrapper'ın "tüm thread'i sil"
   *  davranışından ayrı tutulur. Verilmezse tek-mesaj silme menüde
   *  görünmez (fallback: onDelete tüm thread'i siler). */
  onDeleteMessage?: (uid: string) => void
  onMarkUnread: () => void
  onToggleFlag?: () => void
  onMoveToSpam?: () => void
  onMove: (to: string) => void
  /** Reply/Forward compose tetikleyicileri — en son mesaj icin */
  onReply?: () => void
  onReplyAll?: () => void
  onForward?: () => void
  /** Thread ici mesaj bazli reply/forward — belirli bir mesaja yanit/ilet */
  onReplyToMessage?: (msg: MessageDetail) => void
  onForwardMessage?: (msg: MessageDetail) => void
  /** Adrese tikladiginda yeni compose baslatir */
  onStartComposeTo?: (address: string) => void
  /** AI reply çıktısını compose'a aktarmak için — defaults objesi geçer. */
  onStartComposeFromAi?: (defaults: ComposeDefaults) => void
  /** "Block sender" — verilirse dropdown item gösterilir. Adres lowercase. */
  onBlockSender?: (email: string) => void
  /** Tek attachment indirme */
  onDownloadAttachment?: (uid: string, partId: string, filename: string) => void
  /** Attachment onizleme (lightbox) — verilirse kart tiklamasi preview acar,
   *  download icon'u ayri kalir. Caller (inbox-content) lightbox state'ini
   *  yonetir + slug-aware URL'leri uretir. */
  onPreviewAttachment?: (
    uid: string,
    attachments: Attachment[],
    initialPartId: string,
  ) => void
  /** Mobil: mesajlar listesine geri donus */
  onBack?: () => void
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isSelf(addr: MessageAddress, mailbox?: string | null): boolean {
  if (!mailbox) return false
  return addr.address.toLowerCase() === mailbox.toLowerCase()
}

function getInitials(addr: MessageAddress): string {
  const src = addr.name?.trim() || addr.address || "?"
  const parts = src.split(/[\s@.]/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

// ── Sub components ─────────────────────────────────────────────────────────

/** Tek bir adresi gosterir: "Siz <email>" ya da "Name <email>" — tiklanabilir mail linki. */
function AddressChip({
  addr,
  mailbox,
  onClick,
  selfLabel,
}: {
  addr: MessageAddress
  mailbox?: string | null
  onClick?: (address: string) => void
  selfLabel: string
}) {
  const self = isSelf(addr, mailbox)
  const name = self
    ? selfLabel
    : addr.name?.trim() || addr.address.split("@")[0]
  const clickable = !self && onClick && addr.address

  return (
    <span className="inline-flex items-baseline gap-1 text-sm">
      <span className="font-medium">{name}</span>
      {addr.address && (
        <span
          className={cn(
            "text-xs text-muted-foreground",
            clickable && "cursor-pointer hover:text-primary hover:underline",
          )}
          role={clickable ? "button" : undefined}
          tabIndex={clickable ? 0 : undefined}
          onClick={
            clickable
              ? (e) => {
                  e.stopPropagation()
                  onClick!(addr.address)
                }
              : undefined
          }
        >
          &lt;{addr.address}&gt;
        </span>
      )}
    </span>
  )
}

/** Detayli header popover icerigi — gmail tarzi key/value grid. */
function HeaderDetails({
  message,
  mailbox,
  onAddressClick,
}: {
  message: MessageDetail
  mailbox?: string | null
  onAddressClick?: (address: string) => void
}) {
  const t = useTranslations("inbox")
  const selfLabel = t("selfLabel")

  let fullDate = ""
  try {
    fullDate = format(new Date(message.date), "PPpp")
  } catch {
    fullDate = message.date
  }

  type Row = { label: string; addrs?: MessageAddress[]; value?: string }
  const rows: Row[] = [
    { label: t("from"), addrs: [message.from] },
  ]
  if (message.replyTo && message.replyTo.length > 0) {
    rows.push({ label: t("replyTo"), addrs: message.replyTo })
  }
  rows.push({ label: t("to"), addrs: message.to })
  if (message.cc && message.cc.length > 0) {
    rows.push({ label: "Cc", addrs: message.cc })
  }
  rows.push({ label: t("date"), value: fullDate })
  rows.push({ label: t("subject"), value: message.subject || "—" })

  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
      {rows.map((row, i) => (
        <div key={i} className="contents">
          <div className="text-muted-foreground">{row.label}:</div>
          <div className="min-w-0 break-words">
            {row.addrs ? (
              <div className="flex flex-col gap-0.5">
                {row.addrs.map((a, j) => (
                  <AddressChip
                    key={j}
                    addr={a}
                    mailbox={mailbox}
                    onClick={onAddressClick}
                    selfLabel={selfLabel}
                  />
                ))}
              </div>
            ) : (
              <span>{row.value}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function MessageDetailView({
  message,
  threadMessages,
  currentMailbox,
  currentFolder,
  availableFolders = [],
  onReplyToMessage,
  onForwardMessage,
  onDelete,
  onDeleteMessage,
  onMarkUnread,
  onToggleFlag,
  onMoveToSpam,
  onMove,
  onReply,
  onReplyAll,
  onForward,
  onStartComposeTo,
  onStartComposeFromAi,
  onBlockSender,
  onDownloadAttachment,
  onPreviewAttachment,
  onBack,
}: MessageDetailProps) {
  const t = useTranslations("inbox")
  const params = useParams<{ "company-slug": string }>()
  const slug = params?.["company-slug"] ?? ""
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [showRawHtml, setShowRawHtml] = useState(false)
  const [copiedHtml, setCopiedHtml] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  // Tracker / external image koruma — default kapalı, kullanıcı banner'dan açar.
  // Mesaj değiştiğinde sıfırlanır ki yeni mailde tracker tekrar engellensin.
  // Thread görünümünde her mesajın blocked sayısı uid bazlı tutulur, banner
  // toplamı gösterir; "Görüntüleri yükle" tüm thread'i etkiler.
  const [loadImages, setLoadImages] = useState(false)
  const [blockedAssets, setBlockedAssets] = useState(0)
  const [threadBlocked, setThreadBlocked] = useState<Record<string, number>>({})
  useEffect(() => {
    setLoadImages(false)
    setBlockedAssets(0)
    setThreadBlocked({})
  }, [message.uid])
  const handleThreadBlockedChange = useCallback(
    (uid: string, count: number) => {
      setThreadBlocked((prev) =>
        prev[uid] === count ? prev : { ...prev, [uid]: count },
      )
    },
    [],
  )

  // Dark mode: sistem temasini oku, kullanici toggle ile ters cevirebilir
  const [systemDark, setSystemDark] = useState(false)
  const [darkOverride, setDarkOverride] = useState<boolean | null>(null)
  const isDark = darkOverride !== null ? darkOverride : systemDark

  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    setSystemDark(mq.matches)
    // Ayrıca html class'a da bakalım (tema manual set edilmis olabilir)
    const html = document.documentElement
    if (html.classList.contains("dark")) setSystemDark(true)
    else if (html.classList.contains("light")) setSystemDark(false)
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener("change", handler)
    // MutationObserver — html class degisimlerini izle
    const obs = new MutationObserver(() => {
      if (html.classList.contains("dark")) setSystemDark(true)
      else setSystemDark(false)
    })
    obs.observe(html, { attributes: true, attributeFilter: ["class"] })
    return () => {
      mq.removeEventListener("change", handler)
      obs.disconnect()
    }
  }, [])

  // Iframe auto-resize listener
  useEffect(() => {
    function handler(e: MessageEvent) {
      if (e.data?.type !== "sentroy:iframe-resize") return
      const height = e.data.height as number
      if (!height || height < 50) return
      // iframeRef veya thread icindeki herhangi bir iframe
      const iframes = document.querySelectorAll<HTMLIFrameElement>(
        'iframe[title="Email content"]',
      )
      for (const iframe of iframes) {
        try {
          const iframeH = iframe.contentDocument?.documentElement?.scrollHeight
          if (iframeH && Math.abs(iframeH - height) < 5) {
            iframe.style.height = `${height + 16}px`
          }
        } catch {}
      }
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [])

  // List-Unsubscribe parse — RFC 2369 angle-bracket list. We prefer the
  // https:// variant when both http(s) and mailto: are present so the
  // one-click flow can run server-side (mailto opens the user's mail
  // client and is kept as a fallback).
  const unsubscribeUrl = useMemo(() => {
    const raw =
      message.listUnsubscribe ||
      message.headers?.["list-unsubscribe"] ||
      message.headers?.["List-Unsubscribe"] ||
      ""
    if (!raw) return null
    const urlMatch = raw.match(/<(https?:\/\/[^>]+)>/)
    if (urlMatch) return urlMatch[1]
    const mailtoMatch = raw.match(/<(mailto:[^>]+)>/)
    if (mailtoMatch) return mailtoMatch[1]
    return null
  }, [message.listUnsubscribe, message.headers])

  // RFC 8058 one-click capability — sender opted-in by sending the
  // `List-Unsubscribe-Post: List-Unsubscribe=One-Click` header alongside
  // an https URL. With both signals we can POST server-side instead of
  // opening a new tab.
  const oneClickUrl = useMemo(() => {
    if (!unsubscribeUrl?.startsWith("https://")) return null
    const post =
      message.listUnsubscribePost ||
      message.headers?.["list-unsubscribe-post"] ||
      message.headers?.["List-Unsubscribe-Post"] ||
      ""
    if (!/list-unsubscribe\s*=\s*one-click/i.test(post)) return null
    return unsubscribeUrl
  }, [unsubscribeUrl, message.listUnsubscribePost, message.headers])

  const [unsubscribing, setUnsubscribing] = useState(false)

  // Tasıma hedefleri — Sent/Drafts ve mevcut klasör gizlenir. `\\All`
  // (Gmail-style "all mail" virtual folder) ve dashboard'un kendi
  // virtual category path'leri (__ALL__, __CAT_*) move target değil:
  // mail-server tarafında bunlara IMAP COPY/MOVE atılamaz, ya da
  // anlamlı bir "tasi" hedefi degil.
  const systemExcluded = new Set(["\\Sent", "\\Drafts", "\\All"])
  const moveTargets = availableFolders.filter(
    (f) =>
      f.path !== currentFolder &&
      f.path !== "__ALL__" &&
      !f.path.startsWith("__CAT_") &&
      !(f.specialUse && systemExcluded.has(f.specialUse)),
  )

  const relativeDate = useMemo(() => {
    try {
      return formatDistanceToNow(new Date(message.date), { addSuffix: true })
    } catch {
      return message.date
    }
  }, [message.date])

  const fullDate = useMemo(() => {
    try {
      return format(new Date(message.date), "PPpp")
    } catch {
      return message.date
    }
  }, [message.date])

  // Recipients preview satiri — "Alici: Siz, a@b.com +2"
  const recipientsSummary = useMemo(() => {
    const selfLabel = t("selfLabel")
    const names = message.to.map((a) => {
      if (isSelf(a, currentMailbox)) return selfLabel
      return a.name?.trim() || a.address.split("@")[0]
    })
    if (names.length === 0) return ""
    if (names.length <= 2) return names.join(", ")
    return `${names.slice(0, 2).join(", ")} +${names.length - 2}`
  }, [message.to, currentMailbox, t])

  // Thread: birden fazla mesaj varsa collapsible gorunum
  const hasThread = threadMessages && threadMessages.length > 1

  // External link confirm listener
  useEffect(() => {
    ensureExternalLinkListener()
  }, [])

  // HTML iframe render — sadece tek mesaj gorunumunde (thread degilse).
  // sanitizer external img/css'leri default engeller; blocked sayısı
  // banner'da gösterilir, "Görüntüleri yükle" tıklanınca loadImages true
  // olur ve effect re-run ile orijinal HTML render edilir.
  useEffect(() => {
    if (hasThread) return
    if (showRawHtml) return
    const iframe = iframeRef.current
    if (!iframe) return
    const result = writeIframe(
      iframe,
      message.html || "",
      message.text || undefined,
      isDark,
      loadImages,
    )
    setBlockedAssets(result.blockedCount)
  }, [hasThread, showRawHtml, message.html, message.text, isDark, loadImages])

  async function copyRawHtml() {
    if (!message.html) return
    await navigator.clipboard.writeText(message.html)
    setCopiedHtml(true)
    setTimeout(() => setCopiedHtml(false), 2000)
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Top action bar ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b px-3 py-2">
        {onBack && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onBack}
            className="lg:hidden"
            aria-label={t("back")}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          </Button>
        )}

        {/* Primary actions */}
        {onToggleFlag && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleFlag}
            className={cn(message.flagged && "text-amber-500")}
            aria-label={message.flagged ? t("unfavorite") : t("favorite")}
            title={message.flagged ? t("unfavorite") : t("favorite")}
          >
            <HugeiconsIcon
              icon={StarIcon}
              strokeWidth={2}
              className={cn(message.flagged && "fill-current")}
            />
          </Button>
        )}
        {onReply && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onReply}
            aria-label={t("reply")}
            title={t("reply")}
          >
            <HugeiconsIcon icon={MailReply01Icon} strokeWidth={2} />
          </Button>
        )}
        {onReplyAll && (message.to.length > 1 || (message.cc && message.cc.length > 0)) && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onReplyAll}
            aria-label={t("replyAll")}
            title={t("replyAll")}
          >
            <HugeiconsIcon icon={MailReplyAll01Icon} strokeWidth={2} />
          </Button>
        )}
        {onForward && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onForward}
            aria-label={t("forward")}
            title={t("forward")}
          >
            <HugeiconsIcon icon={ArrowRight02Icon} strokeWidth={2} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setAiOpen(true)}
          aria-label={t("ai.openTrigger")}
          title={t("ai.openTrigger")}
          className="text-primary"
        >
          <HugeiconsIcon icon={AiBrain01Icon} strokeWidth={2} />
        </Button>

        {/* Secondary actions dropdown */}
        <div className="ms-auto">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("moreActions")}
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onMarkUnread}>
                <HugeiconsIcon
                  icon={Mail01Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("markUnread")}
              </DropdownMenuItem>
              {moveTargets.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <HugeiconsIcon
                      icon={ArrowMoveDownRightIcon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    {t("moveTo")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {moveTargets.map((f) => (
                      <DropdownMenuItem
                        key={f.path}
                        onClick={() => onMove(f.path)}
                      >
                        {f.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {onBlockSender && message.from?.address && (
                <DropdownMenuItem
                  onClick={() =>
                    onBlockSender(message.from.address.toLowerCase())
                  }
                >
                  <HugeiconsIcon
                    icon={ShieldBanIcon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  {/* Two-line layout — long sender addresses (e.g.
                      noreply+abc123@statuspage.io) used to wrap into
                      a multi-line menu item that pushed the icon out
                      of alignment. Splitting label + address into a
                      stacked column with truncate keeps every row at
                      a consistent height. */}
                  <div className="flex min-w-0 flex-col items-start">
                    <span>{t("blockSender")}</span>
                    <span
                      className="max-w-[14rem] truncate text-[10.5px] text-muted-foreground"
                      title={message.from.address}
                    >
                      {message.from.address}
                    </span>
                  </div>
                </DropdownMenuItem>
              )}
              {onMoveToSpam && (
                <DropdownMenuItem onClick={onMoveToSpam}>
                  <HugeiconsIcon
                    icon={SpamIcon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  {t("moveToSpam")}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowRawHtml((v) => !v)}
                disabled={!message.html}
              >
                <HugeiconsIcon
                  icon={SourceCodeIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {showRawHtml ? t("viewRendered") : t("viewHtmlSource")}
              </DropdownMenuItem>
              {showRawHtml && message.html && (
                <DropdownMenuItem onClick={copyRawHtml}>
                  <HugeiconsIcon
                    icon={copiedHtml ? Tick02Icon : SourceCodeIcon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  {copiedHtml ? t("copied") : t("copyHtml")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() =>
                  setDarkOverride((prev) =>
                    prev === null ? !systemDark : !prev,
                  )
                }
              >
                <HugeiconsIcon
                  icon={isDark ? Sun03Icon : Moon02Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {isDark ? t("lightMode") : t("darkMode")}
              </DropdownMenuItem>
              {message.from?.address ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <HugeiconsIcon
                        icon={UserGroupIcon}
                        strokeWidth={2}
                        data-icon="inline-start"
                      />
                      {/* Same two-line trick as the block-sender row —
                          collapses long addresses with truncate so the
                          submenu trigger stays a single row tall. */}
                      <div className="flex min-w-0 flex-col items-start">
                        <span>{t("ruleAlwaysCategorize")}</span>
                        <span
                          className="max-w-[14rem] truncate text-[10.5px] text-muted-foreground"
                          title={message.from.address}
                        >
                          {message.from.address}
                        </span>
                      </div>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {(
                        [
                          "promotions",
                          "updates",
                          "receipts",
                          "social",
                          "primary",
                        ] as const
                      ).map((cat) => (
                        <DropdownMenuItem
                          key={cat}
                          onClick={async () => {
                            if (!params?.["company-slug"] || !currentMailbox) return
                            try {
                              const res = await fetch(
                                `/api/companies/${params["company-slug"]}/inbox/rules`,
                                {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    mailbox: currentMailbox,
                                    sender: message.from.address,
                                    kind: "category",
                                    category: cat,
                                  }),
                                },
                              )
                              const json = await res.json()
                              if (!res.ok) {
                                throw new Error(json.error || "Failed")
                              }
                              const updated =
                                (json.data as { updated?: number })?.updated ?? 0
                              toast.success(
                                t("ruleAdded", {
                                  category: t(`ruleCategory_${cat}`),
                                  count: updated,
                                }),
                              )
                            } catch (err) {
                              toast.error(
                                err instanceof Error ? err.message : t("ruleFailed"),
                              )
                            }
                          }}
                        >
                          {t(`ruleCategory_${cat}`)}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
              ) : null}
              {unsubscribeUrl && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={unsubscribing}
                    onClick={async () => {
                      const ok = await confirm({
                        title: t("unsubscribeTitle"),
                        description: oneClickUrl
                          ? t("unsubscribeOneClickDesc")
                          : t("unsubscribeDesc"),
                        confirmText: t("unsubscribe"),
                      })
                      if (!ok) return

                      // RFC 8058 path — POST through our proxy. CORS +
                      // mixed-content concerns make a direct browser POST
                      // unreliable; the server-side route mirrors the
                      // canonical "List-Unsubscribe=One-Click" body.
                      if (oneClickUrl && params?.["company-slug"]) {
                        setUnsubscribing(true)
                        try {
                          const res = await fetch(
                            `/api/companies/${params["company-slug"]}/inbox/${encodeURIComponent(message.uid)}/unsubscribe`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                url: oneClickUrl,
                                mailbox: currentMailbox ?? undefined,
                              }),
                            },
                          )
                          const json = await res.json()
                          const data = json.data as {
                            ok: boolean
                            status: number
                            error?: string
                          } | null
                          if (!res.ok || !data) {
                            throw new Error(json.error || "Failed")
                          }
                          if (data.ok) {
                            toast.success(t("unsubscribeSuccess"))
                          } else {
                            toast.error(
                              data.error
                                ? t("unsubscribeFailedDetail", {
                                    detail: data.error,
                                  })
                                : t("unsubscribeFailed"),
                            )
                          }
                        } catch (err) {
                          toast.error(
                            err instanceof Error
                              ? err.message
                              : t("unsubscribeFailed"),
                          )
                        } finally {
                          setUnsubscribing(false)
                        }
                        return
                      }

                      // Fallback — sender didn't opt in to one-click,
                      // or the URL is mailto:. Open in a new tab / hand
                      // to the user's mail client like before.
                      if (unsubscribeUrl.startsWith("mailto:")) {
                        window.location.href = unsubscribeUrl
                      } else {
                        window.open(
                          unsubscribeUrl,
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                    }}
                  >
                    <HugeiconsIcon
                      icon={LinkSquare01Icon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    {t("unsubscribe")}
                    {oneClickUrl ? (
                      <span className="ml-auto rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        1-click
                      </span>
                    ) : null}
                  </DropdownMenuItem>
                </>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onDelete}
                    className="text-destructive"
                  >
                    <HugeiconsIcon
                      icon={Delete02Icon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    {t("delete")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 p-4 sm:p-5">
          {/* Subject */}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold sm:text-2xl">
              {message.subject || t("noSubject")}
            </h1>
            {currentFolder === "__ALL__" && message.folder && (
              <Badge
                variant="outline"
                className="h-5 gap-1 px-1.5 text-[11px] font-normal text-muted-foreground"
              >
                <HugeiconsIcon
                  icon={Folder01Icon}
                  strokeWidth={2}
                  className="size-3"
                />
                {message.folder}
              </Badge>
            )}
          </div>

          {/* List-Unsubscribe banner — hostname/email görünür şekilde inline */}
          {unsubscribeUrl && (
            <UnsubscribeBanner url={unsubscribeUrl} t={t} />
          )}

          {/* Tracker / external content blocked banner — single + thread */}
          {(() => {
            const total = hasThread
              ? Object.values(threadBlocked).reduce((a, b) => a + b, 0)
              : blockedAssets
            if (total === 0 || loadImages) return null
            return (
              <TrackerBanner
                count={total}
                onLoad={() => setLoadImages(true)}
                t={t}
              />
            )
          })()}

          {/* Thread: birden fazla mesaj varsa hepsini collapsible goster */}
          {hasThread ? (
            <div className="flex flex-col gap-2">
              {threadMessages!.map((msg, idx) => {
                const isLast = idx === threadMessages!.length - 1
                return (
                  <ThreadMessageSection
                    key={msg.uid}
                    msg={msg}
                    currentMailbox={currentMailbox}
                    currentFolder={currentFolder}
                    onStartComposeTo={onStartComposeTo}
                    defaultOpen={isLast}
                    showRawHtml={showRawHtml && isLast}
                    dark={isDark}
                    loadImages={loadImages}
                    onBlockedAssetsChange={handleThreadBlockedChange}
                    actions={{
                      onReply: onReplyToMessage
                        ? (m) => onReplyToMessage(m)
                        : undefined,
                      onForward: onForwardMessage
                        ? (m) => onForwardMessage(m)
                        : undefined,
                      onToggleFlag: onToggleFlag
                        ? () => onToggleFlag()
                        : undefined,
                      onMarkUnread: onMarkUnread
                        ? () => onMarkUnread()
                        : undefined,
                      // Thread içinden tek bir mesaj silinince yalnızca o uid
                      // hedeflenir. Wrapper'ın "tüm thread" silme davranışı
                      // wrapper menüsünde kalmaya devam eder.
                      onDelete: onDeleteMessage
                        ? (m) => onDeleteMessage(m.uid)
                        : onDelete
                          ? () => onDelete()
                          : undefined,
                      onDownloadAttachment,
                      onPreviewAttachment,
                      isTrash:
                        currentFolder?.toLowerCase() === "trash",
                      onMove,
                      onMoveToSpam,
                      onBlockSender,
                      onAlwaysCategorize: async (sender, cat) => {
                        if (!slug || !currentMailbox) return
                        try {
                          const res = await fetch(
                            `/api/companies/${slug}/inbox/rules`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                mailbox: currentMailbox,
                                sender,
                                kind: "category",
                                category: cat,
                              }),
                            },
                          )
                          const json = await res.json()
                          if (!res.ok) {
                            throw new Error(json.error || "Failed")
                          }
                          const updated =
                            (json.data as { updated?: number })?.updated ?? 0
                          toast.success(
                            t("ruleAdded", {
                              category: t(`ruleCategory_${cat}`),
                              count: updated,
                            }),
                          )
                        } catch (err) {
                          toast.error(
                            err instanceof Error ? err.message : t("ruleFailed"),
                          )
                        }
                      },
                      moveTargets,
                    }}
                  />
                )
              })}
            </div>
          ) : (
            /* Tek mesaj — mevcut tasarim */
            <SingleMessageContent
              msg={message}
              currentMailbox={currentMailbox}
              onStartComposeTo={onStartComposeTo}
              showRawHtml={showRawHtml}
              iframeRef={iframeRef}
              recipientsSummary={recipientsSummary}
              relativeDate={relativeDate}
              fullDate={fullDate}
              onDownloadAttachment={onDownloadAttachment}
              onPreviewAttachment={onPreviewAttachment}
            />
          )}
        </div>
      </ScrollArea>
      <MessageAiAssistant
        open={aiOpen}
        onOpenChange={setAiOpen}
        slug={slug}
        subject={message.subject}
        bodyHtml={message.html || message.text || ""}
        bodyText={
          message.text ||
          (message.html
            ? message.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
            : "")
        }
        senderLabel={
          message.from.name
            ? `${message.from.name} <${message.from.address}>`
            : message.from.address
        }
        replyToAddress={
          message.replyTo?.[0]?.address ?? message.from.address
        }
        senderName={currentMailbox || undefined}
        onStartCompose={onStartComposeFromAi}
      />
    </div>
  )
}

// ── Iframe injection: blockquote collapse + external link confirm ────────

/** Iframe icine enjekte edilen JS — blockquote'lari collapsible yapar, dis linkleri yakalar. */
const IFRAME_INJECT_SCRIPT = `
<script>
(function(){
  // ── Blockquote collapse ──
  document.querySelectorAll('blockquote').forEach(function(bq){
    bq.style.display='none';
    var btn=document.createElement('button');
    btn.textContent='···';
    btn.style.cssText='display:inline-block;border:1px solid #ccc;background:#f5f5f5;color:#888;border-radius:4px;padding:1px 8px;font-size:12px;cursor:pointer;margin:4px 0';
    btn.onclick=function(){
      var v=bq.style.display==='none';
      bq.style.display=v?'':'none';
      btn.textContent=v?'▲':'···';
    };
    bq.parentNode.insertBefore(btn,bq);
  });

  // ── External link confirm ──
  document.addEventListener('click',function(e){
    var a=e.target.closest('a[href]');
    if(!a)return;
    var href=a.getAttribute('href');
    if(!href||href.startsWith('#')||href.startsWith('mailto:'))return;
    e.preventDefault();
    e.stopPropagation();
    window.parent.postMessage({type:'sentroy:external-link',href:href},'*');
  },true);
})();
</script>`

function buildIframeStyles(dark: boolean): string {
  const textColor = dark ? '#e5e5e5' : '#1a1a1a'
  const bgColor = dark ? '#0a0a0a' : '#ffffff'
  const linkColor = dark ? '#60a5fa' : '#2563eb'

  return `
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.6;color:${textColor};background:${bgColor};margin:0;padding:16px;word-wrap:break-word;overflow-wrap:break-word}
    img{max-width:100%;height:auto}
    a{color:${linkColor}}
    pre{white-space:pre-wrap}
  `
}

/** Iframe auto-resize script — icerik boyutuna gore iframe yuksekligi ayarlanir */
const IFRAME_RESIZE_SCRIPT = `
<script>
(function(){
  function resize(){
    var h=document.documentElement.scrollHeight;
    window.parent.postMessage({type:'sentroy:iframe-resize',height:h},'*');
  }
  resize();
  new MutationObserver(resize).observe(document.body,{childList:true,subtree:true,attributes:true});
  window.addEventListener('load',resize);
  setTimeout(resize,500);
})();
</script>`

/**
 * Remote image / tracking pixel sanitizer. Default davranış: tüm dış
 * `<img>`, `<source>`, `<link rel="preload|prefetch">` ve external CSS
 * referansları engellenir; orijinal URL'ler `data-blocked-src` içinde
 * tutulur ki "Görüntüleri yükle" tıklandığında geri yüklenebilsin.
 *
 * `data:` URI'leri (inline base64 image) engellenmez — zaten dış istek
 * yapmıyorlar. Sayaç caller'a döner ve kullanıcıya "X içerik engellendi"
 * banner'ında gösterilir.
 *
 * Bu, Apple Mail Privacy Protection / Gmail "Ask before displaying
 * external images" davranışıyla aynı çizgide. Tracker pixel'lerin
 * çoğunu (Mailchimp open-tracking, beacons, vb.) etkili biçimde durdurur.
 */
function sanitizeRemoteAssets(
  html: string,
  loadImages: boolean,
): { html: string; blockedCount: number } {
  if (loadImages) return { html, blockedCount: 0 }
  if (typeof DOMParser === "undefined") return { html, blockedCount: 0 }
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(html, "text/html")
  } catch {
    return { html, blockedCount: 0 }
  }
  let blocked = 0
  doc.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src")
    if (!src) return
    if (src.startsWith("data:") || src.startsWith("cid:")) return
    img.setAttribute("data-blocked-src", src)
    img.removeAttribute("src")
    blocked++
  })
  doc.querySelectorAll("source[srcset], img[srcset]").forEach((el) => {
    const ss = el.getAttribute("srcset")
    if (ss && !ss.startsWith("data:")) {
      el.setAttribute("data-blocked-srcset", ss)
      el.removeAttribute("srcset")
    }
  })
  doc
    .querySelectorAll("link[rel=preload], link[rel=prefetch], link[rel=stylesheet]")
    .forEach((el) => el.remove())
  return {
    html: doc.body.innerHTML,
    blockedCount: blocked,
  }
}

interface WriteIframeResult {
  blockedCount: number
}

function writeIframe(
  iframe: HTMLIFrameElement,
  html: string,
  text?: string,
  dark = false,
  loadImages = false,
): WriteIframeResult {
  const doc = iframe.contentDocument
  if (!doc) return { blockedCount: 0 }
  const sanitized = html
    ? sanitizeRemoteAssets(html, loadImages)
    : { html: `<pre>${text || ""}</pre>`, blockedCount: 0 }
  const styles = buildIframeStyles(dark)
  doc.open()
  doc.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>${styles}</style></head><body>${sanitized.html}${IFRAME_INJECT_SCRIPT}${IFRAME_RESIZE_SCRIPT}</body></html>`,
  )
  doc.close()
  return { blockedCount: sanitized.blockedCount }
}

// ── External link confirm listener (window-level, tek sefer) ────────────

/** Uzun URL'leri kisaltir — ortasindan keser. */
function truncateUrl(url: string, max = 80): string {
  if (url.length <= max) return url
  try {
    const u = new URL(url)
    const host = u.host
    const rest = u.pathname + u.search + u.hash
    if (rest.length > max - host.length - 10) {
      return `${host}${rest.slice(0, 30)}…${rest.slice(-15)}`
    }
    return url.slice(0, max - 1) + "…"
  } catch {
    return url.slice(0, max - 1) + "…"
  }
}

// Tek bir named listener — referansı korunur, duplicate eklenmez.
// Module-level closure kapanisi global olarak GC'ye uygundur.
async function handleExternalLinkMessage(e: MessageEvent) {
  if (e.data?.type !== "sentroy:external-link") return
  const href = e.data.href as string
  if (!href) return

  const ok = await confirm({
    title: "External Link",
    description: truncateUrl(href),
    confirmText: "Continue",
  })
  if (ok) window.open(href, "_blank", "noopener,noreferrer")
}

let externalLinkListenerAttached = false

function ensureExternalLinkListener() {
  if (typeof window === "undefined") return
  if (externalLinkListenerAttached) return
  externalLinkListenerAttached = true
  window.addEventListener("message", handleExternalLinkMessage)
}

// ── Inline banners: unsubscribe + tracker block ────────────────────────────

function UnsubscribeBanner({
  url,
  t,
}: {
  url: string
  t: ReturnType<typeof useTranslations>
}) {
  const isMailto = url.startsWith("mailto:")
  const targetLabel = (() => {
    if (isMailto) return url.replace(/^mailto:/, "").split("?")[0]
    try {
      return new URL(url).host
    } catch {
      return url
    }
  })()

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
      <HugeiconsIcon
        icon={LinkSquare01Icon}
        strokeWidth={2}
        className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
      />
      <span className="text-xs text-muted-foreground">
        {t("unsubscribeHint")}
      </span>
      <a
        href={url}
        target={isMailto ? undefined : "_blank"}
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 truncate rounded-md border border-amber-500/30 bg-background px-1.5 py-0.5 text-[11px] font-mono text-foreground/80 hover:border-amber-500/60 hover:text-foreground"
        title={url}
        onClick={(e) => {
          e.preventDefault()
          // Tek tıkla URL'i kopyala — yanlış tıklamalardan korunma.
          navigator.clipboard.writeText(url).catch(() => {})
        }}
      >
        {targetLabel}
      </a>
      <Button
        variant="outline"
        size="sm"
        className="ms-auto h-6 text-xs"
        onClick={async () => {
          const ok = await confirm({
            title: t("unsubscribeTitle"),
            description: t("unsubscribeDescWithTarget", { target: targetLabel }),
            confirmText: t("unsubscribe"),
          })
          if (!ok) return
          if (isMailto) {
            window.location.href = url
          } else {
            window.open(url, "_blank", "noopener,noreferrer")
          }
        }}
      >
        {t("unsubscribe")}
      </Button>
    </div>
  )
}

function TrackerBanner({
  count,
  onLoad,
  t,
}: {
  count: number
  onLoad: () => void
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
        <HugeiconsIcon
          icon={ShieldBanIcon}
          strokeWidth={2}
          className="size-3"
        />
      </span>
      <span className="flex-1 text-xs">
        <span className="font-medium text-emerald-700 dark:text-emerald-300">
          {t("trackerBlocked", { count })}
        </span>
        <span className="ms-1.5 text-muted-foreground">
          {t("trackerHint")}
        </span>
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-xs text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
        onClick={onLoad}
      >
        {t("loadImages")}
      </Button>
    </div>
  )
}

// ── Thread message section (collapsible) ──────────────────────────────────

interface ThreadSectionActions {
  onReply?: (msg: MessageDetail) => void
  onForward?: (msg: MessageDetail) => void
  onDelete?: (msg: MessageDetail) => void
  onMarkUnread?: (msg: MessageDetail) => void
  onToggleFlag?: (msg: MessageDetail) => void
  onDownloadAttachment?: (uid: string, partId: string, filename: string) => void
  onPreviewAttachment?: (
    uid: string,
    attachments: Attachment[],
    initialPartId: string,
  ) => void
  /** Trash klasorundeyse silme gosterilmez */
  isTrash?: boolean
  /** Move to a specific folder. When omitted (or moveTargets empty),
   *  the submenu is hidden. */
  onMove?: (to: string) => void
  /** Spam'e tasi — outgoing/spam/trash klasorlerinde verilmez. */
  onMoveToSpam?: () => void
  /** Bu gondericiyi engelle. Adres lowercase. */
  onBlockSender?: (email: string) => void
  /** Bu gondericiyi her zaman bu kategoriye yerlestir kurali. */
  onAlwaysCategorize?: (sender: string, cat: string) => void
  /** Move-to submenu'sunda gosterilecek hedef klasorler.
   *  Mevcut klasor disinda olmali. */
  moveTargets?: MoveFolder[]
}

function ThreadMessageSection({
  msg,
  currentMailbox,
  currentFolder,
  onStartComposeTo,
  defaultOpen,
  showRawHtml,
  dark = false,
  actions,
  loadImages = false,
  onBlockedAssetsChange,
}: {
  msg: MessageDetail
  currentMailbox?: string | null
  currentFolder?: string
  onStartComposeTo?: (address: string) => void
  defaultOpen?: boolean
  showRawHtml?: boolean
  dark?: boolean
  actions?: ThreadSectionActions
  /** Tüm thread için paylaşılan global flag — banner'dan açılır. */
  loadImages?: boolean
  /** Section iframe'i yazılırken kaç asset bloklandığını üst bileşene bildir. */
  onBlockedAssetsChange?: (uid: string, count: number) => void
}) {
  const t = useTranslations("inbox")
  const selfLabel = t("selfLabel")
  const [open, setOpen] = useState(defaultOpen ?? false)
  const [itemRawHtml, setItemRawHtml] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // showRawHtml prop (ust seviye global) VEYA per-item toggle
  const effectiveRawHtml = showRawHtml || itemRawHtml

  const self = isSelf(msg.from, currentMailbox)
  const senderName = self
    ? selfLabel
    : msg.from.name?.trim() || msg.from.address.split("@")[0]

  let relDate = ""
  let absDate = ""
  try {
    relDate = formatDistanceToNow(new Date(msg.date), { addSuffix: true })
    absDate = format(new Date(msg.date), "PPpp")
  } catch {
    relDate = msg.date
    absDate = msg.date
  }

  // External link confirm listener'i mount
  useEffect(() => {
    ensureExternalLinkListener()
  }, [])

  // Iframe render — blockquote collapse + external link intercept enjekte edilir.
  // Tracker sanitizer her render'da çalışır; loadImages true ise bypass.
  useEffect(() => {
    if (!open || effectiveRawHtml) return
    const iframe = iframeRef.current
    if (!iframe) return
    const result = writeIframe(
      iframe,
      msg.html || "",
      msg.text || undefined,
      dark,
      loadImages,
    )
    onBlockedAssetsChange?.(msg.uid, result.blockedCount)
  }, [
    open,
    msg.html,
    msg.text,
    msg.uid,
    effectiveRawHtml,
    dark,
    loadImages,
    onBlockedAssetsChange,
  ])

  const snippet = useMemo(() => {
    if (!msg.text) return ""
    return msg.text.slice(0, 120).replace(/\s+/g, " ").trim()
  }, [msg.text])

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
          open ? "border-primary/20 bg-primary/5" : "hover:bg-muted/40",
          self && !open && "border-l-2 border-l-primary/40",
        )}
      >
        <SenderAvatar
          email={msg.from?.address || ""}
          name={msg.from?.name}
          initials={getInitials(msg.from)}
          size="md"
          variant="primary"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{senderName}</span>
            {/* Folder badge — sadece All folder'dayken goster */}
            {currentFolder === "__ALL__" && msg.folder && (
              <Badge
                variant="outline"
                className="h-4 gap-0.5 px-1 text-[10px] font-normal text-muted-foreground"
              >
                <HugeiconsIcon
                  icon={Folder01Icon}
                  strokeWidth={2}
                  className="size-2.5"
                />
                {msg.folder}
              </Badge>
            )}
            <span
              className="shrink-0 text-[11px] text-muted-foreground"
              title={absDate}
            >
              {relDate}
            </span>
          </div>
          {!open && snippet && (
            <p className="truncate text-xs text-muted-foreground">{snippet}</p>
          )}
        </div>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          className={cn(
            "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="flex flex-col gap-3 px-3 pb-3 pt-1">
          {/* Header: from/to + per-item dot menu */}
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <AddressChip
                  addr={msg.from}
                  mailbox={currentMailbox}
                  onClick={onStartComposeTo}
                  selfLabel={selfLabel}
                />
                <Popover>
                  <PopoverTrigger
                    render={
                      <button
                        type="button"
                        className="inline-flex items-center gap-0.5 rounded text-xs text-muted-foreground hover:text-foreground"
                      >
                        <HugeiconsIcon
                          icon={ArrowDown01Icon}
                          strokeWidth={2}
                          className="size-3"
                        />
                      </button>
                    }
                  />
                  <PopoverContent
                    align="start"
                    className="w-[min(28rem,calc(100vw-2rem))]"
                  >
                    <HeaderDetails
                      message={msg}
                      mailbox={currentMailbox}
                      onAddressClick={onStartComposeTo}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {t("to")}:{" "}
                {msg.to
                  .map((a) =>
                    isSelf(a, currentMailbox)
                      ? selfLabel
                      : a.name?.trim() || a.address.split("@")[0],
                  )
                  .join(", ")}
              </div>
            </div>

            {/* Per-item dot menu */}
            {actions && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60"
                    >
                      <HugeiconsIcon
                        icon={MoreHorizontalIcon}
                        strokeWidth={2}
                        className="size-4"
                      />
                    </button>
                  }
                />
                <DropdownMenuContent align="end">
                  {actions.onReply && (
                    <DropdownMenuItem onClick={() => actions.onReply!(msg)}>
                      <HugeiconsIcon
                        icon={MailReply01Icon}
                        strokeWidth={2}
                        data-icon="inline-start"
                      />
                      {t("reply")}
                    </DropdownMenuItem>
                  )}
                  {actions.onForward && (
                    <DropdownMenuItem onClick={() => actions.onForward!(msg)}>
                      <HugeiconsIcon
                        icon={ArrowRight02Icon}
                        strokeWidth={2}
                        data-icon="inline-start"
                      />
                      {t("forward")}
                    </DropdownMenuItem>
                  )}
                  {actions.onToggleFlag && (
                    <DropdownMenuItem
                      onClick={() => actions.onToggleFlag!(msg)}
                    >
                      <HugeiconsIcon
                        icon={StarIcon}
                        strokeWidth={2}
                        data-icon="inline-start"
                      />
                      {msg.flagged ? t("unfavorite") : t("favorite")}
                    </DropdownMenuItem>
                  )}
                  {actions.onMarkUnread && (
                    <DropdownMenuItem
                      onClick={() => actions.onMarkUnread!(msg)}
                    >
                      <HugeiconsIcon
                        icon={Mail01Icon}
                        strokeWidth={2}
                        data-icon="inline-start"
                      />
                      {t("markUnread")}
                    </DropdownMenuItem>
                  )}
                  {actions.moveTargets && actions.moveTargets.length > 0 && actions.onMove && (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <HugeiconsIcon
                          icon={ArrowMoveDownRightIcon}
                          strokeWidth={2}
                          data-icon="inline-start"
                        />
                        {t("moveTo")}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {actions.moveTargets.map((f) => (
                          <DropdownMenuItem
                            key={f.path}
                            onClick={() => actions.onMove!(f.path)}
                          >
                            {f.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  )}
                  {actions.onMoveToSpam && (
                    <DropdownMenuItem onClick={() => actions.onMoveToSpam!()}>
                      <HugeiconsIcon
                        icon={SpamIcon}
                        strokeWidth={2}
                        data-icon="inline-start"
                      />
                      {t("moveToSpam")}
                    </DropdownMenuItem>
                  )}
                  {actions.onBlockSender && msg.from?.address && (
                    <DropdownMenuItem
                      onClick={() =>
                        actions.onBlockSender!(msg.from.address.toLowerCase())
                      }
                    >
                      <HugeiconsIcon
                        icon={ShieldBanIcon}
                        strokeWidth={2}
                        data-icon="inline-start"
                      />
                      <div className="flex min-w-0 flex-col items-start">
                        <span>{t("blockSender")}</span>
                        <span
                          className="max-w-[14rem] truncate text-[10.5px] text-muted-foreground"
                          title={msg.from.address}
                        >
                          {msg.from.address}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  )}
                  {actions.onAlwaysCategorize && msg.from?.address && (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <HugeiconsIcon
                          icon={UserGroupIcon}
                          strokeWidth={2}
                          data-icon="inline-start"
                        />
                        <div className="flex min-w-0 flex-col items-start">
                          <span>{t("ruleAlwaysCategorize")}</span>
                          <span
                            className="max-w-[14rem] truncate text-[10.5px] text-muted-foreground"
                            title={msg.from.address}
                          >
                            {msg.from.address}
                          </span>
                        </div>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {(
                          [
                            "promotions",
                            "updates",
                            "receipts",
                            "social",
                            "primary",
                          ] as const
                        ).map((cat) => (
                          <DropdownMenuItem
                            key={cat}
                            onClick={() =>
                              actions.onAlwaysCategorize!(
                                msg.from.address,
                                cat,
                              )
                            }
                          >
                            {t(`ruleCategory_${cat}`)}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setItemRawHtml((v) => !v)}
                    disabled={!msg.html}
                  >
                    <HugeiconsIcon
                      icon={SourceCodeIcon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    {effectiveRawHtml
                      ? t("viewRendered")
                      : t("viewHtmlSource")}
                  </DropdownMenuItem>
                  {actions.onDelete && !actions.isTrash && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => actions.onDelete!(msg)}
                      >
                        <HugeiconsIcon
                          icon={Delete02Icon}
                          strokeWidth={2}
                          data-icon="inline-start"
                        />
                        {t("delete")}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Attachments */}
          {msg.attachments && msg.attachments.length > 0 && (
            <AttachmentList
              attachments={msg.attachments}
              onDownload={
                actions?.onDownloadAttachment
                  ? (partId, filename) =>
                      actions.onDownloadAttachment!(msg.uid, partId, filename)
                  : undefined
              }
              onPreview={
                actions?.onPreviewAttachment
                  ? (partId) =>
                      actions.onPreviewAttachment!(
                        msg.uid,
                        msg.attachments!,
                        partId,
                      )
                  : undefined
              }
              onDownloadAll={
                actions?.onDownloadAttachment
                  ? () => {
                      for (const att of msg.attachments!) {
                        actions.onDownloadAttachment!(
                          msg.uid,
                          att.partId,
                          att.filename,
                        )
                      }
                    }
                  : undefined
              }
            />
          )}

          {/* Body */}
          {effectiveRawHtml ? (
            <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed">
              <code>{msg.html || msg.text || ""}</code>
            </pre>
          ) : (
            <iframe
              ref={iframeRef}
              title="Email content"
              sandbox="allow-same-origin allow-scripts"
              className="w-full border-0"
              style={{ colorScheme: "auto", minHeight: 120 }}
            />
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ── Single message content (thread olmayan durumda) ───────────────────────

function SingleMessageContent({
  msg,
  currentMailbox,
  onStartComposeTo,
  showRawHtml,
  iframeRef,
  recipientsSummary,
  relativeDate,
  fullDate,
  onDownloadAttachment,
  onPreviewAttachment,
}: {
  msg: MessageDetail
  currentMailbox?: string | null
  onStartComposeTo?: (address: string) => void
  showRawHtml: boolean
  iframeRef: React.RefObject<HTMLIFrameElement | null>
  recipientsSummary: string
  relativeDate: string
  fullDate: string
  onDownloadAttachment?: (uid: string, partId: string, filename: string) => void
  onPreviewAttachment?: (
    uid: string,
    attachments: Attachment[],
    initialPartId: string,
  ) => void
}) {
  const t = useTranslations("inbox")

  return (
    <>
      {/* Sender block */}
      <div className="flex items-start gap-3">
        <SenderAvatar
          email={msg.from?.address || ""}
          name={msg.from?.name}
          initials={getInitials(msg.from)}
          size="lg"
          variant="primary"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <AddressChip
              addr={msg.from}
              mailbox={currentMailbox}
              onClick={onStartComposeTo}
              selfLabel={t("selfLabel")}
            />
            <Popover>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 rounded text-xs text-muted-foreground hover:text-foreground"
                  >
                    <HugeiconsIcon
                      icon={ArrowDown01Icon}
                      strokeWidth={2}
                      className="size-3"
                    />
                  </button>
                }
              />
              <PopoverContent
                align="start"
                className="w-[min(28rem,calc(100vw-2rem))]"
              >
                <HeaderDetails
                  message={msg}
                  mailbox={currentMailbox}
                  onAddressClick={onStartComposeTo}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">
              {t("to")}: {recipientsSummary}
            </span>
          </div>
        </div>
        <div
          className="shrink-0 text-xs text-muted-foreground"
          title={fullDate}
        >
          {relativeDate}
        </div>
      </div>

      {/* Attachments */}
      {msg.attachments && msg.attachments.length > 0 && (
        <AttachmentList
          attachments={msg.attachments}
          onDownload={
            onDownloadAttachment
              ? (partId, filename) =>
                  onDownloadAttachment(msg.uid, partId, filename)
              : undefined
          }
          onPreview={
            onPreviewAttachment
              ? (partId) =>
                  onPreviewAttachment(msg.uid, msg.attachments!, partId)
              : undefined
          }
          onDownloadAll={
            onDownloadAttachment
              ? () => {
                  for (const att of msg.attachments!) {
                    onDownloadAttachment(msg.uid, att.partId, att.filename)
                  }
                }
              : undefined
          }
        />
      )}

      {/* Body */}
      {showRawHtml ? (
        <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed">
          <code>{msg.html || msg.text || ""}</code>
        </pre>
      ) : (
        <iframe
          ref={iframeRef}
          title="Email content"
          sandbox="allow-same-origin allow-scripts"
          className="w-full border-0"
          style={{ colorScheme: "auto", minHeight: 200 }}
        />
      )}
    </>
  )
}
