"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ShieldKeyIcon,
  Delete02Icon,
  GlobalIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { PageTransition } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { confirm } from "@workspace/console/stores/confirm"

/**
 * "Connected apps" — kullanıcının "Sign in with Sentroy" ile yetkilendirdiği
 * üçüncü parti uygulamaları listeler. Revoke cascading'i siler:
 *   - oauth_consents → bir sonraki authorize'da yeniden onay sorulur
 *   - oauth_access_tokens revoke → /userinfo 401 döner
 *   - oauth_refresh_tokens revoke → refresh akışı invalid_grant
 */

interface ConnectedApp {
  consentId: string
  clientId: string
  name: string
  description: string | null
  homepageUrl: string | null
  logoUrl: string | null
  scopes: string[]
  grantedAt: string
  updatedAt: string
}

export function ConnectedAppsContent() {
  const t = useTranslations("connectedApps")
  const [apps, setApps] = useState<ConnectedApp[]>([])
  const [loading, setLoading] = useState(true)

  const SCOPE_LABEL: Record<string, string> = {
    openid: t("scopeOpenid"),
    profile: t("scopeProfile"),
    email: t("scopeEmail"),
    offline_access: t("scopeOffline"),
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/profile/connected-apps")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("loadFailed"))
      setApps(json.data ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  async function revoke(app: ConnectedApp) {
    const ok = await confirm({
      title: t("revokeConfirmTitle", { name: app.name }),
      description: t("revokeConfirmDescription"),
      confirmText: t("revokeConfirm"),
      destructive: true,
    })
    if (!ok) return
    const res = await fetch(`/api/profile/connected-apps/${app.clientId}`, {
      method: "DELETE",
    })
    if (res.ok) {
      toast.success(t("revoked", { name: app.name }))
      load()
    } else {
      const json = await res.json().catch(() => ({}))
      toast.error(json.error || t("revokeFailed"))
    }
  }

  return (
    <PageTransition>
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-2 border-b pb-5">
          <div className="inline-flex w-fit items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            <HugeiconsIcon icon={ShieldKeyIcon} strokeWidth={2} className="size-3" />
            {t("subtitle")}
          </div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </header>

        <ScrollArea className="min-h-0">
          {loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          ) : apps.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t("empty")}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {apps.map((app) => (
                <AppCard
                  key={app.consentId}
                  app={app}
                  scopeLabel={SCOPE_LABEL}
                  onRevoke={() => revoke(app)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </PageTransition>
  )
}

function AppCard({
  app,
  scopeLabel,
  onRevoke,
}: {
  app: ConnectedApp
  scopeLabel: Record<string, string>
  onRevoke: () => void
}) {
  const t = useTranslations("connectedApps")
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{app.name}</h3>
          </div>
          {app.description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {app.description}
            </p>
          ) : null}
          {app.homepageUrl ? (
            <a
              href={app.homepageUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon icon={GlobalIcon} strokeWidth={2} className="size-3" />
              {(() => {
                try {
                  return new URL(app.homepageUrl).hostname
                } catch {
                  return app.homepageUrl
                }
              })()}
            </a>
          ) : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRevoke}
          className="shrink-0 text-destructive hover:text-destructive"
        >
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} data-icon="inline-start" />
          {t("revoke")}
        </Button>
      </div>

      <div className="mt-3 rounded-md bg-muted/30 p-3">
        <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          {t("scopesIntro", { name: app.name })}
        </p>
        <ul className="flex flex-col gap-1 text-xs">
          {app.scopes.map((s) => (
            <li key={s} className="flex items-center gap-1.5">
              <HugeiconsIcon
                icon={Tick02Icon}
                strokeWidth={2}
                className="size-3 text-emerald-500"
              />
              {scopeLabel[s] ?? s}
              <Badge variant="outline" className="ml-1 px-1 py-0 text-[9px]">
                {s}
              </Badge>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-2 text-[10.5px] text-muted-foreground">
        {t("grantedAt", { date: new Date(app.grantedAt).toLocaleDateString() })}
        {app.updatedAt !== app.grantedAt
          ? t("lastExpanded", { date: new Date(app.updatedAt).toLocaleDateString() })
          : null}
      </div>
    </div>
  )
}
