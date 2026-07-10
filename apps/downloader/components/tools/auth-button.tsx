"use client"

import { useEffect, useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { Login01Icon, Logout01Icon } from "@hugeicons/core-free-icons"
import {
  useSession,
  signOutAndRedirectToCore,
} from "@workspace/auth/client/auth-client"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@workspace/ui/components/dropdown-menu"

/**
 * Opsiyonel login butonu (tools header). Oturum yoksa "Sign in" → core login
 * (callback ile mevcut sayfaya döner). Oturum varsa avatar + dropdown (Logout).
 * better-auth client relative `/api/auth/*` çağırır → next.config rewrite ile
 * core'a gider; cross-subdomain `.sentroy.com` cookie sayesinde oturum görünür.
 * Anonim kullanım hiç bozulmaz — bu yalnızca bir affordance.
 */
export function ToolsAuthButton() {
  const { data: session, isPending } = useSession()
  const t = useTranslations("d")
  const lang = useLocale()
  const [loginHref, setLoginHref] = useState("")

  useEffect(() => {
    const core = process.env.NEXT_PUBLIC_CORE_APP_URL || ""
    const cb = encodeURIComponent(window.location.href)
    setLoginHref(`${core}/${lang}/login?callbackUrl=${cb}`)
  }, [lang])

  if (isPending) {
    return <div className="size-8 animate-pulse rounded-full bg-muted" aria-hidden />
  }

  if (!session?.user) {
    return (
      <a
        href={loginHref || "#"}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-3xl border border-border/60 px-3.5 text-sm font-medium transition-colors hover:bg-muted"
      >
        <HugeiconsIcon icon={Login01Icon} strokeWidth={2} className="size-4" />
        {t("toolsSignIn")}
      </a>
    )
  }

  const user = session.user
  const name = user.name || user.email || "?"
  const initial = name.charAt(0).toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={name}
            className="flex size-8 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-sm font-semibold text-primary outline-none ring-offset-2 transition-all hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring/40 aria-expanded:ring-2 aria-expanded:ring-ring/40"
          />
        }
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt={name} className="size-full object-cover" />
        ) : (
          initial
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col">
              <span className="truncate text-sm font-medium">{user.name || t("toolsAccount")}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOutAndRedirectToCore(lang)}>
          <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} className="size-4" />
          {t("toolsSignOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
