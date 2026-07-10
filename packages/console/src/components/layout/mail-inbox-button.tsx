"use client"

import { useParams } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import { InboxIcon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { useNotificationsStore } from "@workspace/console/stores/notifications"

/**
 * Header'a düşen inbox kısayol butonu — okunmamış sayısını gösterir,
 * tıklanınca mail subdomain'inde aktif company'nin /inbox sayfasına gider.
 *
 * Storage / future app'lerde mail bildirimlerini görebilmek için: header'da
 * NotificationsSheet'in yanına yerleştir. Mail kendi sidebar'ında inbox
 * navi item zaten badge'li — tekrar göstermeye gerek yok.
 */
export function MailInboxButton({
  variant = "absolute",
}: {
  /**
   * "absolute" — link mail.sentroy.com'un absolute URL'ine (cross-subdomain)
   * "relative" — current origin'de /[lang]/d/[slug]/inbox (mail app içinde)
   */
  variant?: "absolute" | "relative"
}) {
  const params = useParams<{ lang: string; "company-slug": string }>()
  const lang = params?.lang || "en"
  const slug = params?.["company-slug"]
  const count = useNotificationsStore((s) => s.inboxUnreadCount)

  if (!slug) return null

  const path = `/${lang}/d/${slug}/inbox`
  const href =
    variant === "absolute"
      ? `${process.env.NEXT_PUBLIC_MAIL_APP_URL || ""}${path}`
      : path

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="relative"
      aria-label={`Inbox${count > 0 ? ` (${count} unread)` : ""}`}
      render={<a href={href} />}
    >
      <HugeiconsIcon icon={InboxIcon} strokeWidth={2} />
      {count > 0 && (
        // Badge ikon kutusunun DIŞINA çıkıp sağ-üst köşede peek eder
        // (negative offset). Border-2 ile background'a karşı çerçevelenir,
        // küçük h-3.5 + 9+ cap "99+"'in tüm butonu kaplama sorununu çözer.
        <span className="absolute -top-1 -right-1 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full border-2 border-background bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Button>
  )
}
