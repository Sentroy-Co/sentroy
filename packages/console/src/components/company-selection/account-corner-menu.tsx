"use client"

import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import {
  useSession,
  signOutAndRedirectToCore,
} from "@workspace/auth/client/auth-client"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Button } from "@workspace/ui/components/button"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Logout01Icon,
  MicrosoftAdminIcon,
  CheckmarkBadge01Icon,
} from "@hugeicons/core-free-icons"

/**
 * Company seçim ekranının sağ üst köşesinde duran kompakt avatar menü.
 * Kullanıcı henüz bir company'ye girmediği için sidebar (NavUser) yok —
 * bu menü hesap kontrolünü (admin'e git, logout) sağlar.
 */
export function AccountCornerMenu() {
  const { data: session } = useSession()
  const router = useRouter()
  const params = useParams()
  const t = useTranslations("nav")
  const lang = (params.lang as string) || "en"

  const user = session?.user
  const userName = user?.name ?? ""
  const userEmail = user?.email ?? ""
  const userImage = user?.image ?? ""
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  const isAdmin =
    (user as { role?: string } | undefined)?.role === "admin"

  function handleLogout() {
    void signOutAndRedirectToCore(lang)
  }

  if (!user) return null

  return (
    <div className="absolute right-4 top-4 z-10">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-9 rounded-full p-0"
              aria-label={userName || userEmail}
            />
          }
        >
          <Avatar className="size-9">
            <AvatarImage src={userImage} alt={userName} />
            <AvatarFallback className="text-xs">
              {initials || "?"}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel className="flex items-center gap-2 p-2">
            <Avatar className="size-8">
              <AvatarImage src={userImage} alt={userName} />
              <AvatarFallback className="text-xs">
                {initials || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-start text-sm leading-tight">
              <span className="truncate font-medium">{userName || userEmail}</span>
              {userName && (
                <span className="truncate text-xs text-muted-foreground">
                  {userEmail}
                </span>
              )}
            </div>
            {(user as { emailVerified?: boolean }).emailVerified && (
              <HugeiconsIcon
                icon={CheckmarkBadge01Icon}
                strokeWidth={2}
                className="size-4 text-emerald-600 dark:text-emerald-400"
              />
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {isAdmin && (
            <>
              <DropdownMenuItem
                onClick={() => router.push(`/${lang}/admin`)}
              >
                <HugeiconsIcon
                  icon={MicrosoftAdminIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("admin")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={handleLogout}>
            <HugeiconsIcon
              icon={Logout01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
