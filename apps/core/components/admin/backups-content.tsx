"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  PlusSignIcon,
  Loading03Icon,
  Delete02Icon,
  ArrowReloadHorizontalIcon,
  RestoreBinIcon,
  DatabaseIcon,
  Download01Icon,
  Upload01Icon,
} from "@hugeicons/core-free-icons"
import { PageTransition } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { confirm } from "@workspace/console/stores/confirm"
import { cn } from "@workspace/ui/lib/utils"

interface BackupJob {
  id: string
  kind: "backup" | "restore" | "import"
  tag?: "snapshot" | "manual" | null
  triggeredBy: string
  sourceUri: string
  sourceDbName: string
  targetUri: string
  targetDbName: string
  status: "pending" | "running" | "success" | "failed"
  collectionsCopied: number
  totalDocs: number
  error?: string | null
  startedAt: string
  finishedAt?: string | null
  createdAt: string
}

const STATUS_TINT: Record<BackupJob["status"], string> = {
  pending: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
  running: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleString()
}

function fmtUriHost(uri: string): string {
  try {
    const u = new URL(uri.replace(/^mongodb\+srv:\/\//, "mongodb://"))
    return u.host
  } catch {
    return uri.slice(0, 32)
  }
}

/** URI path'inden db adını çıkarır — örn `mongodb+srv://h/sentroy?opts`
 *  → "sentroy". Path yoksa boş string. */
function dbNameFromUri(uri: string): string {
  try {
    const u = new URL(uri.replace(/^mongodb\+srv:\/\//, "mongodb://"))
    const path = u.pathname.replace(/^\//, "")
    return path && path !== "/" ? path.split("?")[0] : ""
  } catch {
    return ""
  }
}

export function BackupsContent() {
  const t = useTranslations("backupsAdmin")
  const [jobs, setJobs] = useState<BackupJob[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [targetUri, setTargetUri] = useState("")
  const [creating, setCreating] = useState(false)
  const [actingId, setActingId] = useState<string | null>(null)
  const [restoreJob, setRestoreJob] = useState<BackupJob | null>(null)
  const [restoreConfirm, setRestoreConfirm] = useState("")
  const [restoring, setRestoring] = useState(false)
  // Custom restore target — boş ise default current cluster
  const [restoreCustomTarget, setRestoreCustomTarget] = useState(false)
  const [restoreTargetUri, setRestoreTargetUri] = useState("")
  const [restoreTargetDbName, setRestoreTargetDbName] = useState("")
  // Kullanıcı manuel düzenlemediği sürece URI değişiminde dbName'i
  // otomatik doldur (URI path'inden çıkarır). Manuel edit edince
  // auto-fill kapanır, kullanıcının yazdığı değeri ezmez.
  const [restoreDbNameAutoFilled, setRestoreDbNameAutoFilled] = useState(true)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/backups")
      const json = await res.json()
      if (res.ok) setJobs(json.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleCreate() {
    if (!targetUri.trim()) return
    setCreating(true)
    try {
      const res = await fetch("/api/admin/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUri: targetUri.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("createFailed"))
      toast.success(t("created"))
      setCreateOpen(false)
      setTargetUri("")
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("createFailed"))
    } finally {
      setCreating(false)
    }
  }

  async function handleRetry(job: BackupJob) {
    setActingId(job.id)
    try {
      const res = await fetch(`/api/admin/backups/${job.id}/retry`, {
        method: "POST",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("retryFailed"))
      toast.success(t("retried"))
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("retryFailed"))
    } finally {
      setActingId(null)
    }
  }

  async function handleDelete(job: BackupJob) {
    const ok = await confirm({
      title: t("deleteTitle"),
      description: t("deleteDesc", { dbName: job.targetDbName }),
      confirmText: t("delete"),
    })
    if (!ok) return
    setActingId(job.id)
    try {
      const res = await fetch(`/api/admin/backups/${job.id}`, {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("deleteFailed"))
      toast.success(t("deleted"))
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("deleteFailed"))
    } finally {
      setActingId(null)
    }
  }

  async function handleDownload(job: BackupJob) {
    setActingId(job.id)
    try {
      const res = await fetch(`/api/admin/backups/${job.id}/download`)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || t("downloadFailed"))
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${job.targetDbName}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success(t("downloaded"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("downloadFailed"))
    } finally {
      setActingId(null)
    }
  }

  async function handleImportFile(file: File) {
    setImporting(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/admin/backups/import", {
        method: "POST",
        body: form,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("importFailed"))
      toast.success(t("imported"))
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("importFailed"))
    } finally {
      setImporting(false)
    }
  }

  async function handleRestore() {
    if (!restoreJob) return
    if (restoreConfirm !== "RESTORE") return
    if (
      restoreCustomTarget &&
      (!restoreTargetUri.trim() || !restoreTargetDbName.trim())
    ) {
      return
    }
    setRestoring(true)
    try {
      const payload: Record<string, string> = { confirm: "RESTORE" }
      if (restoreCustomTarget && restoreTargetUri.trim()) {
        payload.targetUri = restoreTargetUri.trim()
        if (restoreTargetDbName.trim()) {
          payload.targetDbName = restoreTargetDbName.trim()
        }
      }
      const res = await fetch(
        `/api/admin/backups/${restoreJob.id}/restore`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("restoreFailed"))
      toast.success(t("restored"))
      setRestoreJob(null)
      setRestoreConfirm("")
      setRestoreCustomTarget(false)
      setRestoreTargetUri("")
      setRestoreTargetDbName("")
      setRestoreDbNameAutoFilled(true)
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("restoreFailed"))
    } finally {
      setRestoring(false)
    }
  }

  return (
    <PageTransition>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="flex flex-col gap-1">
              <CardTitle className="flex items-center gap-2">
                <HugeiconsIcon icon={DatabaseIcon} strokeWidth={2} />
                {t("title")}
              </CardTitle>
              <CardDescription>{t("description")}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleImportFile(f)
                  if (importInputRef.current) importInputRef.current.value = ""
                }}
              />
              <Button
                variant="outline"
                onClick={() => importInputRef.current?.click()}
                disabled={importing}
                title={t("importHint")}
              >
                {importing ? (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    strokeWidth={2}
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                ) : (
                  <HugeiconsIcon
                    icon={Upload01Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                )}
                {t("importJson")}
              </Button>
              <Button onClick={() => setCreateOpen(true)} disabled={creating}>
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("newBackup")}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-32 w-full rounded-xl" />
            ) : jobs.length === 0 ? (
              <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                {t("empty")}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2">{t("colKind")}</th>
                      <th className="px-2 py-2">{t("colTarget")}</th>
                      <th className="px-2 py-2">{t("colDbName")}</th>
                      <th className="px-2 py-2">{t("colStatus")}</th>
                      <th className="px-2 py-2">{t("colStats")}</th>
                      <th className="px-2 py-2">{t("colCreatedAt")}</th>
                      <th className="px-2 py-2 text-right">{t("colActions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {jobs.map((job) => (
                      <tr key={job.id} className="hover:bg-muted/30">
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="capitalize">
                              {t(`kind.${job.kind}`)}
                            </Badge>
                            {job.tag === "snapshot" && (
                              <Badge
                                variant="outline"
                                className="border-amber-500/40 bg-amber-500/10 text-[10px] uppercase text-amber-700 dark:text-amber-300"
                              >
                                {t("tag.snapshot")}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2 font-mono text-xs">
                          {fmtUriHost(
                            job.kind === "backup"
                              ? job.targetUri
                              : job.sourceUri,
                          )}
                        </td>
                        <td className="px-2 py-2 font-mono text-xs">
                          {job.kind === "backup"
                            ? job.targetDbName
                            : job.sourceDbName}
                        </td>
                        <td className="px-2 py-2">
                          <span
                            className={cn(
                              "inline-flex rounded px-2 py-0.5 text-[10px] font-medium uppercase",
                              STATUS_TINT[job.status],
                            )}
                          >
                            {t(`status.${job.status}`)}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-xs text-muted-foreground">
                          {job.collectionsCopied} cols ·{" "}
                          {job.totalDocs.toLocaleString()} docs
                        </td>
                        <td className="px-2 py-2 text-xs text-muted-foreground">
                          {fmtDate(job.createdAt)}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center justify-end gap-1">
                            {job.kind === "backup" && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => handleRetry(job)}
                                disabled={actingId === job.id}
                                title={t("retry")}
                              >
                                <HugeiconsIcon
                                  icon={
                                    actingId === job.id
                                      ? Loading03Icon
                                      : ArrowReloadHorizontalIcon
                                  }
                                  strokeWidth={2}
                                  className={
                                    actingId === job.id ? "animate-spin" : ""
                                  }
                                />
                              </Button>
                            )}
                            {job.kind === "backup" &&
                              job.status === "success" && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => handleDownload(job)}
                                  disabled={actingId === job.id}
                                  title={t("download")}
                                >
                                  <HugeiconsIcon
                                    icon={Download01Icon}
                                    strokeWidth={2}
                                  />
                                </Button>
                              )}
                            {job.kind === "backup" &&
                              job.status === "success" && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => {
                                    setRestoreJob(job)
                                    setRestoreConfirm("")
                                  }}
                                  title={t("restore")}
                                >
                                  <HugeiconsIcon
                                    icon={RestoreBinIcon}
                                    strokeWidth={2}
                                  />
                                </Button>
                              )}
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleDelete(job)}
                              disabled={actingId === job.id}
                              title={t("delete")}
                            >
                              <HugeiconsIcon
                                icon={Delete02Icon}
                                strokeWidth={2}
                              />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── New backup dialog ─────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("newBackupTitle")}</DialogTitle>
            <DialogDescription>{t("newBackupDesc")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label className="text-xs">{t("targetUriLabel")}</Label>
            <Input
              value={targetUri}
              onChange={(e) => setTargetUri(e.target.value)}
              placeholder="mongodb+srv://user:pass@cluster.mongodb.net/?..."
              disabled={creating}
              className="font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              {t("targetUriHint")}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !targetUri.trim()}
            >
              {creating && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {t("runBackup")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Restore confirm dialog ────────────────────────────────────── */}
      <Dialog
        open={restoreJob !== null}
        onOpenChange={(o) => {
          if (!o) {
            setRestoreJob(null)
            setRestoreConfirm("")
            setRestoreCustomTarget(false)
            setRestoreTargetUri("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              {t("restoreTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("restoreDesc", {
                dbName: restoreJob?.targetDbName ?? "",
                host: restoreJob ? fmtUriHost(restoreJob.targetUri) : "",
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {t("restoreWarning")}
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={restoreCustomTarget}
                onChange={(e) => setRestoreCustomTarget(e.target.checked)}
                disabled={restoring}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">{t("restoreCustomTarget")}</span>
                <span className="block text-[10px] text-muted-foreground">
                  {t("restoreCustomTargetHint")}
                </span>
              </span>
            </label>
            {restoreCustomTarget && (
              <div className="flex flex-col gap-2">
                <Input
                  value={restoreTargetUri}
                  onChange={(e) => {
                    const v = e.target.value
                    setRestoreTargetUri(v)
                    // URI değişiminde, kullanıcı dbName'i manuel
                    // düzenlemediyse otomatik doldur.
                    if (restoreDbNameAutoFilled) {
                      setRestoreTargetDbName(dbNameFromUri(v))
                    }
                  }}
                  placeholder="mongodb+srv://user:pass@cluster.mongodb.net/sentroy?retryWrites=true"
                  disabled={restoring}
                  className="font-mono text-xs"
                />
                <div className="flex flex-col gap-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">
                    {t("restoreTargetDbNameLabel")}
                  </Label>
                  <Input
                    value={restoreTargetDbName}
                    onChange={(e) => {
                      setRestoreTargetDbName(e.target.value)
                      setRestoreDbNameAutoFilled(false)
                    }}
                    placeholder="sentroy"
                    disabled={restoring}
                    className="font-mono text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {restoreDbNameAutoFilled && restoreTargetDbName
                      ? t("restoreTargetDbNameAuto")
                      : t("restoreTargetDbNameHint")}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs">
              {t("restoreConfirmLabel", { token: "RESTORE" })}
            </Label>
            <Input
              value={restoreConfirm}
              onChange={(e) => setRestoreConfirm(e.target.value)}
              placeholder="RESTORE"
              disabled={restoring}
              className="font-mono text-xs"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRestoreJob(null)
                setRestoreConfirm("")
                setRestoreCustomTarget(false)
                setRestoreTargetUri("")
              }}
              disabled={restoring}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleRestore}
              disabled={
                restoring ||
                restoreConfirm !== "RESTORE" ||
                (restoreCustomTarget &&
                  (!restoreTargetUri.trim() ||
                    !restoreTargetDbName.trim()))
              }
            >
              {restoring && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {t("restore")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  )
}
