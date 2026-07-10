"use client"

import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { formatDistanceToNow } from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Notification03Icon,
  Mail01Icon,
  Delete02Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { EmptyState } from "@workspace/console/components/shared"
import { cn } from "@workspace/ui/lib/utils"
import {
  useNotificationsStore,
  type AppNotification,
} from "@workspace/console/stores/notifications"

function NotificationRow({
  item,
  onClick,
  onRemove,
}: {
  item: AppNotification
  onClick: () => void
  onRemove: () => void
}) {
  let time = ""
  try {
    time = formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })
  } catch {
    time = ""
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick()
        }
      }}
      className={cn(
        "group flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-colors",
        "hover:bg-muted/50",
        !item.read && "bg-primary/5",
      )}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <HugeiconsIcon icon={Mail01Icon} strokeWidth={2} className="size-4" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-sm",
              !item.read ? "font-semibold" : "font-normal",
            )}
          >
            {item.title}
          </span>
          {!item.read && (
            <span className="size-1.5 shrink-0 rounded-full bg-primary" />
          )}
        </div>
        {item.description && (
          <p className="truncate text-xs text-muted-foreground">
            {item.description}
          </p>
        )}
        <span className="text-[10px] text-muted-foreground/70">{time}</span>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 group-hover:opacity-100"
        aria-label="Kaldır"
      >
        <HugeiconsIcon
          icon={Delete02Icon}
          strokeWidth={2}
          className="size-3.5"
        />
      </button>
    </div>
  )
}

export function NotificationsSheet() {
  const t = useTranslations("notifications")
  const router = useRouter()
  const { items, sheetOpen, setSheetOpen, markRead, markAllRead, remove, clear } =
    useNotificationsStore()

  const unreadCount = items.filter((i) => !i.read).length

  function handleClick(item: AppNotification) {
    markRead(item.id)
    setSheetOpen(false)
    if (!item.href) return
    // Cross-origin URL'ler (örn mail bildirimleri storage'dan tıklanırsa
    // mail.sentroy.com/...) için router.push yetersiz — full navigation gerek.
    // Absolute URL ve mevcut origin'den farklıysa window.location.assign.
    const isAbsolute = /^https?:\/\//i.test(item.href)
    if (
      isAbsolute &&
      typeof window !== "undefined" &&
      !item.href.startsWith(window.location.origin)
    ) {
      window.location.assign(item.href)
    } else {
      router.push(item.href)
    }
  }

  return (
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("title")}
            className="relative"
          >
            <HugeiconsIcon icon={Notification03Icon} strokeWidth={2} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full border-2 border-background bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
        }
      />
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader className="flex-row items-center justify-between space-y-0 border-b pb-3">
          <SheetTitle>{t("title")}</SheetTitle>
          {items.length > 0 && (
            <div className="flex items-center gap-1 pr-12">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={markAllRead}
                  className="text-xs"
                >
                  <HugeiconsIcon
                    icon={CheckmarkCircle02Icon}
                    strokeWidth={2}
                    className="size-3"
                    data-icon="inline-start"
                  />
                  {t("markAllRead")}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={clear}
                className="text-xs text-muted-foreground"
              >
                {t("clearAll")}
              </Button>
            </div>
          )}
        </SheetHeader>

        <ScrollArea className="flex-1">
          {items.length === 0 ? (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                icon={
                  <HugeiconsIcon
                    icon={Notification03Icon}
                    strokeWidth={1.5}
                  />
                }
                title={t("emptyTitle")}
                description={t("emptyDescription")}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1 p-3">
              {items.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  onClick={() => handleClick(item)}
                  onRemove={() => remove(item.id)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
