"use client"

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useParams } from "next/navigation"
import { useTranslations, useLocale } from "next-intl"
import { toast } from "sonner"
import { format, isToday, isYesterday, isSameDay } from "date-fns"
import { tr as trLocale, enUS } from "date-fns/locale"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Message01Icon,
  UserIcon,
  UserMultipleIcon,
  PinIcon,
  Archive02Icon,
  Delete02Icon,
  Copy01Icon,
  Logout01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Badge } from "@workspace/ui/components/badge"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@workspace/ui/components/resizable"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@workspace/ui/components/context-menu"
import { FilePreviewLightbox } from "@workspace/ui/components/file-preview-lightbox"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"
import { useCompanyStore } from "@workspace/console/stores/company"
import { useSession } from "@workspace/auth/client/auth-client"
import { confirm } from "@workspace/console/stores/confirm"
import {
  useWhatsappStream,
  type WaContact,
  type WaContactUpdate,
  type WaMessage,
  type WaMessageEvent,
  type WaMediaReady,
  type WaSearchResult,
  type WaSessionInfo,
  type WaStatusUpdate,
  type WaReactionEvent,
  type WaLinkPreview,
  type WaReaction,
} from "./use-whatsapp-events"

// ── Helpers ─────────────────────────────────────────────────────────────────

const MEDIA_KINDS = new Set(["image", "video", "audio", "document", "sticker"])
const AVATAR_COLORS = [
  "#0ea5e9", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981",
  "#ef4444", "#6366f1", "#14b8a6", "#f97316", "#84cc16",
]

function contactDisplayName(c: WaContact): string {
  return (
    c.customName ||
    c.name ||
    c.pushName ||
    c.phone ||
    c.jid.split("@")[0] ||
    c.jid
  )
}

function avatarColor(jid: string): string {
  let h = 0
  for (let i = 0; i < jid.length; i++) h = (h * 31 + jid.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!
}

function formatListTime(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isToday(d)) return format(d, "HH:mm")
  if (isYesterday(d)) return format(d, "dd.MM")
  return format(d, "dd.MM.yy")
}

function statusDot(status: string): string {
  if (status === "connected") return "bg-emerald-500"
  if (status === "qr" || status === "connecting") return "bg-amber-500"
  return "bg-muted-foreground/40"
}

function sortContacts(list: WaContact[]): WaContact[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
    const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
    return bt - at
  })
}

/** WhatsApp tarzı avatar — foto varsa img, yoksa renkli daire + user ikonu. */
function ContactAvatar({
  contact,
  size = "size-9",
}: {
  contact: Pick<WaContact, "jid" | "avatarUrl" | "isGroup">
  size?: string
}) {
  const [errored, setErrored] = useState(false)
  useEffect(() => setErrored(false), [contact.avatarUrl])
  const showImg = contact.avatarUrl && !errored
  return (
    <div className={cn("shrink-0 overflow-hidden rounded-full", size)}>
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={contact.avatarUrl!}
          alt=""
          onError={() => setErrored(true)}
          className="size-full object-cover"
        />
      ) : (
        <div
          className="flex size-full items-center justify-center text-white"
          style={{ background: avatarColor(contact.jid) }}
        >
          <HugeiconsIcon
            icon={contact.isGroup ? UserMultipleIcon : UserIcon}
            strokeWidth={2}
            className="size-1/2"
          />
        </div>
      )}
    </div>
  )
}

/** Grup mesajlarında gönderenin görünen adı (pushName → numara fallback). */
function senderDisplayName(m: WaMessage): string {
  return m.senderName || (m.senderJid ? m.senderJid.split("@")[0]! : "")
}

/** Grup gönderen avatarı — renkli daire + ilk harf (foto fetch yok, ban-safe). */
function SenderAvatar({
  jid,
  name,
  size = "size-7",
}: {
  jid: string
  name: string
  size?: string
}) {
  const letter = (name.trim()[0] || "?").toUpperCase()
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center self-end rounded-full text-[11px] font-semibold text-white",
        size,
      )}
      style={{ background: avatarColor(jid) }}
    >
      {letter}
    </div>
  )
}

function StatusTick({ status }: { status: string }) {
  // Çift-check'leri WhatsApp gibi yakınlaştır (negatif letter-spacing).
  if (status === "read")
    return <span className="tracking-[-0.18em] text-sky-300">✓✓</span>
  if (status === "delivered")
    return <span className="tracking-[-0.18em]">✓✓</span>
  if (status === "sent") return <span>✓</span>
  return <span className="opacity-60">⌛</span>
}

const MEDIA_TYPE_ICON: Record<string, string> = {
  image: "📷",
  video: "🎬",
  audio: "🎤",
  document: "📄",
  sticker: "🌟",
}

