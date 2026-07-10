"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Store01Icon, Copy01Icon, CheckmarkBadge01Icon, Alert02Icon, Delete02Icon } from "@hugeicons/core-free-icons"
import { PageTransition, EmptyState } from "@workspace/console/components/shared"
import { confirm } from "@workspace/console/stores/confirm"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog"

interface DevApp {
  id: string
  appId: string
  slug: string
  name: string
  status: "draft" | "pending" | "approved" | "rejected" | "suspended"
  visibility: "public" | "private"
  source: string
  currentVersion: string
  embedOrigin: string
  verificationToken: string
  originVerifiedAt: string | null
  rejectionReason: string | null
}

const STATUS_TONE: Record<string, string> = {
  approved: "bg-emerald-600",
  pending: "bg-amber-500",
  rejected: "bg-destructive",
  suspended: "bg-muted-foreground",
  draft: "bg-muted-foreground",
}
const WK_PATH = "/.well-known/sentroy-app-verification.txt"
const STATUS_KEY: Record<string, string> = {
  approved: "statusApproved",
  pending: "statusPending",
  rejected: "statusRejected",
  suspended: "statusSuspended",
  draft: "statusDraft",
}

export function AppSubmissionsContent({ slug }: { slug: string }) {
  const t = useTranslations("os")
  const [apps, setApps] = useState<DevApp[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [open, setOpen] = useState(false)
  const [manifest, setManifest] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/companies/${slug}/apps`)
      if (res.status === 403) {
        setForbidden(true)
        return
      }
      const json = await res.json()
      setApps((json?.data?.apps as DevApp[]) ?? [])
    } catch {
      toast.error(t("devConsole.loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [slug, t])

  useEffect(() => {
    void load()
  }, [load])

  async function submit(forReview: boolean) {
    let parsed: unknown
    try {
      parsed = JSON.parse(manifest)
    } catch {
      toast.error(t("devConsole.invalidJson"))
      return
    }
    setSubmitting(true)
    try {
      // ?review=0 → şirkete-özel (onaya gitmez, yalnız company üyeleri görür).
      const res = await fetch(`/api/companies/${slug}/apps?review=${forReview ? "1" : "0"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error ?? t("devConsole.submitFailed"))
        return
      }
      toast.success(forReview ? t("devConsole.submittedReview") : t("devConsole.savedPrivate"))
      setOpen(false)
      setManifest("")
      void load()
    } finally {
      setSubmitting(false)
    }
  }

  async function withdraw(app: DevApp) {
    // Yalnız yayındaki PUBLIC app yayından kaldırılır; şirkete-özel / bekleyen
    // app tamamen silinir. Her iki durumda da önce onay al.
    const unpublishOnly = app.status === "approved" && app.visibility === "public"
    const ok = await confirm({
      title: unpublishOnly ? t("devConsole.confirmUnpublishTitle") : t("devConsole.confirmDeleteTitle"),
      description: unpublishOnly ? t("devConsole.confirmUnpublishDesc") : t("devConsole.confirmDeleteDesc"),
      confirmText: unpublishOnly ? t("devConsole.unpublish") : t("devConsole.delete"),
      destructive: true,
    })
    if (!ok) return
    setBusy(app.id)
    try {
      const res = await fetch(`/api/companies/${slug}/apps/${app.id}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error(t("devConsole.withdrawFailed"))
        return
      }
      toast.success(unpublishOnly ? t("devConsole.unpublished") : t("devConsole.deleted"))
      void load()
    } finally {
      setBusy(null)
    }
  }

  if (forbidden) {
    return (
      <PageTransition>
        <div className="mx-auto w-full max-w-3xl p-6">
          <EmptyState icon={<HugeiconsIcon icon={Store01Icon} strokeWidth={1.5} />} title={t("devConsole.noAccessTitle")} description={t("devConsole.noAccessDesc")} />
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
              <HugeiconsIcon icon={Store01Icon} className="size-5" strokeWidth={2} />
            </span>
            <div>
              <h1 className="text-xl font-semibold">{t("devConsole.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("devConsole.subtitle")}</p>
            </div>
          </div>
          <Button onClick={() => setOpen(true)}>{t("devConsole.submit")}</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden">
              <DialogHeader>
                <DialogTitle>{t("devConsole.dialogTitle")}</DialogTitle>
                <DialogDescription>
                  {t("devConsole.dialogDesc")}{" "}
                  <a href="/docs/app-store" target="_blank" rel="noopener noreferrer" className="underline">docs</a>.
                  <br /><br />
                  {t("devConsole.reviewHint")}<br />
                  {t("devConsole.privateHint")}
                </DialogDescription>
              </DialogHeader>
              <Textarea
                value={manifest}
                onChange={(e) => setManifest(e.target.value)}
                placeholder={'{\n  "manifestVersion": 1,\n  "identity": { … }\n}'}
                rows={14}
                // flex-1 + min-h-0 → footer sabit kalır; [field-sizing:fixed]
                // auto-grow'u kapatır (uzun manifest'te dialog viewport'u aşmasın),
                // taşan içerik textarea içinde scroll olur.
                className="min-h-40 flex-1 overflow-y-auto font-mono text-xs [field-sizing:fixed]"
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>{t("devConsole.cancel")}</Button>
                <Button variant="secondary" disabled={submitting || !manifest.trim()} onClick={() => submit(false)}>{t("devConsole.savePrivate")}</Button>
                <Button disabled={submitting || !manifest.trim()} onClick={() => submit(true)}>{t("devConsole.submitReview")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
        ) : apps.length === 0 ? (
          <EmptyState icon={<HugeiconsIcon icon={Store01Icon} strokeWidth={1.5} />} title={t("devConsole.emptyTitle")} description={t("devConsole.emptyDesc")} />
        ) : (
          <div className="space-y-3">
            {apps.map((app) => (
              <div key={app.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{app.name}</span>
                      <Badge className={STATUS_TONE[app.status] ?? ""}>{t(`devConsole.${STATUS_KEY[app.status] ?? "statusDraft"}`)}</Badge>
                      <span className="text-xs text-muted-foreground">v{app.currentVersion} · {app.source}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{app.embedOrigin}</div>
                  </div>
                  <Button size="sm" variant="ghost" disabled={busy === app.id} onClick={() => withdraw(app)} className="shrink-0 gap-1 text-muted-foreground hover:text-destructive">
                    <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                    {app.status === "approved" && app.visibility === "public" ? t("devConsole.unpublish") : t("devConsole.delete")}
                  </Button>
                </div>

                {app.status === "rejected" && app.rejectionReason ? (
                  <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
                    <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 size-3.5 shrink-0" />
                    {app.rejectionReason}
                  </p>
                ) : null}

                {app.visibility === "public" && (app.status === "pending" || app.status === "rejected") && !app.originVerifiedAt ? (
                  <div className="mt-3 rounded-lg bg-muted/50 p-3 text-xs">
                    <p className="mb-1.5 font-medium">{t("devConsole.verifyTitle")}</p>
                    <p className="mb-2 text-muted-foreground">{t("devConsole.verifyServe", { path: WK_PATH, origin: app.embedOrigin })}</p>
                    <button
                      type="button"
                      onClick={() => { void navigator.clipboard.writeText(app.verificationToken); toast.success(t("devConsole.tokenCopied")) }}
                      className="flex w-full items-center justify-between gap-2 rounded-md border bg-background px-2 py-1.5 font-mono text-[11px] hover:bg-muted"
                    >
                      <span className="truncate">{app.verificationToken}</span>
                      <HugeiconsIcon icon={Copy01Icon} className="size-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  </div>
                ) : null}

                {app.status === "approved" ? (
                  <p className="mt-2 flex items-center gap-1 text-xs text-emerald-600">
                    <HugeiconsIcon icon={CheckmarkBadge01Icon} className="size-3.5" /> {app.visibility === "private" ? t("devConsole.private") : t("devConsole.live")}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  )
}
