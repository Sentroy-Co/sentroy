"use client"

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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@workspace/ui/components/sidebar"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  UnfoldMoreIcon,
  MicrosoftAdminIcon,
  CheckmarkBadge01Icon,
  Logout01Icon,
} from "@hugeicons/core-free-icons"
import { useParams } from "next/navigation"

export interface NavUserProps {
  /**
   * Compact trigger — avatar-only, name + email gizli. Header'a sığacak
   * minimal görünüm. Dropdown content (tıklanınca açılan menü)
   * etkilenmez, hep tam bilgiyle açılır.
   */
  compact?: boolean
}

export function NavUser({ compact = false }: NavUserProps = {}) {
  const { isMobile } = useSidebar()
  const { data: session } = useSession()
  const params = useParams()
  const t = useTranslations("nav")

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

  const lang = params.lang as string

  const handleLogout = () => {
    void signOutAndRedirectToCore(lang)
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size={compact ? "sm" : "lg"}
                className={
                  compact
                    ? "aria-expanded:bg-muted size-9 rounded-full p-0"
                    : "aria-expanded:bg-muted"
                }
                aria-label={compact ? userName || "Account" : undefined}
                title={compact ? userName : undefined}
              />
            }
          >
            <Avatar className={compact ? "size-9" : undefined}>
              <AvatarImage src={userImage} alt={userName} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            {!compact && (
              <>
                <div className="grid flex-1 text-start text-sm leading-tight">
                  <span className="truncate font-medium">{userName}</span>
                  <span className="truncate text-xs">{userEmail}</span>
                </div>
                <HugeiconsIcon
                  icon={UnfoldMoreIcon}
                  strokeWidth={2}
                  className="ms-auto size-4"
                />
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
                  <Avatar>
                    <AvatarImage src={userImage} alt={userName} />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-start text-sm leading-tight">
                    <span className="truncate font-medium">{userName}</span>
                    <span className="truncate text-xs">{userEmail}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => {
                  // Profile artık core'da company-agnostik /profile route'unda.
                  // Mail/storage subdomain'inden cross-origin olarak core'a
                  // yönlendir; same-origin'de zaten relative çalışır.
                  const coreBase =
                    process.env.NEXT_PUBLIC_CORE_APP_URL ||
                    (typeof window !== "undefined"
                      ? window.location.origin
                      : "")
                  window.location.href = `${coreBase}/${lang}/profile`
                }}
              >
                <HugeiconsIcon
                  icon={CheckmarkBadge01Icon}
                  strokeWidth={2}
                />
                {t("account")}
              </DropdownMenuItem>
              {(user as any)?.role === "admin" && (

              <DropdownMenuItem
              onClick={() => {
                const coreBase =
                  process.env.NEXT_PUBLIC_CORE_APP_URL ||
                  (typeof window !== "undefined"
                    ? window.location.origin
                    : "")
                window.open(`${coreBase}/${lang}/admin`, "_blank")
              }}
            >
              <HugeiconsIcon
                icon={MicrosoftAdminIcon}
                strokeWidth={2}
              />
              {t("admin")}
            </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} />
              {t("logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
