"use client"

import { format, formatDistanceToNow } from "date-fns"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  StarIcon,
  Attachment01Icon,
  SpamIcon,
  Tick02Icon,
  Megaphone01Icon,
  Alert01Icon,
  ReceiptDollarIcon,
  UserGroupIcon,
  InboxIcon,
} from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"
import { confirm } from "@workspace/console/stores/confirm"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { SenderAvatar } from "@/components/inbox/sender-avatar"

export interface MessageAddress {
  name: string
  address: string
}

export interface MessageSummary {
  uid: string
  from: MessageAddress
  to: MessageAddress[]
  subject: string
  date: string
  unread?: boolean
  flagged?: boolean
  hasAttachments?: boolean
  messageId?: string | null
  inReplyTo?: string | null
  /** Body preview — first lines of plain-text body if the server
   *  expanded it. Used by the AI categorizer for ambiguous subjects. */
  preview?: string | null
  /** True when `List-Unsubscribe` header is present — strong signal
   *  the message is bulk (Promotions/Updates/Social). */
  hasListUnsubscribe?: boolean
  /** Server-side kategori — mail-server teslimatta IMAP keyword olarak
   *  damgalar; list yanıtıyla gelir. Sender-rule overlay'i bunun üzerine
   *  yazabilir. */
  category?: string | null
}

interface MessageListItemProps {
  message: MessageSummary
  isSelected: boolean
  showRecipient?: boolean
  threadCount?: number
  /** Thread'teki tum mesajlar — katilimci listesi ve avatar'lar icin */
  threadMessages?: MessageSummary[]
  /** Kullanicinin kendi mailbox'i — "Siz" gosterimi icin */
  currentMailbox?: string | null
  /** Bulk-select state — `true` if this row's UID(s) sit in the
   *  active selection. When any rows are selected anywhere in the
   *  list, `selectionActive` should also be true so checkboxes stop
   *  hiding behind hover-only visibility. */
  isMultiSelected?: boolean
  selectionActive?: boolean
  /** Click handler for the checkbox. Receives the native event so
   *  the caller can detect shift-click for range-selection. */
  onToggleMultiSelect?: (e: React.MouseEvent) => void
  onClick: () => void
  onToggleFlag?: () => void
  onMoveToSpam?: () => void
  /** AI-classified category (promotions/updates/receipts/social/primary).
   *  When present, renders as a tinted pill next to the subject so the
   *  user reads "Newsletter" without clicking through. */
  category?: string | null
  /** Right-click → caller opens a Gmail-style context menu (mirror
   *  of the message-detail dot menu). The wrapping <div>'s native
   *  context menu is preempted so the user gets the Sentroy menu
   *  instead of the browser one. */
  onContextMenu?: (e: React.MouseEvent) => void
  /** Satır yoğunluğu. Caller (inbox-content) localStorage'dan okur,
   *  bir toggle ile değiştirir, hep aynı değeri tüm satırlara geçirir. */
  density?: MessageListDensity
}

function formatAddress(addr?: MessageAddress): string {
  if (!addr) return ""
  if (addr.name && addr.name.trim()) return addr.name.trim()
  return addr.address || ""
}

function formatRecipientList(list: MessageAddress[]): string {
  if (!list || list.length === 0) return ""
  const first = formatAddress(list[0])
  if (list.length === 1) return first
  return `${first} +${list.length - 1}`
}

