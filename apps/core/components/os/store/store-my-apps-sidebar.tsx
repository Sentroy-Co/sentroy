"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  Cancel01Icon,
  Add01Icon,
  Store01Icon,
  Copy01Icon,
  CheckmarkBadge01Icon,
  Alert02Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"
import { confirm } from "@workspace/console/stores/confirm"

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
const STATUS_KEY: Record<string, string> = {
  approved: "statusApproved",
  pending: "statusPending",
  rejected: "statusRejected",
  suspended: "statusSuspended",
  draft: "statusDraft",
}
const WK_PATH = "/.well-known/sentroy-app-verification.txt"

type Screen = "list" | "submit"

/**
 * App Store içi "My Apps" sağ sidebar'ı. Store penceresinin sağ kenarından
 * kayarak açılır; iki ekranlı bir STACK içerir: geliştiricinin app'leri
 * (`list`) ↔ manifest gönderme (`submit`). "Publish your app" artık ayrı bir
 * OS penceresi değil, bu stack'in bir ekranı — daha bütünleşik / profesyonel.
 * i18n `os.devConsole.*` + `os.store.*` anahtarlarını AppSubmissionsContent
 * ile paylaşır; endpoint'ler `/api/companies/[slug]/apps`.
 */
export function StoreMyAppsSidebar({
  open,
  onClose,
  companySlug,
  initialScreen = "list",
}: {
  open: boolean
  onClose: () => void
  companySlug: string
  /** Açılışta hangi ekran — bottom "publish" linki doğrudan submit'e girer. */
  initialScreen?: Screen
}) {
  const t = useTranslations("os")
  const [screen, setScreen] = useState<Screen>(initialScreen)
  const [apps, setApps] = useState<DevApp[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [manifest, setManifest] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setForbidden(false)
    try {
      const res = await fetch(`/api/companies/${companySlug}/apps`)
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
  }, [companySlug, t])

  // Açıldığında ekranı sıfırla + listeyi yükle.
  useEffect(() => {
    if (!open) return
    setScreen(initialScreen)
    void load()
  }, [open, initialScreen, load])

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
      const res = await fetch(`/api/companies/${companySlug}/apps?review=${forReview ? "1" : "0"}`, {
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
      setManifest("")
      setScreen("list")
      void load()
    } finally {
      setSubmitting(false)
    }
  }

  async function withdraw(app: DevApp) {
    // Yalnız yayındaki PUBLIC app "yayından kaldır" (dış kurulu kullanıcı
    // koruması); şirkete-özel / bekleyen app TAMAMEN SİLİNİR.
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
      const res = await fetch(`/api/companies/${companySlug}/apps/${app.id}`, { method: "DELETE" })
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

  return (
    <AnimatePresence>
      {open ? (
        <>
          {/* Backdrop — store penceresine sınırlı (absolute inset). */}
          <motion.div
            className="absolute inset-0 z-20 bg-black/25 backdrop-blur-[1px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />
          <motion.aside
            className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[400px] flex-col border-l border-border/60 bg-background shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
          >
            {/* Header — stack: submit ekranında geri butonu. */}
            <header className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2.5">
              {screen === "submit" ? (
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setScreen("list")}>
                  <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" strokeWidth={2} />
                  {t("devConsole.cancel")}
                </Button>
              ) : (
                <span className="flex items-center gap-2 px-1 text-sm font-semibold">
                  <HugeiconsIcon icon={Store01Icon} className="size-4" strokeWidth={2} />
                  {t("store.myApps")}
                </span>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto text-muted-foreground"
                onClick={onClose}
                aria-label={t("store.close")}
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-4" strokeWidth={2} />
              </Button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {screen === "submit" ? (
                <SubmitScreen
                  manifest={manifest}
                  setManifest={setManifest}
                  submitting={submitting}
                  onSubmit={submit}
                />
              ) : forbidden ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                  <HugeiconsIcon icon={Store01Icon} className="size-8 text-muted-foreground" strokeWidth={1.5} />
                  <p className="text-sm font-medium">{t("devConsole.noAccessTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("devConsole.noAccessDesc")}</p>
                </div>
              ) : (
                <div className="space-y-4 p-4">
                  <Button className="w-full gap-1.5" onClick={() => setScreen("submit")}>
                    <HugeiconsIcon icon={Add01Icon} className="size-4" strokeWidth={2} />
                    {t("devConsole.submit")}
                  </Button>

                  {loading ? (
                    <div className="space-y-2">
                      {[0, 1].map((i) => (
                        <Skeleton key={i} className="h-20 w-full rounded-xl" />
                      ))}
                    </div>
                  ) : apps.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                      <HugeiconsIcon icon={Store01Icon} className="size-8 text-muted-foreground" strokeWidth={1.5} />
                      <p className="text-sm font-medium">{t("devConsole.emptyTitle")}</p>
                      <p className="text-xs text-muted-foreground">{t("devConsole.emptyDesc")}</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {apps.map((app) => (
                        <AppRow key={app.id} app={app} busy={busy === app.id} onWithdraw={() => withdraw(app)} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  )
}

function SubmitScreen({
  manifest,
  setManifest,
  submitting,
  onSubmit,
}: {
  manifest: string
  setManifest: (v: string) => void
  submitting: boolean
  onSubmit: (forReview: boolean) => void
}) {
  const t = useTranslations("os")
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div>
        <h2 className="text-sm font-semibold">{t("devConsole.dialogTitle")}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {t("devConsole.dialogDesc")}{" "}
          <a href="/docs/app-store" target="_blank" rel="noopener noreferrer" className="underline">
            docs
          </a>
          .
        </p>
        <p className="mt-2 text-xs text-muted-foreground">{t("devConsole.reviewHint")}</p>
        <p className="text-xs text-muted-foreground">{t("devConsole.privateHint")}</p>
      </div>
      <Textarea
        value={manifest}
        onChange={(e) => setManifest(e.target.value)}
        placeholder={'{\n  "manifestVersion": 1,\n  "identity": { … }\n}'}
        rows={12}
        className="min-h-48 flex-1 overflow-y-auto font-mono text-xs [field-sizing:fixed]"
      />
      <div className="flex shrink-0 flex-col gap-2">
        <Button disabled={submitting || !manifest.trim()} onClick={() => onSubmit(true)}>
          {t("devConsole.submitReview")}
        </Button>
        <Button variant="secondary" disabled={submitting || !manifest.trim()} onClick={() => onSubmit(false)}>
          {t("devConsole.savePrivate")}
        </Button>
      </div>
    </div>
  )
}

function AppRow({
  app,
  busy,
  onWithdraw,
}: {
  app: DevApp
  busy: boolean
  onWithdraw: () => void
}) {
  const t = useTranslations("os")
  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold">{app.name}</span>
            <Badge className={cn("text-[10px]", STATUS_TONE[app.status] ?? "")}>
              {t(`devConsole.${STATUS_KEY[app.status] ?? "statusDraft"}`)}
            </Badge>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
            v{app.currentVersion} · {app.embedOrigin}
          </div>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={busy}
          onClick={onWithdraw}
          aria-label={app.status === "approved" && app.visibility === "public" ? t("devConsole.unpublish") : t("devConsole.delete")}
          className="shrink-0 text-muted-foreground hover:text-destructive"
        >
          <HugeiconsIcon icon={Delete02Icon} className="size-4" strokeWidth={2} />
        </Button>
      </div>

      {app.status === "rejected" && app.rejectionReason ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-destructive/10 p-2 text-[11px] text-destructive">
          <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 size-3.5 shrink-0" />
          {app.rejectionReason}
        </p>
      ) : null}

      {app.visibility === "public" && (app.status === "pending" || app.status === "rejected") && !app.originVerifiedAt ? (
        <div className="mt-2.5 rounded-lg bg-muted/50 p-2.5 text-[11px]">
          <p className="mb-1 font-medium">{t("devConsole.verifyTitle")}</p>
          <p className="mb-1.5 text-muted-foreground">{t("devConsole.verifyServe", { path: WK_PATH, origin: app.embedOrigin })}</p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(app.verificationToken)
              toast.success(t("devConsole.tokenCopied"))
            }}
            className="flex w-full items-center justify-between gap-2 rounded-md border bg-background px-2 py-1.5 font-mono text-[10px] hover:bg-muted"
          >
            <span className="truncate">{app.verificationToken}</span>
            <HugeiconsIcon icon={Copy01Icon} className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </div>
      ) : null}

      {app.status === "approved" ? (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-emerald-600">
          <HugeiconsIcon icon={CheckmarkBadge01Icon} className="size-3.5" />
          {app.visibility === "private" ? t("devConsole.private") : t("devConsole.live")}
        </p>
      ) : null}
    </div>
  )
}
