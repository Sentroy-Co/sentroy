"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { confirm } from "@workspace/console/stores/confirm"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Store01Icon,
  Copy01Icon,
  CheckmarkBadge01Icon,
  Alert02Icon,
  SparklesIcon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  PlusSignIcon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons"
import { PageTransition, EmptyState } from "@workspace/console/components/shared"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"

type Status = "pending" | "approved" | "rejected" | "suspended"

interface AdminApp {
  id: string
  appId: string
  slug: string
  name: string
  tagline: string | null
  status: Status
  source: string
  visibility: string
  developerCompanyId: string
  currentVersion: string
  embedUrl: string
  embedOrigin: string
  authMode: string
  pricing: { model: string }
  appearance: { logoUrl: string; color: string; category: string }
  originVerifiedAt: string | null
  verificationToken: string
  rejectionReason: string | null
  createdAt: string
}

const TABS: Status[] = ["pending", "approved", "rejected", "suspended"]

export function AppStoreContent() {
  const t = useTranslations("admin")
  const [status, setStatus] = useState<Status>("pending")
  const [apps, setApps] = useState<AdminApp[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<AdminApp | null>(null)
  const [reason, setReason] = useState("")

  const load = useCallback(async (s: Status) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/app-store?status=${s}`)
      const json = await res.json()
      setApps((json?.data?.apps as AdminApp[]) ?? [])
    } catch {
      toast.error(t("appStoreAdmin.loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load(status)
  }, [status, load])

  async function act(app: AdminApp, action: "approve" | "reject" | "suspend", rsn?: string, skipOriginVerification?: boolean) {
    setBusy(app.id)
    try {
      const res = await fetch(`/api/admin/app-store/${app.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason: rsn, skipOriginVerification }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error ?? t("appStoreAdmin.actionFailed"))
        return
      }
      toast.success(t(`appStoreAdmin.${action === "approve" ? "approvedToast" : action === "reject" ? "rejectedToast" : "suspendedToast"}`))
      setRejectTarget(null)
      setReason("")
      void load(status)
    } catch {
      toast.error(t("appStoreAdmin.actionFailed"))
    } finally {
      setBusy(null)
    }
  }

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
            <HugeiconsIcon icon={Store01Icon} className="size-5" strokeWidth={2} />
          </span>
          <div>
            <h1 className="text-xl font-semibold">{t("appStore")}</h1>
            <p className="text-sm text-muted-foreground">{t("appStoreAdmin.subtitle")}</p>
          </div>
        </div>

        <FeaturedManager />

        <div className="flex gap-1.5">
          {TABS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors " +
                (status === s ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-foreground/10")
              }
            >
              {t(`appStoreAdmin.${s}`)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : apps.length === 0 ? (
          <EmptyState icon={<HugeiconsIcon icon={Store01Icon} strokeWidth={1.5} />} title={t("appStoreAdmin.noApps")} description={t("appStoreAdmin.noSubmissions", { status: t(`appStoreAdmin.${status}`) })} />
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("appStoreAdmin.colApp")}</TableHead>
                  <TableHead>{t("appStoreAdmin.colVersion")}</TableHead>
                  <TableHead>{t("appStoreAdmin.colSource")}</TableHead>
                  <TableHead>{t("appStoreAdmin.colAuth")}</TableHead>
                  <TableHead>{t("appStoreAdmin.colOrigin")}</TableHead>
                  <TableHead className="text-right">{t("appStoreAdmin.colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apps.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg text-white"
                          style={{ background: app.appearance.color }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={app.appearance.logoUrl} alt="" className="size-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{app.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{app.appId} · {app.pricing.model}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{app.currentVersion}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{app.source}</Badge></TableCell>
                    <TableCell><Badge variant="secondary">{app.authMode}</Badge></TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="truncate text-xs text-muted-foreground" title={app.embedOrigin}>{app.embedOrigin}</span>
                        {app.originVerifiedAt ? (
                          <Badge className="w-fit gap-1 bg-emerald-600"><HugeiconsIcon icon={CheckmarkBadge01Icon} className="size-3" /> {t("appStoreAdmin.verified")}</Badge>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(app.verificationToken)
                              toast.success(t("appStoreAdmin.tokenCopied"))
                            }}
                            className="flex w-fit items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300"
                          >
                            <HugeiconsIcon icon={Copy01Icon} className="size-3" /> {t("appStoreAdmin.token")}
                          </button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1.5">
                        {(app.status === "pending" || app.status === "rejected") && (
                          <Button size="sm" disabled={busy === app.id} onClick={() => act(app, "approve")}>{t("appStoreAdmin.approve")}</Button>
                        )}
                        {(app.status === "pending" || app.status === "rejected") && !app.originVerifiedAt && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy === app.id}
                            onClick={async () => {
                              const ok = await confirm({
                                title: t("appStoreAdmin.forceTitle", { name: app.name }),
                                description: t("appStoreAdmin.forceConfirm", { origin: app.embedOrigin }),
                                confirmText: t("appStoreAdmin.force"),
                              })
                              if (ok) void act(app, "approve", undefined, true)
                            }}
                          >
                            {t("appStoreAdmin.force")}
                          </Button>
                        )}
                        {app.status !== "rejected" && app.status !== "suspended" && (
                          <Button size="sm" variant="outline" disabled={busy === app.id} onClick={() => { setRejectTarget(app); setReason("") }}>{t("appStoreAdmin.reject")}</Button>
                        )}
                        {app.status === "approved" && (
                          <Button size="sm" variant="destructive" disabled={busy === app.id} onClick={() => act(app, "suspend")}>{t("appStoreAdmin.suspend")}</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {apps.some((a) => a.rejectionReason) && status === "rejected" ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <HugeiconsIcon icon={Alert02Icon} className="size-3.5" /> {t("appStoreAdmin.rejectedNote")}
          </p>
        ) : null}
      </div>

      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("appStoreAdmin.rejectTitle", { name: rejectTarget?.name ?? "" })}</DialogTitle>
            <DialogDescription>{t("appStoreAdmin.rejectDesc")}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("appStoreAdmin.rejectPlaceholder")}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>{t("appStoreAdmin.cancel")}</Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || busy === rejectTarget?.id}
              onClick={() => rejectTarget && act(rejectTarget, "reject", reason.trim())}
            >
              {t("appStoreAdmin.reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  )
}

// ─── Editor's Choice manager ──────────────────────────────────────────────

interface Candidate {
  appId: string
  name: string
  logoUrl: string
  color: string
  category: string
  firstParty: boolean
}

function FeaturedManager() {
  const t = useTranslations("admin")
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [featured, setFeatured] = useState<string[]>([]) // ordered appIds
  const [initial, setInitial] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const byId = new Map(candidates.map((c) => [c.appId, c]))
  const dirty = featured.length !== initial.length || featured.some((id, i) => id !== initial[i])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/app-store/featured")
      const json = await res.json()
      const ec = (json?.data?.editorsChoice as string[]) ?? []
      setCandidates((json?.data?.candidates as Candidate[]) ?? [])
      setFeatured(ec)
      setInitial(ec)
    } catch {
      toast.error(t("appStoreAdmin.editorsChoice.loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const available = candidates.filter((c) => !featured.includes(c.appId))

  function move(idx: number, dir: -1 | 1) {
    setFeatured((prev) => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target]!, next[idx]!]
      return next
    })
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/app-store/featured", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ editorsChoice: featured }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error ?? t("appStoreAdmin.editorsChoice.saveFailed"))
        return
      }
      const ec = (json?.data?.editorsChoice as string[]) ?? featured
      setFeatured(ec)
      setInitial(ec)
      toast.success(t("appStoreAdmin.editorsChoice.saved"))
    } catch {
      toast.error(t("appStoreAdmin.editorsChoice.saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  function Logo({ c }: { c: Candidate }) {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg text-white" style={{ background: c.color }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={c.logoUrl} alt="" className="size-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
      </span>
    )
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-amber-500 text-white">
            <HugeiconsIcon icon={SparklesIcon} className="size-4" strokeWidth={2} />
          </span>
          <div>
            <h2 className="text-sm font-semibold">{t("appStoreAdmin.editorsChoice.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("appStoreAdmin.editorsChoice.subtitle")}</p>
          </div>
        </div>
        <Button size="sm" disabled={!dirty || saving || loading} onClick={save}>
          {t("appStoreAdmin.editorsChoice.save")}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Featured (ordered) */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("appStoreAdmin.editorsChoice.featured")}</div>
            {featured.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">{t("appStoreAdmin.editorsChoice.empty")}</p>
            ) : (
              <ul className="space-y-1.5">
                {featured.map((id, idx) => {
                  const c = byId.get(id)
                  if (!c) return null
                  return (
                    <li key={id} className="flex items-center gap-2 rounded-lg border bg-background p-2">
                      <span className="w-5 text-center text-xs font-mono text-muted-foreground">{idx + 1}</span>
                      <Logo c={c} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                          {c.name}
                          {c.firstParty ? <Badge variant="secondary" className="h-4 px-1 text-[9px]">{t("appStoreAdmin.editorsChoice.sentroy")}</Badge> : null}
                        </div>
                      </div>
                      <Button size="icon-sm" variant="ghost" aria-label={t("appStoreAdmin.editorsChoice.moveUp")} disabled={idx === 0} onClick={() => move(idx, -1)}>
                        <HugeiconsIcon icon={ArrowUp01Icon} className="size-4" />
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label={t("appStoreAdmin.editorsChoice.moveDown")} disabled={idx === featured.length - 1} onClick={() => move(idx, 1)}>
                        <HugeiconsIcon icon={ArrowDown01Icon} className="size-4" />
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label={t("appStoreAdmin.editorsChoice.remove")} onClick={() => setFeatured((p) => p.filter((x) => x !== id))}>
                        <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Available */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("appStoreAdmin.editorsChoice.available")}</div>
            {available.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">{t("appStoreAdmin.editorsChoice.noAvailable")}</p>
            ) : (
              <ul className="space-y-1.5">
                {available.map((c) => (
                  <li key={c.appId} className="flex items-center gap-2 rounded-lg border bg-background p-2">
                    <Logo c={c} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                        {c.name}
                        {c.firstParty ? <Badge variant="secondary" className="h-4 px-1 text-[9px]">{t("appStoreAdmin.editorsChoice.sentroy")}</Badge> : null}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setFeatured((p) => [...p, c.appId])}>
                      <HugeiconsIcon icon={PlusSignIcon} className="size-3.5" /> {t("appStoreAdmin.editorsChoice.add")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