function MessageMedia({
  m,
  baseUrl,
  onImageClick,
  onDownload,
  downloading,
}: {
  m: WaMessage
  baseUrl: string
  onImageClick?: (item: {
    id: string
    url: string
    name: string
    mimeType?: string
  }) => void
  onDownload?: (m: WaMessage) => void
  downloading?: boolean
}) {
  const t = useTranslations("whatsapp")
  if (!MEDIA_KINDS.has(m.type)) return null

  // ── İndirilmiş tam medya ──────────────────────────────────────────────
  if (m.mediaId) {
    const url = `${baseUrl}/${m.mediaId}`
    if (m.type === "image" || m.type === "sticker") {
      return (
        <button
          type="button"
          onClick={() =>
            onImageClick?.({
              id: m.mediaId!,
              url,
              name: m.fileName || "image",
              mimeType: m.mimetype || undefined,
            })
          }
          className="block cursor-zoom-in"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={m.fileName || "image"}
            className="max-h-60 max-w-full rounded-lg"
          />
        </button>
      )
    }
    if (m.type === "video")
      return (
        <video src={url} controls className="max-h-60 max-w-full rounded-lg" />
      )
    if (m.type === "audio")
      return <WaveformPlayer src={url} waveform={m.waveform} fromMe={m.fromMe} />
    return (
      <a
        href={url}
        download={m.fileName || undefined}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex items-center gap-2 rounded-lg border px-2.5 py-2 no-underline",
          m.fromMe
            ? "border-primary-foreground/25 bg-primary-foreground/10"
            : "border-border bg-background/60",
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-foreground/10 text-base">
          📄
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-xs font-medium">
            {m.fileName || t("document")}
          </span>
          <span className="text-[10px] opacity-70">{t("downloadMedia")}</span>
        </span>
      </a>
    )
  }

  // ── Henüz indirilmemiş → thumb/skeleton + indir butonu ────────────────
  const icon = MEDIA_TYPE_ICON[m.type] ?? "📄"
  const isVisual =
    m.type === "image" || m.type === "video" || m.type === "sticker"

  if (isVisual) {
    return (
      <button
        type="button"
        onClick={() => onDownload?.(m)}
        disabled={downloading}
        className="relative block overflow-hidden rounded-lg"
        aria-label={t("downloadMedia")}
      >
        {m.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={m.thumbnail}
            alt=""
            className="max-h-60 max-w-full rounded-lg blur-[1.5px]"
          />
        ) : (
          <div className="flex aspect-video w-44 items-center justify-center rounded-lg bg-muted text-3xl">
            {icon}
          </div>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/35">
          <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white">
            {downloading ? (
              <span className="size-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <span className="text-sm">⬇</span>
            )}
            {downloading ? t("downloading") : t("downloadMedia")}
          </span>
        </span>
      </button>
    )
  }

  // audio + document → satır kart + indir butonu
  return (
    <button
      type="button"
      onClick={() => onDownload?.(m)}
      disabled={downloading}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left",
        m.fromMe
          ? "border-primary-foreground/25 bg-primary-foreground/10"
          : "border-border bg-background/60",
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-foreground/10 text-base">
        {downloading ? (
          <span className="size-3.5 animate-spin rounded-full border-2 border-current/40 border-t-current" />
        ) : (
          icon
        )}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-xs font-medium">
          {m.fileName || (m.type === "audio" ? t("sharedMedia") : t("document"))}
        </span>
        <span className="text-[10px] opacity-70">
          {downloading ? t("downloading") : t("downloadMedia")}
        </span>
      </span>
    </button>
  )
}

/** Ardışık aynı-gönderen mesajlarda bitişik kenarları düzleştir (WhatsApp tarzı). */
function bubbleRadius(
  m: WaMessage,
  prev: WaMessage | undefined,
  next: WaMessage | undefined,
): string {
  const GROUP_MS = 5 * 60 * 1000
  const sameAs = (o?: WaMessage) =>
    !!o &&
    o.fromMe === m.fromMe &&
    o.senderJid === m.senderJid &&
    Math.abs(new Date(m.timestamp).getTime() - new Date(o.timestamp).getTime()) <
      GROUP_MS
  const gPrev = sameAs(prev)
  const gNext = sameAs(next)
  const base = "rounded-2xl"
  if (m.fromMe) {
    return cn(base, gPrev && "rounded-tr-md", gNext && "rounded-br-md")
  }
  return cn(base, gPrev && "rounded-tl-md", gNext && "rounded-bl-md")
}

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"]

/** WhatsApp tarzı sesli mesaj — gerçek waveform barları + play/pause + ilerleme. */
function WaveformPlayer({
  src,
  waveform,
  fromMe,
}: {
  src: string
  waveform: number[] | null
  fromMe: boolean
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const bars =
    waveform && waveform.length
      ? waveform
      : Array.from({ length: 32 }, () => 35)
  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) {
      void a.play()
      setPlaying(true)
    } else {
      a.pause()
      setPlaying(false)
    }
  }
  return (
    <div className="flex min-w-[200px] items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full text-xs",
          fromMe ? "bg-primary-foreground/20" : "bg-foreground/10",
        )}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="flex h-8 flex-1 items-center gap-[2px]">
        {bars.map((v, i) => {
          const active = bars.length > 0 && i / bars.length <= progress
          return (
            <span
              key={i}
              style={{ height: `${Math.max(12, Math.min(100, v))}%` }}
              className={cn(
                "w-[2px] shrink-0 rounded-full",
                active ? "opacity-100" : "opacity-40",
                fromMe ? "bg-primary-foreground" : "bg-foreground",
              )}
            />
          )
        })}
      </div>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src={src}
        className="hidden"
        onEnded={() => {
          setPlaying(false)
          setProgress(0)
        }}
        onTimeUpdate={(e) => {
          const a = e.currentTarget
          if (a.duration) setProgress(a.currentTime / a.duration)
        }}
      />
    </div>
  )
}

/** Link OG önizleme kartı (mesaj balonu içinde). */
function LinkPreviewCard({
  preview,
  fromMe,
}: {
  preview: WaLinkPreview
  fromMe: boolean
}) {
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "mb-1 flex max-w-[300px] gap-2 overflow-hidden rounded-lg border no-underline",
        fromMe
          ? "border-primary-foreground/25 bg-primary-foreground/10"
          : "border-border bg-background/60",
      )}
    >
      {preview.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview.image} alt="" className="size-16 shrink-0 object-cover" />
      ) : null}
      <div className="flex min-w-0 flex-col justify-center gap-0.5 p-2">
        {preview.title ? (
          <span className="truncate text-xs font-medium">{preview.title}</span>
        ) : null}
        {preview.description ? (
          <span className="line-clamp-2 text-[11px] opacity-80">
            {preview.description}
          </span>
        ) : null}
        <span className="truncate text-[10px] opacity-60">{preview.url}</span>
      </div>
    </a>
  )
}