function getInitials(name: string): string {
  const parts = name.split(/[\s@.]/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

/** Thread'teki benzersiz katilimcilari cikarir (adres bazli dedupe). */
function getThreadParticipants(
  messages: MessageSummary[],
  currentMailbox?: string | null,
  selfLabel = "Siz",
): { names: string[]; initials: string[] } {
  const seen = new Set<string>()
  const names: string[] = []
  const initials: string[] = []

  for (const msg of messages) {
    const addr = msg.from.address.toLowerCase()
    if (seen.has(addr)) continue
    seen.add(addr)

    const isSelf = currentMailbox
      ? addr === currentMailbox.toLowerCase()
      : false
    const display = isSelf
      ? selfLabel
      : msg.from.name?.trim() || msg.from.address.split("@")[0]

    names.push(display)
    initials.push(getInitials(isSelf ? selfLabel : display))
  }

  return { names, initials }
}

/** Tone + icon palette for the inline category chip — kept tight to
 *  the five buckets the AI classifier emits. Keys mirror the
 *  inbox.ruleCategory_* i18n labels. Render icon yerine kategori
 *  adını yazmak yerine küçük bir tinted disc içinde sembol gösterir;
 *  satır gürültüsü düşer, tarama hızlanır. */
const CATEGORY_TONE: Record<
  string,
  { tint: string; icon: typeof StarIcon }
> = {
  promotions: {
    tint: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
    icon: Megaphone01Icon,
  },
  updates: {
    tint: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    icon: Alert01Icon,
  },
  receipts: {
    tint: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    icon: ReceiptDollarIcon,
  },
  social: {
    tint: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
    icon: UserGroupIcon,
  },
  primary: {
    tint: "bg-muted text-foreground",
    icon: InboxIcon,
  },
}

/** Mesaj listesi yoğunluğu. `comfortable` mevcut sürüm; `compact` daha
 *  az dikey padding ve daha küçük tipografi ile ekrana ~%30 daha fazla
 *  satır sığdırır — yoğun gelen kutusunu tarayanlar için tercih edilir. */
export type MessageListDensity = "comfortable" | "compact"

export function MessageListItem({
  message,
  isSelected,
  showRecipient = false,
  threadCount,
  threadMessages,
  currentMailbox,
  isMultiSelected = false,
  selectionActive = false,
  onToggleMultiSelect,
  onClick,
  onToggleFlag,
  onMoveToSpam,
  category,
  onContextMenu,
  density = "comfortable",
}: MessageListItemProps) {
  const t = useTranslations("inbox")
  const compact = density === "compact"

  const isThread = threadCount != null && threadCount > 1

  // Tek mesaj: normal sender. Thread: katilimci listesi.
  let displayName: string
  let avatarInitials: string[] | null = null

  if (isThread && threadMessages && threadMessages.length > 1) {
    const participants = getThreadParticipants(
      threadMessages,
      currentMailbox,
      t("selfLabel"),
    )
    avatarInitials = participants.initials.slice(0, 3)
    const maxShow = 2
    if (participants.names.length <= maxShow) {
      displayName = participants.names.join(", ")
    } else {
      displayName = `${participants.names.slice(0, maxShow).join(", ")} +${participants.names.length - maxShow}`
    }
  } else {
    displayName = showRecipient
      ? formatRecipientList(message.to)
      : formatAddress(message.from)
  }

  let relativeDate = ""
  let absoluteDate = ""
  try {
    const d = new Date(message.date)
    relativeDate = formatDistanceToNow(d, { addSuffix: true })
    absoluteDate = format(d, "PPpp")
  } catch {
    relativeDate = message.date
    absoluteDate = message.date
  }

  // The checkbox slot replaces the avatar visually whenever multi-select
  // is engaged anywhere in the list — keeps the row width identical to
  // normal mode so the layout doesn't jump when the user toggles their
  // first selection. On hover (no active selection) it shows alongside
  // the avatar via opacity, so a single click can flip into bulk mode.
  const showCheckboxOverlay =
    !!onToggleMultiSelect && (selectionActive || isMultiSelected)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        // Modifier-click promotes the row click into a selection
        // toggle — Gmail-style. Without this the only way to bulk-
        // select was the checkbox overlay, which the avatar's
        // SenderAvatar swallowed events from. Cmd/Ctrl = toggle,
        // Shift = range (handled by parent via lastSelectedUid).
        if (onToggleMultiSelect && (e.metaKey || e.ctrlKey || e.shiftKey)) {
          e.preventDefault()
          onToggleMultiSelect(e)
          return
        }
        onClick()
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick()
        }
      }}
      onContextMenu={(e) => {
        // Right-click → caller's Sentroy-styled menu (mirror of the
        // message-detail dot menu). Pre-empt the browser menu so
        // users get a consistent experience across the row, the
        // detail wrapper, and individual thread messages.
        if (onContextMenu) {
          e.preventDefault()
          onContextMenu(e)
        }
      }}
      className={cn(
        // `select-none` — bulk-select via shift-click highlights an
        // entire run of rows; the browser's text-selection layer was
        // catching the same drag and painting an unsightly blue
        // rectangle on top. Disabling user-select keeps the row
        // strictly action-driven.
        "group/msg relative flex w-full cursor-pointer select-none items-start rounded-xl text-start transition-colors",
        // Comfortable: oluşan listenin oklu Gmail benzeri "rahat"
        // formu — büyük tap target. Compact: yoğun gelen kutusu
        // tarayıcılar için ekrana ~%30 daha fazla satır sığar.
        compact ? "gap-1.5 px-2 py-1.5" : "gap-2 px-3 py-2.5",
        "hover:bg-muted/50",
        // Unread vurgusu — sol kenar primary çizgisi + hafif tinted
        // arka plan + hover'da koyulaşma. Stacked-initials avatar dot'u
        // tek başına yetersiz (özellikle yoğun listede). Tüm satıra
        // okunmamış sinyali yayar.
        message.unread &&
          "bg-primary/[0.04] before:absolute before:left-0 before:w-[3px] before:rounded-r before:bg-primary hover:bg-primary/[0.07]",
        message.unread && (compact ? "before:inset-y-1" : "before:inset-y-2"),
        isSelected && "bg-muted",
        isMultiSelected && "bg-primary/5 ring-1 ring-primary/20",
      )}
    >
      {/* Avatar slot — multi-select swaps the avatar out for a checkbox
          so the row shape stays stable. On hover (no active selection)
          a small checkbox overlays the avatar so the first click can
          flip into bulk mode without moving the cursor.

          The slot itself is the click target (not the inner Checkbox)
          because base-ui's Checkbox renders a focusable button that
          stops event propagation, which made the previous version
          ignore taps. Now the wrapper handles selection and the
          Checkbox is purely presentational. */}
      <div
        className="relative mt-0.5 shrink-0"
        onClick={(e) => {
          if (!onToggleMultiSelect) return
          e.stopPropagation()
          e.preventDefault()
          onToggleMultiSelect(e)
        }}
        role={onToggleMultiSelect ? "button" : undefined}
        aria-label={
          onToggleMultiSelect
            ? isMultiSelected
              ? "Deselect message"
              : "Select message"
            : undefined
        }
      >
        {avatarInitials ? (
          <div className={cn("flex", compact ? "-space-x-1" : "-space-x-1.5")}>
            <div className="z-20 rounded-full ring-2 ring-background">
              <SenderAvatar
                email={message.from?.address || ""}
                name={message.from?.name}
                initials={avatarInitials[0]}
                size={compact ? "xs" : "sm"}
                variant="primary"
              />
            </div>
            {avatarInitials.slice(1).map((ini, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center justify-center rounded-full border-2 border-background font-semibold",
                  compact ? "size-5 text-[8px]" : "size-6 text-[9px]",
                  i === 0
                    ? "z-10 bg-muted text-muted-foreground"
                    : "z-0 bg-muted/70 text-muted-foreground/70",
                )}
              >
                {ini}
              </div>
            ))}
          </div>
        ) : (
          <SenderAvatar
            email={message.from?.address || ""}
            name={message.from?.name}
            initials={getInitials(formatAddress(message.from))}
            size={compact ? "xs" : "sm"}
            variant="primary"
          />
        )}
        {message.unread && (
          <span
            aria-hidden
            className="absolute -left-0.5 -top-0.5 size-2 rounded-full bg-primary ring-2 ring-background"
          />
        )}
        {/* Selection indicator — fully covers the avatar slot as a
            circle so the row geometry never shifts. Click handling
            lives on the wrapper above; this layer is presentational
            (`pointer-events-none`).
            • selected → solid primary disc with check icon
            • hover (no selection) → soft scrim + faint outline so the
              user knows tapping the avatar will select. */}
        {onToggleMultiSelect ? (
          <div
            className={cn(
              // z-30 sits ABOVE the thread's stacked-initials cluster
              // (which uses z-0/z-10/z-20). Without the bump the
              // selection check-icon was hiding behind the third
              // initial chip on multi-participant threads.
              "pointer-events-none absolute z-30 inset-0 flex items-center justify-center rounded-full transition-all",
              isMultiSelected
                ? "bg-primary text-primary-foreground opacity-100 shadow-sm"
                : showCheckboxOverlay
                  ? "bg-background/80 ring-1 ring-inset ring-border opacity-100"
                  : "bg-background/70 ring-1 ring-inset ring-border/70 opacity-0 group-hover/msg:opacity-100",
            )}
          >
            <HugeiconsIcon
              icon={Tick02Icon}
              strokeWidth={2.5}
              className={cn(
                "size-3.5 transition-opacity",
                isMultiSelected
                  ? "opacity-100"
                  : "opacity-60",
              )}
            />
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          "flex min-w-0 flex-1",
          // Compact: tek satırda sender · subject — boşluk daha sıkı,
          // overflow truncate'le aşılır. Comfortable: iki satır
          // (sender üstte, subject altında).
          compact ? "items-center gap-2" : "flex-col gap-0.5",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between gap-2",
            compact && "min-w-0 flex-1",
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                "truncate text-sm",
                compact && "shrink-0 max-w-[40%]",
                message.unread
                  ? "font-semibold text-foreground"
                  : "font-normal text-muted-foreground/80",
              )}
            >
              {displayName || "(no sender)"}
            </span>
            {isThread && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted px-1 text-[10px] font-medium text-muted-foreground">
                      {threadCount}
                    </span>
                  }
                />
                <TooltipContent>
                  {t("threadCountTooltip", { count: threadCount ?? 0 })}
                </TooltipContent>
              </Tooltip>
            )}
            {compact ? (
              <span
                className={cn(
                  "min-w-0 truncate text-sm",
                  message.unread
                    ? "font-medium text-foreground"
                    : "font-normal text-muted-foreground/70",
                )}
              >
                <span className="text-muted-foreground/40">·</span>{" "}
                {message.subject || "(no subject)"}
              </span>
            ) : null}
          </span>
          {!compact ? (
            <span className="flex items-center gap-1.5 shrink-0">
              {message.hasAttachments && (
                <HugeiconsIcon
                  icon={Attachment01Icon}
                  strokeWidth={2}
                  className={cn(
                    "size-3",
                    message.unread
                      ? "text-muted-foreground"
                      : "text-muted-foreground/60",
                  )}
                />
              )}
              {/* Relative date by default; hover/focus reveals the
                  full timestamp via tooltip. Cheap way to give the
                  user precise context without sacrificing the scan-
                  friendly "2h ago" default. */}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      className={cn(
                        "text-xs",
                        message.unread
                          ? "text-muted-foreground"
                          : "text-muted-foreground/60",
                      )}
                    >
                      {relativeDate}
                    </span>
                  }
                />
                <TooltipContent>{absoluteDate}</TooltipContent>
              </Tooltip>
            </span>
          ) : null}
        </div>
        <div
          className={cn(
            "flex items-center gap-2",
            compact && "shrink-0",
          )}
        >
          {!compact ? (
            <span
              className={cn(
                "truncate text-sm flex-1",
                message.unread
                  ? "font-medium text-foreground"
                  : "font-normal text-muted-foreground/70",
              )}
            >
              {message.subject || "(no subject)"}
            </span>
          ) : null}

          {/* AI category chip — yazı yerine kategori sembolü; kullanıcı
              tek bakışta hangi bucket'a düştüğünü görür, satır gürültüsü
              azalır. Tooltip insan-okur etiketi verir. Default `primary`
              bucket gösterilmez (tüm "gerçek" mailler buraya düşer,
              ikon her satırda noise olur). */}
          {category && category !== "primary" && CATEGORY_TONE[category] ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center justify-center rounded-full",
                      compact ? "size-4" : "size-5",
                      CATEGORY_TONE[category].tint,
                    )}
                    aria-label={t(`ruleCategory_${category}`)}
                  >
                    <HugeiconsIcon
                      icon={CATEGORY_TONE[category].icon}
                      strokeWidth={2}
                      className={compact ? "size-2.5" : "size-3"}
                    />
                  </span>
                }
              />
              <TooltipContent>{t(`ruleCategory_${category}`)}</TooltipContent>
            </Tooltip>
          ) : null}

          {compact ? (
            <span className="flex shrink-0 items-center gap-1.5">
              {message.hasAttachments && (
                <HugeiconsIcon
                  icon={Attachment01Icon}
                  strokeWidth={2}
                  className={cn(
                    "size-3",
                    message.unread
                      ? "text-muted-foreground"
                      : "text-muted-foreground/60",
                  )}
                />
              )}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        message.unread
                          ? "text-muted-foreground"
                          : "text-muted-foreground/60",
                      )}
                    >
                      {relativeDate}
                    </span>
                  }
                />
                <TooltipContent>{absoluteDate}</TooltipContent>
              </Tooltip>
            </span>
          ) : null}

          {/* Action buttons — hover'da gorunur */}
          <div
            className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100 data-[flagged=true]:opacity-100"
            data-flagged={message.flagged || undefined}
          >
            {onToggleFlag && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleFlag()
                      }}
                      className={cn(
                        "inline-flex size-5 items-center justify-center rounded-md hover:bg-foreground/10",
                        message.flagged && "text-amber-500 opacity-100",
                      )}
                    >
                      <HugeiconsIcon
                        icon={StarIcon}
                        strokeWidth={2}
                        className={cn(
                          "size-3.5",
                          message.flagged && "fill-current",
                        )}
                      />
                    </button>
                  }
                />
                <TooltipContent>
                  {message.flagged ? t("unfavorite") : t("favorite")}
                </TooltipContent>
              </Tooltip>
            )}
            {onMoveToSpam && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={async (e) => {
                        e.stopPropagation()
                        const ok = await confirm({
                          title: t("moveToSpam"),
                          description: t("moveToSpamConfirm"),
                          confirmText: t("moveToSpam"),
                          destructive: true,
                        })
                        if (ok) onMoveToSpam()
                      }}
                      className="inline-flex size-5 items-center justify-center rounded-md hover:bg-foreground/10 hover:text-destructive"
                    >
                      <HugeiconsIcon
                        icon={SpamIcon}
                        strokeWidth={2}
                        className="size-3.5"
                      />
                    </button>
                  }
                />
                <TooltipContent>{t("moveToSpam")}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
