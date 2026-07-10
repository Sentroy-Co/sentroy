"use client"

import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { Notification01Icon, NotificationBlock01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { usePush } from "@/hooks/use-push"

/**
 * Push bildirim aç/kapa (per-user, per-tarayıcı). Yalnız desteklenen ortamda
 * görünür (VAPID key + serviceWorker/PushManager). İzin reddedildiyse disable.
 */
export function PushToggle() {
  const { supported, subscribed, busy, permission, subscribe, unsubscribe } =
    usePush()
  const t = useTranslations("linearLite.layout.push")

  if (!supported) return null
  const denied = permission === "denied"

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={busy || denied}
      title={denied ? t("denied") : subscribed ? t("on") : t("off")}
      aria-label={denied ? t("denied") : subscribed ? t("on") : t("off")}
      onClick={() => (subscribed ? unsubscribe() : subscribe())}
    >
      <HugeiconsIcon
        icon={subscribed ? Notification01Icon : NotificationBlock01Icon}
        className="size-4"
        strokeWidth={2}
      />
    </Button>
  )
}