/** Mesaj altındaki tepki rozetleri (emoji + sayı); hover'da kimin attığı tooltip. */
function ReactionsRow({ reactions }: { reactions: WaMessage["reactions"] }) {
  const t = useTranslations("whatsapp")
  if (!reactions || reactions.length === 0) return null
  const groups = new Map<string, WaReaction[]>()
  for (const r of reactions) {
    if (!r.emoji) continue
    const arr = groups.get(r.emoji) ?? []
    arr.push(r)
    groups.set(r.emoji, arr)
  }
  if (groups.size === 0) return null
  const nameOf = (r: WaReaction) =>
    r.fromMe ? t("you") : r.senderJid ? r.senderJid.split("@")[0]! : "?"
  return (
    <TooltipProvider>
      <div className="-mt-1 flex flex-wrap gap-1">
        {Array.from(groups.entries()).map(([emoji, rs]) => (
          <Tooltip key={emoji}>
            <TooltipTrigger
              render={
                <span className="inline-flex cursor-default items-center gap-0.5 rounded-full border bg-card px-1.5 py-0.5 text-[11px] shadow-sm" />
              }
            >
              {emoji}
              {rs.length > 1 ? (
                <span className="text-muted-foreground">{rs.length}</span>
              ) : null}
            </TooltipTrigger>
            <TooltipContent>
              {emoji}&nbsp;{rs.map(nameOf).join(", ")}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  )
}

// ── Component ───────────────────────────────────────────────────────────────

export function ChatsContent() {
  const params = useParams()
  const slug = params["company-slug"] as string
  const t = useTranslations("whatsapp")
  const locale = useLocale()
  const dfLocale = locale === "tr" ? trLocale : enUS

  // Mesaj listesi gün ayracı etiketi (Bugün / Dün / tam tarih).
  const dateDividerLabel = useCallback(
    (iso: string): string => {
      const d = new Date(iso)
      if (isToday(d)) return t("today")
      if (isYesterday(d)) return t("yesterday")
      return format(d, "d MMMM yyyy", { locale: dfLocale })
    },
    [t, dfLocale],
  )

  const membership = useCompanyStore((s) => s.membership)
  const { data: session } = useSession()
  const systemRole = (session?.user as { role?: string } | undefined)?.role

  const { canManage, canSend } = useMemo(() => {
    const isAdmin =
      systemRole === "admin" ||
      membership?.role === "owner" ||
      membership?.role === "admin"
    const perms = membership?.permissions ?? []
    return {
      canManage: isAdmin || perms.includes("whatsapp.manage"),
      canSend:
        isAdmin ||
        perms.includes("whatsapp.send") ||
        perms.includes("whatsapp.manage"),
    }
  }, [systemRole, membership])

  const [sessions, setSessions] = useState<WaSessionInfo[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [contacts, setContacts] = useState<WaContact[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [messageResults, setMessageResults] = useState<WaSearchResult[]>([])
  const [activeJid, setActiveJid] = useState<string | null>(null)
  const [messages, setMessages] = useState<WaMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  // Detay sidebar hedefi: açık sohbetin kişisi VEYA tıklanan grup üyesi.
  const [detail, setDetail] = useState<{ jid: string; name: string } | null>(
    null,
  )
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxItems, setLightboxItems] = useState<
    Array<{ id: string; url: string; name: string; mimeType?: string }>
  >([])
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState("")
  const [sharedTab, setSharedTab] = useState<"media" | "docs" | "links">("media")
  const [shared, setShared] = useState<WaMessage[]>([])
  const [sharedLoading, setSharedLoading] = useState(false)
  const [downloadingMedia, setDownloadingMedia] = useState<Set<string>>(
    new Set(),
  )
  const downloadingRef = useRef<Set<string>>(new Set())

  const activeJidRef = useRef<string | null>(null)
  activeJidRef.current = activeJid
  const scrollBottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const avatarRequestedRef = useRef<Set<string>>(new Set())

  const sessionBase = activeSessionId
    ? `/api/companies/${slug}/whatsapp/sessions/${activeSessionId}`
    : null
  const sessionUrl = (sid: string) =>
    `/api/companies/${slug}/whatsapp/sessions/${sid}`

  // ── SSE handlers ──────────────────────────────────────────────────────────
  const handleIncoming = useCallback((e: WaMessageEvent) => {
    setContacts((prev) => {
      const isActive = e.contact.jid === activeJidRef.current
      const next = {
        ...e.contact,
        unreadCount: isActive ? 0 : e.contact.unreadCount,
      }
      const rest = prev.filter((c) => c.jid !== e.contact.jid)
      return sortContacts([next, ...rest])
    })
    if (e.message.chatJid === activeJidRef.current) {
      setMessages((prev) =>
        prev.some((m) => m.waMessageId === e.message.waMessageId)
          ? prev
          : [...prev, e.message],
      )
    }
  }, [])

  const handleStatusUpdate = useCallback((e: WaStatusUpdate) => {
    if (e.chatJid !== activeJidRef.current) return
    setMessages((prev) =>
      prev.map((m) =>
        m.waMessageId === e.waMessageId ? { ...m, status: e.status } : m,
      ),
    )
  }, [])

  const handleMediaReady = useCallback((e: WaMediaReady) => {
    if (e.chatJid !== activeJidRef.current) return
    setMessages((prev) =>
      prev.map((m) =>
        m.waMessageId === e.waMessageId
          ? { ...m, mediaId: e.mediaId, mimetype: e.mimetype, fileName: e.fileName }
          : m,
      ),
    )
  }, [])

  const handleContactUpdate = useCallback((e: WaContactUpdate) => {
    setContacts((prev) =>
      prev.map((c) =>
        c.jid === e.jid
          ? {
              ...c,
              avatarUrl: e.avatarUrl ?? c.avatarUrl,
              name: e.name ?? c.name,
              pushName: e.pushName ?? c.pushName,
            }
          : c,
      ),
    )
  }, [])

  const handleReaction = useCallback((e: WaReactionEvent) => {
    if (e.chatJid !== activeJidRef.current) return
    setMessages((prev) =>
      prev.map((m) =>
        m.waMessageId === e.waMessageId ? { ...m, reactions: e.reactions } : m,
      ),
    )
  }, [])

  const loadContactsRef = useRef<(q: string) => void>(() => {})
  const handleHistory = useCallback(() => {
    // Geçmiş chunk'ı geldi → sohbet listesini tazele (debounce loadContacts).
    loadContactsRef.current(search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { status: liveStatus, qr } = useWhatsappStream(slug, activeSessionId, {
    onMessage: handleIncoming,
    onStatusUpdate: handleStatusUpdate,
    onMediaReady: handleMediaReady,
    onContactUpdate: handleContactUpdate,
    onHistory: handleHistory,
    onReaction: handleReaction,
  })

  const activeSession = sessions.find((s) => s.sessionId === activeSessionId)
  const connectionState =
    liveStatus?.status ?? activeSession?.status ?? "disconnected"
  const isConnected = connectionState === "connected"

  useEffect(() => {
    if (!activeSessionId || !liveStatus) return
    setSessions((prev) =>
      prev.map((s) =>
        s.sessionId === activeSessionId
          ? {
              ...s,
              status: liveStatus.status,
              phoneNumber: liveStatus.phoneNumber ?? s.phoneNumber,
              pushName: liveStatus.pushName ?? s.pushName,
            }
          : s,
      ),
    )
  }, [activeSessionId, liveStatus])

  // ── Numaralar ───────────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const res = await fetch(`/api/companies/${slug}/whatsapp/sessions`)
      const j = await res.json()
      setSessions(Array.isArray(j.data) ? (j.data as WaSessionInfo[]) : [])
    } finally {
      setSessionsLoading(false)
    }
  }, [slug])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  useEffect(() => {
    if (activeSessionId || sessions.length === 0) return
    const connected = sessions.find((s) => s.status === "connected")
    setActiveSessionId(connected?.sessionId ?? sessions[0]!.sessionId)
  }, [activeSessionId, sessions])

  useEffect(() => {
    setActiveJid(null)
    setMessages([])
    setContacts([])
    setMessageResults([])
    setSearch("")
  }, [activeSessionId])

  // ── Sohbet listesi + arama ────────────────────────────────────────────────
  const loadContacts = useCallback(
    async (q: string) => {
      if (!sessionBase) return
      setContactsLoading(true)
      try {
        const sp = new URLSearchParams()
        if (q.trim()) sp.set("q", q.trim())
        const res = await fetch(`${sessionBase}/contacts?${sp}`)
        const j = await res.json()
        if (Array.isArray(j.data)) setContacts(sortContacts(j.data))
      } finally {
        setContactsLoading(false)
      }
    },
    [sessionBase],
  )
  loadContactsRef.current = loadContacts

  const loadMessageResults = useCallback(
    async (q: string) => {
      if (!sessionBase || !q.trim()) {
        setMessageResults([])
        return
      }
      try {
        const res = await fetch(
          `${sessionBase}/search?q=${encodeURIComponent(q.trim())}`,
        )
        const j = await res.json()
        setMessageResults(Array.isArray(j.data) ? j.data : [])
      } catch {
        setMessageResults([])
      }
    },
    [sessionBase],
  )

  useEffect(() => {
    if (!isConnected || !sessionBase) return
    const handle = setTimeout(() => {
      loadContacts(search)
      loadMessageResults(search)
    }, 300)
    return () => clearTimeout(handle)
  }, [isConnected, sessionBase, search, loadContacts, loadMessageResults])

  // ── Sohbet aç ─────────────────────────────────────────────────────────────
  const openChat = useCallback(
    async (jid: string) => {
      if (!sessionBase) return
      setActiveJid(jid)
      setDetail(null)
      setLightboxOpen(false)
      setMessages([])
      setMessagesLoading(true)
      setContacts((prev) =>
        prev.map((c) => (c.jid === jid ? { ...c, unreadCount: 0 } : c)),
      )
      // Avatar yoksa on-demand çek (oturum başına tek kez).
      const c = contacts.find((x) => x.jid === jid)
      if (c && !c.avatarUrl && !c.isGroup && !avatarRequestedRef.current.has(jid)) {
        avatarRequestedRef.current.add(jid)
        fetch(`${sessionBase}/avatar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jid }),
        }).catch(() => {})
      }
      try {
        const res = await fetch(
          `${sessionBase}/messages?chatJid=${encodeURIComponent(jid)}`,
        )
        const j = await res.json()
        if (Array.isArray(j.data)) setMessages(j.data)
      } finally {
        setMessagesLoading(false)
      }
    },
    [sessionBase, contacts],
  )

  useEffect(() => {
    scrollBottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Detay paneli açık sohbetin kişisini gösteriyorsa paylaşılan içeriği çek.
  const detailShowsActive = !!detail && detail.jid === activeJid
  useEffect(() => {
    if (!detailShowsActive || !activeJid || !sessionBase) {
      setShared([])
      return
    }
    let cancelled = false
    setSharedLoading(true)
    fetch(
      `${sessionBase}/shared?chatJid=${encodeURIComponent(activeJid)}&kind=${sharedTab}`,
    )
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setShared(Array.isArray(j.data) ? j.data : [])
      })
      .catch(() => {
        if (!cancelled) setShared([])
      })
      .finally(() => {
        if (!cancelled) setSharedLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [detailShowsActive, activeJid, sessionBase, sharedTab])

  // ── Sohbet aksiyonları (pin/arşiv/sil) ──────────────────────────────────
  const togglePin = useCallback(
    async (c: WaContact) => {
      if (!sessionBase) return
      const pinned = !c.pinned
      setContacts((prev) =>
        sortContacts(
          prev.map((x) => (x.jid === c.jid ? { ...x, pinned } : x)),
        ),
      )
      await fetch(`${sessionBase}/contacts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid: c.jid, pinned }),
      }).catch(() => {})
    },
    [sessionBase],
  )

  const archiveChat = useCallback(
    async (c: WaContact) => {
      if (!sessionBase) return
      setContacts((prev) => prev.filter((x) => x.jid !== c.jid))
      if (activeJidRef.current === c.jid) {
        setActiveJid(null)
        setMessages([])
      }
      await fetch(`${sessionBase}/contacts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid: c.jid, archived: true }),
      }).catch(() => {})
    },
    [sessionBase],
  )

  const deleteChat = useCallback(
    async (c: WaContact) => {
      if (!sessionBase) return
      const ok = await confirm({
        title: t("deleteChatConfirmTitle"),
        description: t("deleteChatConfirmDesc"),
        confirmText: t("deleteCta"),
        destructive: true,
      })
      if (!ok) return
      setContacts((prev) => prev.filter((x) => x.jid !== c.jid))
      if (activeJidRef.current === c.jid) {
        setActiveJid(null)
        setMessages([])
      }
      await fetch(
        `${sessionBase}/contacts?jid=${encodeURIComponent(c.jid)}`,
        { method: "DELETE" },
      ).catch(() => {})
    },
    [sessionBase, t],
  )

  // ── Mesaj aksiyonları (kopyala/sil) ──────────────────────────────────────
  const copyMessage = useCallback(
    async (m: WaMessage) => {
      try {
        await navigator.clipboard.writeText(m.body)
        toast.success(t("copied"))
      } catch {
        /* clipboard blocked */
      }
    },
    [t],
  )

  const deleteMessage = useCallback(
    async (m: WaMessage) => {
      if (!sessionBase) return
      const ok = await confirm({
        title: t("deleteMessageConfirmTitle"),
        confirmText: t("deleteCta"),
        destructive: true,
      })
      if (!ok) return
      setMessages((prev) => prev.filter((x) => x.waMessageId !== m.waMessageId))
      await fetch(
        `${sessionBase}/messages?waMessageId=${encodeURIComponent(m.waMessageId)}`,
        { method: "DELETE" },
      ).catch(() => {})
    },
    [sessionBase, t],
  )

  // Bir mesaja emoji tepki gönder (aynı emoji tekrar → kaldır). Optimistik.
  const sendReaction = useCallback(
    async (m: WaMessage, emoji: string) => {
      if (!sessionBase) return
      const mine = m.reactions.find((r) => r.fromMe)
      const next = mine?.emoji === emoji ? "" : emoji
      setMessages((prev) =>
        prev.map((x) => {
          if (x.waMessageId !== m.waMessageId) return x
          const others = x.reactions.filter((r) => !r.fromMe)
          return {
            ...x,
            reactions: next
              ? [...others, { emoji: next, fromMe: true, senderJid: null }]
              : others,
          }
        }),
      )
      try {
        const res = await fetch(`${sessionBase}/react`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatJid: m.chatJid,
            waMessageId: m.waMessageId,
            fromMe: m.fromMe,
            emoji: next,
            senderJid: m.senderJid,
          }),
        })
        if (!res.ok) throw new Error()
      } catch {
        toast.error(t("reactionFailed"))
        // Optimistik tepkiyi geri al.
        setMessages((prev) =>
          prev.map((x) =>
            x.waMessageId === m.waMessageId
              ? { ...x, reactions: m.reactions }
              : x,
          ),
        )
      }
    },
    [sessionBase, t],
  )

  // Kişiye panel-içi özel isim ver (WhatsApp adını override eder). null → temizle.
  const renameContact = useCallback(
    async (c: WaContact, customName: string | null) => {
      if (!sessionBase) return
      setContacts((prev) =>
        prev.map((x) => (x.jid === c.jid ? { ...x, customName } : x)),
      )
      await fetch(`${sessionBase}/contacts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid: c.jid, customName }),
      }).catch(() => {})
    },
    [sessionBase],
  )

  const openLightbox = useCallback(
    (item: { id: string; url: string; name: string; mimeType?: string }) => {
      setLightboxItems([item])
      setLightboxOpen(true)
    },
    [],
  )

  // Tam medyayı talep üzerine indir (otomatik inmez). mediaId dolunca
  // UI tam görseli/videoyu/dosyayı gösterir (media-ready SSE de aynısını yapar).
  const handleDownloadMedia = useCallback(
    async (m: WaMessage) => {
      if (!sessionBase || downloadingRef.current.has(m.waMessageId)) return
      downloadingRef.current.add(m.waMessageId)
      setDownloadingMedia(new Set(downloadingRef.current))
      try {
        const res = await fetch(`${sessionBase}/fetch-media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ waMessageId: m.waMessageId }),
        })
        const j = (await res.json()) as {
          error?: string
          data?: {
            mediaId: string
            mimetype: string | null
            fileName: string | null
          }
        }
        if (!res.ok || !j.data) throw new Error(j.error || "")
        const data = j.data
        setMessages((prev) =>
          prev.map((x) =>
            x.waMessageId === m.waMessageId
              ? {
                  ...x,
                  mediaId: data.mediaId,
                  mimetype: data.mimetype,
                  fileName: data.fileName,
                }
              : x,
          ),
        )
      } catch (err) {
        toast.error(
          err instanceof Error && err.message
            ? err.message
            : t("mediaFetchFailed"),
        )
      } finally {
        downloadingRef.current.delete(m.waMessageId)
        setDownloadingMedia(new Set(downloadingRef.current))
      }
    },
    [sessionBase, t],
  )

  // ── Numara aksiyonları ────────────────────────────────────────────────────
  const addNumber = useCallback(async () => {
    setCreating(true)
    try {
      const res = await fetch(`/api/companies/${slug}/whatsapp/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const j = await res.json()
      if (!res.ok) {
        toast.error(j.error || t("sendFailed"))
        return
      }
      const created = j.data as WaSessionInfo
      setSessions((prev) => [...prev, created])
      setActiveSessionId(created.sessionId)
    } finally {
      setCreating(false)
    }
  }, [slug, t])

  const reconnectNumber = useCallback(
    async (sid: string) => {
      await fetch(sessionUrl(sid), { method: "POST" }).catch(() => {})
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slug],
  )

  const disconnectNumber = useCallback(
    async (sid: string) => {
      const ok = await confirm({
        title: t("disconnectConfirmTitle"),
        description: t("disconnectConfirmDesc"),
        confirmText: t("disconnectConfirmCta"),
        destructive: true,
      })
      if (!ok) return
      await fetch(sessionUrl(sid), { method: "DELETE" }).catch(() => {})
      if (sid === activeJidRef.current) {
        /* noop */
      }
      if (sid === activeSessionId) {
        setContacts([])
        setMessages([])
        setActiveJid(null)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slug, activeSessionId, t],
  )

  const removeNumberFn = useCallback(
    async (sid: string) => {
      const ok = await confirm({
        title: t("removeConfirmTitle"),
        description: t("removeConfirmDesc"),
        confirmText: t("removeConfirmCta"),
        destructive: true,
      })
      if (!ok) return
      await fetch(`${sessionUrl(sid)}?purge=true`, { method: "DELETE" }).catch(
        () => {},
      )
      if (sid === activeSessionId) {
        setActiveJid(null)
        setContacts([])
        setMessages([])
        setActiveSessionId(null)
      }
      setSessions((prev) => prev.filter((s) => s.sessionId !== sid))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slug, activeSessionId, t],
  )

  // ── Gönderim ───────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = draft.trim()
    if (!text || !activeJid || !sessionBase) return
    if (!canSend) {
      toast.error(t("noPermissionSend"))
      return
    }
    setSending(true)
    try {
      const res = await fetch(`${sessionBase}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: activeJid, text }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j.error || t("sendFailed"))
        return
      }
      setDraft("")
    } finally {
      setSending(false)
    }
  }, [draft, activeJid, sessionBase, canSend, t])

  const handleFilePicked = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ""
      if (!file || !activeJid || !sessionBase) return
      if (!canSend) {
        toast.error(t("noPermissionSend"))
        return
      }
      if (file.size > 16 * 1024 * 1024) {
        toast.error(t("mediaTooLarge"))
        return
      }
      setSending(true)
      try {
        const fd = new FormData()
        fd.set("to", activeJid)
        fd.set("file", file)
        const res = await fetch(`${sessionBase}/send-media`, {
          method: "POST",
          body: fd,
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          toast.error(j.error || t("sendFailed"))
        }
      } finally {
        setSending(false)
      }
    },
    [activeJid, sessionBase, canSend, t],
  )

  const activeContact = contacts.find((c) => c.jid === activeJid)

  // Detay panelinde gösterilen kişi (kayıtlıysa contacts'tan, değilse fallback).
  const detailContact = detail
    ? (contacts.find((c) => c.jid === detail.jid) ?? null)
    : null
  const detailIsActive = !!detail && detail.jid === activeJid
  const detailDisplayName = detailContact
    ? contactDisplayName(detailContact)
    : (detail?.name ?? "")
  const detailPhone =
    detailContact?.phone ??
    (detail && detail.jid.endsWith("@s.whatsapp.net")
      ? (detail.jid.split("@")[0] ?? null)
      : null)

  function sessionLabel(s: WaSessionInfo): string {
    return s.label || (s.phoneNumber ? `+${s.phoneNumber}` : t("unnamedNumber"))
  }

  // ── Sohbet satırı ─────────────────────────────────────────────────────────
  const renderContactRow = (c: WaContact) => {
    const name = contactDisplayName(c)
    return (
      <ContextMenu key={c.jid}>
        <ContextMenuTrigger
          render={
            <button
              type="button"
              onClick={() => openChat(c.jid)}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                activeJid === c.jid && "bg-muted",
              )}
            />
          }
        >
          <ContactAvatar contact={c} />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1 truncate text-sm font-medium">
                {c.pinned ? (
                  <HugeiconsIcon
                    icon={PinIcon}
                    strokeWidth={2}
                    className="size-3 shrink-0 text-muted-foreground"
                  />
                ) : null}
                <span className="truncate">{name}</span>
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {formatListTime(c.lastMessageAt)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs text-muted-foreground">
                {c.lastMessageFromMe ? `${t("you")}: ` : ""}
                {c.lastMessagePreview || ""}
              </span>
              {c.unreadCount > 0 ? (
                <Badge className="h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px]">
                  {c.unreadCount > 99 ? "99+" : c.unreadCount}
                </Badge>
              ) : null}
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => togglePin(c)}>
            <HugeiconsIcon icon={PinIcon} strokeWidth={2} />
            {c.pinned ? t("unpin") : t("pin")}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => archiveChat(c)}>
            <HugeiconsIcon icon={Archive02Icon} strokeWidth={2} />
            {t("archive")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onClick={() => deleteChat(c)}>
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            {t("deleteChat")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )
  }

  const renderResultRow = (r: WaSearchResult) => (
    <li key={r.waMessageId}>
      <button
        type="button"
        onClick={() => openChat(r.chatJid)}
        className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-muted/60"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{r.chatName}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {formatListTime(r.timestamp)}
          </span>
        </div>
        <span className="line-clamp-2 text-xs text-muted-foreground">
          {r.fromMe ? `${t("you")}: ` : ""}
          {r.body}
        </span>
      </button>
    </li>
  )

  // ── RENDER ──────────────────────────────────────────────────────────────

  const numberBar = (
    <div className="flex items-center gap-2 overflow-x-auto rounded-xl border bg-card p-2">
      {sessions.map((s) => (
        <ContextMenu key={s.sessionId}>
          <ContextMenuTrigger
            render={
              <button
                type="button"
                onClick={() => setActiveSessionId(s.sessionId)}
                title={t("numberMenuHint")}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors",
                  s.sessionId === activeSessionId
                    ? "bg-muted font-medium"
                    : "hover:bg-muted/50",
                )}
              />
            }
          >
            <span className={cn("size-2 rounded-full", statusDot(s.status))} />
            {sessionLabel(s)}
          </ContextMenuTrigger>
          <ContextMenuContent>
            {s.status !== "connected" ? (
              <ContextMenuItem onClick={() => reconnectNumber(s.sessionId)}>
                <HugeiconsIcon icon={Message01Icon} strokeWidth={2} />
                {t("reconnect")}
              </ContextMenuItem>
            ) : (
              <ContextMenuItem onClick={() => disconnectNumber(s.sessionId)}>
                <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} />
                {t("disconnect")}
              </ContextMenuItem>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              onClick={() => removeNumberFn(s.sessionId)}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              {t("removeNumber")}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ))}
      {canManage ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={addNumber}
          disabled={creating}
        >
          {creating ? t("addingNumber") : `+ ${t("addNumber")}`}
        </Button>
      ) : null}
    </div>
  )

  if (!sessionsLoading && sessions.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border bg-card p-8 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <HugeiconsIcon icon={Message01Icon} strokeWidth={2} />
          </div>
          <h2 className="text-lg font-semibold">{t("noNumbers")}</h2>
          <p className="text-sm text-muted-foreground">{t("noNumbersDesc")}</p>
          {canManage ? (
            <Button onClick={addNumber} disabled={creating}>
              {creating ? t("addingNumber") : t("addNumber")}
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100dvh-6rem)] flex-col gap-3">
      {numberBar}

      {!activeSessionId ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {t("selectNumber")}
        </div>
      ) : !isConnected ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border bg-card p-8 text-center">
            {qr ? (
              <>
                <h2 className="text-lg font-semibold">{t("connectTitle")}</h2>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qr}
                  alt="WhatsApp QR"
                  className="size-64 rounded-lg border bg-white p-2"
                />
                <p className="text-sm text-muted-foreground">{t("scanSteps")}</p>
                {canManage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeNumberFn(activeSessionId)}
                  >
                    {t("removeNumber")}
                  </Button>
                ) : null}
              </>
            ) : connectionState === "connecting" ? (
              <>
                <h2 className="text-lg font-semibold">{t("connectTitle")}</h2>
                <p className="text-sm text-muted-foreground">{t("waitingQr")}</p>
                <Skeleton className="size-64 rounded-lg" />
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">
                  {t("notConnectedTitle")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("notConnectedDesc")}
                </p>
                {canManage ? (
                  <div className="flex gap-2">
                    <Button onClick={() => reconnectNumber(activeSessionId)}>
                      {t("reconnect")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => removeNumberFn(activeSessionId)}
                    >
                      {t("removeNumber")}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : (
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1 overflow-hidden rounded-xl border"
        >
          {/* Sol: sohbet listesi — varsayılan minimum genişlik */}
          <ResizablePanel
            id="wa-list"
            defaultSize="28%"
            minSize="28%"
            maxSize="70%"
          >
            <div className="flex h-full min-h-0 flex-col bg-card">
              <div className="border-b p-2">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="h-9"
                />
              </div>
              <ScrollArea className="min-h-0 flex-1">
                {contactsLoading ? (
                  <div className="flex flex-col gap-2 p-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full rounded-lg" />
                    ))}
                  </div>
                ) : search.trim() ? (
                  contacts.length === 0 && messageResults.length === 0 ? (
                    <p className="p-6 text-center text-xs text-muted-foreground">
                      {t("searchNoResults")}
                    </p>
                  ) : (
                    <div className="flex flex-col">
                      {contacts.length > 0 ? (
                        <>
                          <div className="bg-muted/30 px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {t("chatsSection")}
                          </div>
                          {contacts.map(renderContactRow)}
                        </>
                      ) : null}
                      {messageResults.length > 0 ? (
                        <>
                          <div className="bg-muted/30 px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {t("messagesSection")}
                          </div>
                          <ul className="flex flex-col">
                            {messageResults.map(renderResultRow)}
                          </ul>
                        </>
                      ) : null}
                    </div>
                  )
                ) : contacts.length === 0 ? (
                  <p className="p-6 text-center text-xs text-muted-foreground">
                    {t("chatsEmpty")}
                  </p>
                ) : (
                  <div className="flex flex-col">
                    {contacts.map(renderContactRow)}
                  </div>
                )}
              </ScrollArea>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Orta: konuşma */}
          <ResizablePanel id="wa-convo" defaultSize="72%" minSize="30%">
            <div className="flex h-full min-h-0 min-w-0 flex-col bg-card">
              {!activeJid ? (
                <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
                  {t("selectChat")}
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      activeJid &&
                      setDetail({
                        jid: activeJid,
                        name: activeContact
                          ? contactDisplayName(activeContact)
                          : (activeJid.split("@")[0] ?? activeJid),
                      })
                    }
                    className="flex shrink-0 items-center gap-3 border-b bg-card p-3 text-left transition-colors hover:bg-muted/40"
                    title={t("openDetails")}
                  >
                    {activeContact ? (
                      <ContactAvatar contact={activeContact} size="size-8" />
                    ) : null}
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {activeContact
                          ? contactDisplayName(activeContact)
                          : activeJid.split("@")[0]}
                      </span>
                      {activeContact?.isGroup ? (
                        <span className="text-[10px] text-muted-foreground">
                          {t("group")}
                        </span>
                      ) : activeContact?.phone ? (
                        <span className="text-[10px] text-muted-foreground">
                          +{activeContact.phone}
                        </span>
                      ) : null}
                    </div>
                  </button>

                  <ScrollArea className="min-h-0 flex-1">
                    <div className="flex flex-col px-3 py-4">
                      {messagesLoading ? (
                        <p className="py-8 text-center text-xs text-muted-foreground">
                          {t("loadingMessages")}
                        </p>
                      ) : messages.length === 0 ? (
                        <p className="py-8 text-center text-xs text-muted-foreground">
                          {t("noMessages")}
                        </p>
                      ) : (
                        messages.map((m, i) => {
                          const prev = messages[i - 1]
                          const next = messages[i + 1]
                          const grouped =
                            prev &&
                            prev.fromMe === m.fromMe &&
                            prev.senderJid === m.senderJid
                          const showDate =
                            !prev ||
                            !isSameDay(
                              new Date(prev.timestamp),
                              new Date(m.timestamp),
                            )
                          const incomingGroup =
                            !!activeContact?.isGroup && !m.fromMe
                          const showSender =
                            incomingGroup && (!grouped || !!showDate)
                          const senderKey = m.senderJid || m.chatJid
                          return (
                            <Fragment key={m.waMessageId}>
                              {showDate ? (
                                <div className="sticky top-1 z-10 my-2 flex justify-center">
                                  <span className="rounded-full bg-background/90 px-3 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm ring-1 ring-border backdrop-blur">
                                    {dateDividerLabel(m.timestamp)}
                                  </span>
                                </div>
                              ) : null}
                              <div
                                className={cn(
                                  "flex gap-2",
                                  grouped ? "mt-0.5" : "mt-2",
                                  m.fromMe ? "justify-end" : "justify-start",
                                )}
                              >
                                {incomingGroup ? (
                                  showSender ? (
                                    <button
                                      type="button"
                                      className="self-end rounded-full outline-none"
                                      onClick={() =>
                                        setDetail({
                                          jid: senderKey,
                                          name: senderDisplayName(m),
                                        })
                                      }
                                      aria-label={senderDisplayName(m)}
                                    >
                                      <SenderAvatar
                                        jid={senderKey}
                                        name={senderDisplayName(m)}
                                      />
                                    </button>
                                  ) : (
                                    <div className="w-7 shrink-0" />
                                  )
                                ) : null}
                                <div
                                  className={cn(
                                    "flex max-w-[75%] flex-col gap-1",
                                    m.fromMe ? "items-end" : "items-start",
                                  )}
                                >
                                  {showSender ? (
                                    <button
                                      type="button"
                                      className="px-1 text-xs font-semibold hover:underline"
                                      style={{ color: avatarColor(senderKey) }}
                                      onClick={() =>
                                        setDetail({
                                          jid: senderKey,
                                          name: senderDisplayName(m),
                                        })
                                      }
                                    >
                                      {senderDisplayName(m)}
                                    </button>
                                  ) : null}
                                  <ContextMenu>
                                  <ContextMenuTrigger
                                    render={
                                      <div
                                        className={cn(
                                          "flex flex-col gap-1 px-3 py-1.5 text-sm",
                                          bubbleRadius(m, prev, next),
                                          m.fromMe
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted",
                                        )}
                                      />
                                    }
                                  >
                                    {m.linkPreview ? (
                                      <LinkPreviewCard
                                        preview={m.linkPreview}
                                        fromMe={m.fromMe}
                                      />
                                    ) : null}
                                    <MessageMedia
                                      m={m}
                                      baseUrl={`${sessionBase}/media`}
                                      onImageClick={openLightbox}
                                      onDownload={handleDownloadMedia}
                                      downloading={downloadingMedia.has(
                                        m.waMessageId,
                                      )}
                                    />
                                    {m.body ? (
                                      <span className="whitespace-pre-wrap break-words">
                                        {m.body}
                                      </span>
                                    ) : !m.mediaId && !MEDIA_KINDS.has(m.type) ? (
                                      <span className="italic opacity-70">
                                        [{m.type}]
                                      </span>
                                    ) : null}
                                    <div
                                      className={cn(
                                        "flex items-center justify-end gap-1 text-[9px]",
                                        m.fromMe
                                          ? "text-primary-foreground/70"
                                          : "text-muted-foreground",
                                      )}
                                    >
                                      {format(new Date(m.timestamp), "HH:mm")}
                                      {m.fromMe ? (
                                        <StatusTick status={m.status} />
                                      ) : null}
                                    </div>
                                  </ContextMenuTrigger>
                                  <ContextMenuContent>
                                    <div className="flex gap-1 p-1">
                                      {REACTION_EMOJIS.map((emoji) => (
                                        <ContextMenuItem
                                          key={emoji}
                                          className="size-9 justify-center rounded-full p-0 text-lg"
                                          onClick={() => sendReaction(m, emoji)}
                                        >
                                          {emoji}
                                        </ContextMenuItem>
                                      ))}
                                    </div>
                                    <ContextMenuSeparator />
                                    {m.body ? (
                                      <ContextMenuItem
                                        onClick={() => copyMessage(m)}
                                      >
                                        <HugeiconsIcon
                                          icon={Copy01Icon}
                                          strokeWidth={2}
                                        />
                                        {t("copy")}
                                      </ContextMenuItem>
                                    ) : null}
                                    <ContextMenuItem
                                      variant="destructive"
                                      onClick={() => deleteMessage(m)}
                                    >
                                      <HugeiconsIcon
                                        icon={Delete02Icon}
                                        strokeWidth={2}
                                      />
                                      {t("deleteMessage")}
                                    </ContextMenuItem>
                                  </ContextMenuContent>
                                  </ContextMenu>
                                  <ReactionsRow reactions={m.reactions} />
                                </div>
                              </div>
                            </Fragment>
                          )
                        })
                      )}
                      <div ref={scrollBottomRef} />
                    </div>
                  </ScrollArea>

                  {canSend ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        handleSend()
                      }}
                      className="flex shrink-0 items-center gap-2 border-t p-3"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={handleFilePicked}
                        accept="image/*,video/*,audio/*,application/pdf"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t("attach")}
                        disabled={sending}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        📎
                      </Button>
                      <Input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder={t("messagePlaceholder")}
                        disabled={sending}
                      />
                      <Button type="submit" disabled={sending || !draft.trim()}>
                        {sending ? t("sending") : t("send")}
                      </Button>
                    </form>
                  ) : (
                    <div className="border-t p-3 text-center text-xs text-muted-foreground">
                      {t("noPermissionSend")}
                    </div>
                  )}
                </>
              )}
            </div>
          </ResizablePanel>

          {/* Sağ: detay sidebar (3. panel) — başlık/üye tıklayınca açılır */}
          {detail ? (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="wa-detail"
                defaultSize="26%"
                minSize="18%"
                maxSize="42%"
              >
                <div className="flex h-full min-h-0 flex-col border-s bg-card">
                  <div className="flex items-center justify-between border-b p-3">
                    <span className="text-sm font-medium">
                      {detailContact?.isGroup
                        ? t("groupDetails")
                        : t("contactDetails")}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("close")}
                      onClick={() => setDetail(null)}
                    >
                      ✕
                    </Button>
                  </div>
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="flex flex-col gap-5 p-4">
                      <div className="flex flex-col items-center gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (detailContact?.avatarUrl)
                              openLightbox({
                                id: detailContact.jid,
                                url: detailContact.avatarUrl,
                                name: detailDisplayName,
                                mimeType: "image/jpeg",
                              })
                          }}
                          className={cn(
                            "rounded-full outline-none",
                            detailContact?.avatarUrl && "cursor-zoom-in",
                          )}
                          aria-label={t("enlargeAvatar")}
                        >
                          <ContactAvatar
                            contact={
                              detailContact ?? {
                                jid: detail.jid,
                                avatarUrl: null,
                                isGroup: false,
                              }
                            }
                            size="size-28"
                          />
                        </button>
                        <div className="flex flex-col items-center gap-1 text-center">
                          <h3 className="break-all text-lg font-semibold">
                            {detailDisplayName}
                          </h3>
                          {detailContact?.isGroup ? (
                            <span className="text-sm text-muted-foreground">
                              {t("group")}
                            </span>
                          ) : detailPhone ? (
                            <span className="text-sm text-muted-foreground">
                              +{detailPhone}
                            </span>
                          ) : null}
                        </div>
                        {!detailIsActive &&
                        detail.jid.endsWith("@s.whatsapp.net") ? (
                          <Button
                            type="button"
                            size="sm"
                            className="mt-1"
                            onClick={() => {
                              const j = detail.jid
                              setDetail(null)
                              void openChat(j)
                            }}
                          >
                            {t("openConversation")}
                          </Button>
                        ) : null}
                      </div>

                      {/* Özel isim — WhatsApp adını override eder (kayıtlı kişi) */}
                      {detailContact && !detailContact.isGroup ? (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs font-medium text-muted-foreground">
                            {t("customNameLabel")}
                          </span>
                          {renaming ? (
                            <div className="flex items-center gap-1.5">
                              <Input
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                placeholder={t("customNamePlaceholder")}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    void renameContact(
                                      detailContact,
                                      renameValue.trim() || null,
                                    )
                                    setRenaming(false)
                                  }
                                  if (e.key === "Escape") setRenaming(false)
                                }}
                              />
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                  void renameContact(
                                    detailContact,
                                    renameValue.trim() || null,
                                  )
                                  setRenaming(false)
                                }}
                              >
                                {t("save")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setRenaming(false)}
                              >
                                {t("cancel")}
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
                              <span className="truncate">
                                {detailContact.customName || (
                                  <span className="text-muted-foreground">
                                    {t("noCustomName")}
                                  </span>
                                )}
                              </span>
                              <div className="flex shrink-0 gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setRenameValue(detailContact.customName || "")
                                    setRenaming(true)
                                  }}
                                >
                                  {t("edit")}
                                </Button>
                                {detailContact.customName ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      void renameContact(detailContact, null)
                                    }
                                  >
                                    {t("clear")}
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}

                      {/* Paylaşılan medya / döküman / link — yalnız açık sohbet */}
                      {detailIsActive ? (
                      <Tabs
                        value={sharedTab}
                        onValueChange={(v) =>
                          setSharedTab(v as "media" | "docs" | "links")
                        }
                      >
                        <TabsList className="w-full">
                          <TabsTrigger value="media" className="flex-1">
                            {t("sharedMedia")}
                          </TabsTrigger>
                          <TabsTrigger value="docs" className="flex-1">
                            {t("sharedDocs")}
                          </TabsTrigger>
                          <TabsTrigger value="links" className="flex-1">
                            {t("sharedLinks")}
                          </TabsTrigger>
                        </TabsList>
                        <div className="mt-3">
                          {sharedLoading ? (
                            <p className="py-6 text-center text-xs text-muted-foreground">
                              {t("loading")}
                            </p>
                          ) : shared.length === 0 ? (
                            <p className="py-6 text-center text-xs text-muted-foreground">
                              {t("sharedEmpty")}
                            </p>
                          ) : sharedTab === "media" ? (
                            <div className="grid grid-cols-3 gap-1.5">
                              {shared.map((m) => {
                                const url = `${sessionBase}/media/${m.mediaId}`
                                return m.type === "video" ? (
                                  <video
                                    key={m.waMessageId}
                                    src={url}
                                    className="aspect-square w-full rounded-md object-cover"
                                  />
                                ) : (
                                  <button
                                    key={m.waMessageId}
                                    type="button"
                                    onClick={() =>
                                      openLightbox({
                                        id: m.mediaId!,
                                        url,
                                        name: m.fileName || "image",
                                        mimeType: m.mimetype || undefined,
                                      })
                                    }
                                    className="aspect-square overflow-hidden rounded-md"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={url}
                                      alt=""
                                      className="size-full object-cover"
                                    />
                                  </button>
                                )
                              })}
                            </div>
                          ) : sharedTab === "docs" ? (
                            <div className="flex flex-col gap-1.5">
                              {shared.map((m) => (
                                <a
                                  key={m.waMessageId}
                                  href={`${sessionBase}/media/${m.mediaId}`}
                                  download={m.fileName || undefined}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs no-underline transition-colors hover:bg-muted/40"
                                >
                                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-foreground/10">
                                    📄
                                  </span>
                                  <span className="truncate">
                                    {m.fileName || t("document")}
                                  </span>
                                </a>
                              ))}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              {shared.map((m) =>
                                m.linkPreview ? (
                                  <LinkPreviewCard
                                    key={m.waMessageId}
                                    preview={m.linkPreview}
                                    fromMe={false}
                                  />
                                ) : null,
                              )}
                            </div>
                          )}
                        </div>
                      </Tabs>
                      ) : null}
                    </div>
                  </ScrollArea>
                </div>
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      )}

      {/* Görsel/avatar büyütme — mevcut lightbox bileşeni */}
      {lightboxItems.length > 0 ? (
        <FilePreviewLightbox
          open={lightboxOpen}
          onOpenChange={setLightboxOpen}
          items={lightboxItems}
        />
      ) : null}
    </div>
  )
}
