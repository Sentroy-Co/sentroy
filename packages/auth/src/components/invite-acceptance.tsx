"use client"

import { useEffect, useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import { useSession } from "@workspace/auth/client/auth-client"
import { Link } from "@workspace/auth/i18n/routing"
import { cn } from "@workspace/ui/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Loading03Icon,
  CheckmarkCircle02Icon,
  AlertCircleIcon,
  BuildingIcon,
  Mail01Icon,
} from "@hugeicons/core-free-icons"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { toast } from "sonner"

interface InvitePeek {
  email: string
  role: "owner" | "admin" | "member"
  company: { name: string; slug: string; avatarUrl: string | null }
  expiresAt: string
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: InvitePeek }
  | { kind: "error"; message: string; code?: number }
  | { kind: "accepted"; companySlug: string; alreadyMember: boolean }

export function InviteAcceptance({ token }: { token: string }) {
  const t = useTranslations("auth")
  const locale = useLocale()
  const { data: session, isPending: sessionLoading } = useSession()

  const [state, setState] = useState<State>({ kind: "loading" })
  const [accepting, setAccepting] = useState(false)

  // ── Peek the invite ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/invitations/${token}`)
        const json = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setState({
            kind: "error",
            message: json.error || t("invitesFetchError"),
            code: res.status,
          })
          return
        }
        setState({ kind: "ready", data: json.data as InvitePeek })
      } catch (err) {
        if (cancelled) return
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Network error",
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, t])

  async function handleAccept() {
    setAccepting(true)
    try {
      const res = await fetch(`/api/invitations/${token}/accept`, {
        method: "POST",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("invitesAcceptError"))
      const data = json.data as { companySlug: string; alreadyMember: boolean }
      setState({
        kind: "accepted",
        companySlug: data.companySlug,
        alreadyMember: data.alreadyMember,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("invitesAcceptError"))
    } finally {
      setAccepting(false)
    }
  }

  if (state.kind === "loading" || sessionLoading) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted/20 p-6 text-center">
        <HugeiconsIcon
          icon={Loading03Icon}
          strokeWidth={2}
          className="size-6 animate-spin text-muted-foreground"
        />
        <span className="text-sm font-medium">{t("invitesLoading")}</span>
      </div>
    )
  }

  if (state.kind === "error") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-6 text-center">
        <HugeiconsIcon
          icon={AlertCircleIcon}
          strokeWidth={2}
          className="size-7 text-red-600 dark:text-red-400"
        />
        <span className="text-base font-semibold">{t("invitesErrorTitle")}</span>
        <span className="text-sm text-muted-foreground">{state.message}</span>
        <Link
          href="/login"
          className="mt-2 text-sm font-medium underline underline-offset-4"
        >
          {t("forgotBackToLogin")}
        </Link>
      </div>
    )
  }

  if (state.kind === "accepted") {
    const target = `/${locale}/d/${state.companySlug}`
    if (typeof window !== "undefined") {
      setTimeout(() => {
        window.location.href = target
      }, 1500)
    }
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          strokeWidth={2}
          className="size-7 text-emerald-600 dark:text-emerald-400"
        />
        <span className="text-base font-semibold">
          {state.alreadyMember
            ? t("invitesAlreadyMember")
            : t("invitesAcceptedTitle")}
        </span>
        <span className="text-sm text-muted-foreground">
          {t("invitesAcceptedDesc")}
        </span>
      </div>
    )
  }

  // state.kind === "ready"
  const data = state.data
  const sessionEmail = (session?.user?.email ?? "").toLowerCase()
  const emailMismatch = !!sessionEmail && sessionEmail !== data.email
  const notLoggedIn = !session

  // Davet edilen kişi henüz hesap açmamışsa: signup'a yönlendir, geri dönüş için token korunur.
  // NOT: locale prefix ZORUNLU — core auth route'ları `/[lang]/login` altında;
  // prefix'siz `/login` 404 verir (kayıtsız davetlinin gördüğü hata).
  const signupHref = `/${locale}/signup?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(data.email)}`
  const loginHref = `/${locale}/login?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(data.email)}`

  return (
    <div className={cn("flex flex-col gap-5")}>
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-16 items-center justify-center overflow-hidden rounded-2xl border bg-muted/40">
          {data.company.avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={data.company.avatarUrl}
              alt={data.company.name}
              className="size-full object-cover"
            />
          ) : (
            <HugeiconsIcon
              icon={BuildingIcon}
              strokeWidth={1.6}
              className="size-7 text-muted-foreground/60"
            />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">
            {t("invitesHeading", { company: data.company.name })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("invitesAs")}{" "}
            <Badge variant="outline" className="font-medium">
              {data.role}
            </Badge>
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/20 p-3 text-center">
        <span className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <HugeiconsIcon icon={Mail01Icon} strokeWidth={2} className="size-3.5" />
          {data.email}
        </span>
      </div>

      {notLoggedIn ? (
        <div className="flex flex-col gap-2">
          <p className="text-center text-sm text-muted-foreground">
            {t("invitesSignInRequired")}
          </p>
          <a href={loginHref}>
            <Button className="w-full" variant="default">
              {t("invitesSignInToAccept")}
            </Button>
          </a>
          <a href={signupHref}>
            <Button className="w-full" variant="outline">
              {t("invitesSignUpToAccept")}
            </Button>
          </a>
        </div>
      ) : emailMismatch ? (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-center">
          <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
            {t("invitesWrongAccount")}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("invitesWrongAccountDesc", { current: sessionEmail, target: data.email })}
          </span>
          <Link
            href="/logout"
            className="mt-1 text-xs font-medium underline underline-offset-4"
          >
            {t("invitesSwitchAccount")}
          </Link>
        </div>
      ) : (
        <Button onClick={handleAccept} disabled={accepting}>
          {accepting && (
            <HugeiconsIcon
              icon={Loading03Icon}
              strokeWidth={2}
              className="animate-spin"
              data-icon="inline-start"
            />
          )}
          {t("invitesAccept")}
        </Button>
      )}
    </div>
  )
}
