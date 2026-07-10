"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Database01Icon,
  CloudUploadIcon,
  CloudDownloadIcon,
  ServerStack01Icon,
  Add01Icon,
  Delete02Icon,
  PencilEdit02Icon,
  Loading03Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import { confirm } from "@workspace/console/stores/confirm"
import { PageTransition, EmptyState } from "@workspace/console/components/shared"

interface Connection {
  id: string
  label: string
  uriMasked: string
  defaultDbName: string | null
  lastBackupAt: string | null
}
type JobStatus = "queued" | "running" | "success" | "failed"
type JobKind = "backup" | "restore"
interface Job {
  id: string
  kind: JobKind
  status: JobStatus
  dbName: string
  connectionId: string
  connectionLabel: string
  sourceJobId: string | null
  s3Key: string | null
  sizeBytes: number | null
  drop: boolean
  progress: number
  stage: string | null
  error: string | null
  createdAt: string
  finishedAt: string | null
}

const STATUS_STYLE: Record<JobStatus, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  failed: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
}

function fmtBytes(n: number | null): string {
  if (!n || n <= 0) return "—"
  const u = ["B", "KB", "MB", "GB", "TB"]
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}
function fmtDate(s: string | null): string {
  if (!s) return "—"
  try {
    return new Date(s).toLocaleString()
  } catch {
    return s
  }
}

const inputCls =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

// Worker'ın gönderdiği bilinen aşama etiketleri (dumping/uploading/restoring/done).
const KNOWN_STAGES = new Set(["dumping", "uploading", "restoring", "done"])
function stageLabel(t: ReturnType<typeof useTranslations>, stage: string): string {
  return KNOWN_STAGES.has(stage) ? t(`stage.${stage}`) : stage
}

export function BackupManager({ companySlug }: { companySlug: string }) {
  const t = useTranslations("backup")
  const base = `/api/companies/${companySlug}/mongo`

  const [tab, setTab] = useState<"connections" | "backups">("connections")
  const [connections, setConnections] = useState<Connection[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [initialLoad, setInitialLoad] = useState(true)
  const [busyBackup, setBusyBackup] = useState<string | null>(null)

  // Dialogs
  const [connDialog, setConnDialog] = useState<{ mode: "add" | "edit"; conn?: Connection } | null>(null)
  const [restoreFor, setRestoreFor] = useState<Job | null>(null)

  const load = useCallback(async () => {
    try {
      const [cRes, jRes] = await Promise.all([
        fetch(`${base}/connections`),
        fetch(`${base}/backups`),
      ])
      const cJson = await cRes.json()
      const jJson = await jRes.json()
      if (cRes.ok) setConnections((cJson.data as Connection[]) ?? [])
      if (jRes.ok) setJobs((jJson.data as Job[]) ?? [])
    } catch {
      /* transient */
    } finally {
      setInitialLoad(false)
    }
  }, [base])

  useEffect(() => {
    void load()
  }, [load])

  // Aktif iş varken (queued/running) 3sn'de bir job listesini tazele.
  const hasActive = useMemo(
    () => jobs.some((j) => j.status === "queued" || j.status === "running"),
    [jobs],
  )
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (!hasActive) return
    pollRef.current = setInterval(() => {
      fetch(`${base}/backups`)
        .then((r) => r.json())
        .then((j) => setJobs((j.data as Job[]) ?? []))
        .catch(() => {})
    }, 3000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [hasActive, base])

  async function backupNow(conn: Connection) {
    setBusyBackup(conn.id)
    try {
      const res = await fetch(`${base}/backups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: conn.id }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || t("errors.generic"))
      toast.success(t("toast.backupStarted"))
      setTab("backups")
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.generic"))
    } finally {
      setBusyBackup(null)
    }
  }

  async function deleteConnection(conn: Connection) {
    const ok = await confirm({
      title: t("confirm.deleteConnTitle"),
      description: t("confirm.deleteConnBody", { label: conn.label }),
      destructive: true,
      confirmText: t("actions.delete"),
    })
    if (!ok) return
    try {
      const res = await fetch(`${base}/connections/${conn.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success(t("toast.connDeleted"))
      await load()
    } catch {
      toast.error(t("errors.generic"))
    }
  }

  async function deleteJob(job: Job) {
    const ok = await confirm({
      title: t("confirm.deleteJobTitle"),
      description: t("confirm.deleteJobBody"),
      destructive: true,
      confirmText: t("actions.delete"),
    })
    if (!ok) return
    try {
      const res = await fetch(`${base}/backups/${job.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success(t("toast.jobDeleted"))
      setJobs((prev) => prev.filter((j) => j.id !== job.id))
    } catch {
      toast.error(t("errors.generic"))
    }
  }

  function downloadJob(job: Job) {
    // Stream-proxy indirme — audit'lenir. Tarayıcı attachment olarak alır.
    window.location.href = `${base}/backups/${job.id}/download`
  }

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <HugeiconsIcon icon={Database01Icon} className="size-6" strokeWidth={2} />
              {t("title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            <HugeiconsIcon icon={RefreshIcon} className="size-4" strokeWidth={2} data-icon="inline-start" />
            {t("actions.refresh")}
          </Button>
        </div>

        {/* Tab switcher (base-ui Tabs yerine basit segmented — embed-safe) */}
        <div className="mb-5 inline-flex rounded-lg border p-1">
          {(["connections", "backups"] as const).map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors " +
                (tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")
              }
            >
              {t(`tabs.${key}`)}
            </button>
          ))}
        </div>

        {initialLoad ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
          </div>
        ) : tab === "connections" ? (
          <ConnectionsTab
            t={t}
            connections={connections}
            busyBackup={busyBackup}
            onAdd={() => setConnDialog({ mode: "add" })}
            onEdit={(c) => setConnDialog({ mode: "edit", conn: c })}
            onDelete={deleteConnection}
            onBackup={backupNow}
          />
        ) : (
          <BackupsTab
            t={t}
            jobs={jobs}
            onDownload={downloadJob}
            onRestore={(j) => setRestoreFor(j)}
            onDelete={deleteJob}
          />
        )}
      </div>

      {connDialog ? (
        <ConnectionDialog
          t={t}
          base={base}
          mode={connDialog.mode}
          conn={connDialog.conn}
          onClose={() => setConnDialog(null)}
          onSaved={async () => {
            setConnDialog(null)
            await load()
          }}
        />
      ) : null}

      {restoreFor ? (
        <RestoreDialog
          t={t}
          base={base}
          source={restoreFor}
          connections={connections}
          onClose={() => setRestoreFor(null)}
          onStarted={async () => {
            setRestoreFor(null)
            setTab("backups")
            await load()
          }}
        />
      ) : null}
    </PageTransition>
  )
}

// ── Connections tab ─────────────────────────────────────────────────────────
function ConnectionsTab({
  t,
  connections,
  busyBackup,
  onAdd,
  onEdit,
  onDelete,
  onBackup,
}: {
  t: ReturnType<typeof useTranslations>
  connections: Connection[]
  busyBackup: string | null
  onAdd: () => void
  onEdit: (c: Connection) => void
  onDelete: (c: Connection) => void
  onBackup: (c: Connection) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={onAdd}>
          <HugeiconsIcon icon={Add01Icon} className="size-4" strokeWidth={2} data-icon="inline-start" />
          {t("actions.addConnection")}
        </Button>
      </div>
      {connections.length === 0 ? (
        <div className="rounded-xl border p-10">
          <EmptyState title={t("empty.connections")} />
        </div>
      ) : (
        connections.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-4 rounded-xl border p-4">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{c.label}</div>
              <div className="truncate font-mono text-xs text-muted-foreground">{c.uriMasked}</div>
              <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                <span>{t("fields.db")}: {c.defaultDbName || "—"}</span>
                <span>{t("fields.lastBackup")}: {fmtDate(c.lastBackupAt)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => onBackup(c)} disabled={busyBackup === c.id}>
                <HugeiconsIcon
                  icon={busyBackup === c.id ? Loading03Icon : CloudUploadIcon}
                  className={"size-4" + (busyBackup === c.id ? " animate-spin" : "")}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("actions.backupNow")}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => onEdit(c)} aria-label={t("actions.edit")}>
                <HugeiconsIcon icon={PencilEdit02Icon} className="size-4" strokeWidth={2} />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => onDelete(c)} aria-label={t("actions.delete")}>
                <HugeiconsIcon icon={Delete02Icon} className="size-4 text-rose-500" strokeWidth={2} />
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ── Backups tab ─────────────────────────────────────────────────────────────
function BackupsTab({
  t,
  jobs,
  onDownload,
  onRestore,
  onDelete,
}: {
  t: ReturnType<typeof useTranslations>
  jobs: Job[]
  onDownload: (j: Job) => void
  onRestore: (j: Job) => void
  onDelete: (j: Job) => void
}) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border p-10">
        <EmptyState title={t("empty.backups")} />
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {jobs.map((j) => (
        <div key={j.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-4">
          <HugeiconsIcon
            icon={j.kind === "restore" ? ServerStack01Icon : CloudUploadIcon}
            className="size-5 shrink-0 opacity-70"
            strokeWidth={2}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{j.connectionLabel}</span>
              <span className="text-xs text-muted-foreground">· {j.dbName}</span>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[j.status]}`}>
                {t(`status.${j.status}`)}
              </span>
              {j.kind === "restore" ? (
                <span className="text-xs text-muted-foreground">({t("kind.restore")})</span>
              ) : null}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
              <span>{fmtDate(j.createdAt)}</span>
              {j.kind === "backup" ? <span>{fmtBytes(j.sizeBytes)}</span> : null}
              {j.status === "running" && j.stage ? (
                <span className="text-amber-600 dark:text-amber-400">{stageLabel(t, j.stage)}…</span>
              ) : null}
              {j.status === "failed" && j.error ? (
                <span className="text-rose-500" title={j.error}>{j.error.slice(0, 120)}</span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {j.kind === "backup" && j.status === "success" ? (
              <>
                <Button size="sm" variant="outline" onClick={() => onDownload(j)}>
                  <HugeiconsIcon icon={CloudDownloadIcon} className="size-4" strokeWidth={2} data-icon="inline-start" />
                  {t("actions.download")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => onRestore(j)}>
                  <HugeiconsIcon icon={ServerStack01Icon} className="size-4" strokeWidth={2} data-icon="inline-start" />
                  {t("actions.restore")}
                </Button>
              </>
            ) : null}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onDelete(j)}
              disabled={j.status === "running" || j.status === "queued"}
              aria-label={t("actions.delete")}
            >
              <HugeiconsIcon icon={Delete02Icon} className="size-4 text-rose-500" strokeWidth={2} />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Connection add/edit dialog ──────────────────────────────────────────────
function ConnectionDialog({
  t,
  base,
  mode,
  conn,
  onClose,
  onSaved,
}: {
  t: ReturnType<typeof useTranslations>
  base: string
  mode: "add" | "edit"
  conn?: Connection
  onClose: () => void
  onSaved: () => void
}) {
  const [label, setLabel] = useState(conn?.label ?? "")
  const [uri, setUri] = useState("")
  const [defaultDbName, setDefaultDbName] = useState(conn?.defaultDbName ?? "")
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!label.trim()) {
      toast.error(t("errors.labelRequired"))
      return
    }
    if (mode === "add" && !uri.trim()) {
      toast.error(t("errors.uriRequired"))
      return
    }
    setBusy(true)
    try {
      const url = mode === "add" ? `${base}/connections` : `${base}/connections/${conn!.id}`
      const method = mode === "add" ? "POST" : "PATCH"
      const payload: Record<string, unknown> = { label: label.trim(), defaultDbName: defaultDbName.trim() }
      if (uri.trim()) payload.uri = uri.trim()
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || t("errors.generic"))
      toast.success(mode === "add" ? t("toast.connAdded") : t("toast.connUpdated"))
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.generic"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? t("dialog.addTitle") : t("dialog.editTitle")}</DialogTitle>
          <DialogDescription>{t("dialog.connDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Field label={t("fields.label")}>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("fields.labelPh")} maxLength={120} />
          </Field>
          <Field label={t("fields.uri")} hint={mode === "edit" ? t("fields.uriEditHint") : t("fields.uriHint")}>
            <Input
              value={uri}
              onChange={(e) => setUri(e.target.value)}
              placeholder="mongodb+srv://user:pass@host/db"
              className="font-mono text-xs"
              autoComplete="off"
            />
            {mode === "edit" ? (
              <p className="text-xs text-muted-foreground">{t("fields.currentUri")}: <span className="font-mono">{conn?.uriMasked}</span></p>
            ) : null}
          </Field>
          <Field label={t("fields.defaultDb")} hint={t("fields.defaultDbHint")}>
            <Input value={defaultDbName} onChange={(e) => setDefaultDbName(e.target.value)} placeholder="mydb" maxLength={120} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t("actions.cancel")}</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" strokeWidth={2} data-icon="inline-start" /> : null}
            {t("actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Restore dialog (destructive) ────────────────────────────────────────────
function RestoreDialog({
  t,
  base,
  source,
  connections,
  onClose,
  onStarted,
}: {
  t: ReturnType<typeof useTranslations>
  base: string
  source: Job
  connections: Connection[]
  onClose: () => void
  onStarted: () => void
}) {
  const [targetConnectionId, setTargetConnectionId] = useState(source.connectionId)
  const [targetDbName, setTargetDbName] = useState(source.dbName)
  const [drop, setDrop] = useState(true)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!targetConnectionId) {
      toast.error(t("errors.targetRequired"))
      return
    }
    const target = connections.find((c) => c.id === targetConnectionId)
    const ok = await confirm({
      title: t("confirm.restoreTitle"),
      description: t("confirm.restoreBody", {
        db: targetDbName,
        target: target?.label ?? "",
        drop: drop ? t("confirm.dropOn") : t("confirm.dropOff"),
      }),
      destructive: true,
      confirmText: t("actions.restore"),
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetch(`${base}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceJobId: source.id,
          targetConnectionId,
          targetDbName: targetDbName.trim(),
          drop,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || t("errors.generic"))
      toast.success(t("toast.restoreStarted"))
      onStarted()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.generic"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("dialog.restoreTitle")}</DialogTitle>
          <DialogDescription>{t("dialog.restoreDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <div className="text-xs text-muted-foreground">{t("fields.source")}</div>
            <div className="font-medium">{source.connectionLabel} · {source.dbName}</div>
            <div className="text-xs text-muted-foreground">{fmtDate(source.createdAt)} · {fmtBytes(source.sizeBytes)}</div>
          </div>
          <Field label={t("fields.targetConnection")}>
            <select
              value={targetConnectionId}
              onChange={(e) => setTargetConnectionId(e.target.value)}
              className={inputCls}
            >
              {connections.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label={t("fields.targetDb")} hint={t("fields.targetDbHint")}>
            <Input value={targetDbName} onChange={(e) => setTargetDbName(e.target.value)} className="font-mono text-xs" maxLength={120} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={drop} onChange={(e) => setDrop(e.target.checked)} className="size-4" />
            <span>{t("fields.drop")}</span>
          </label>
          <p className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-600 dark:text-rose-400">
            {t("warnings.restore")}
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t("actions.cancel")}</Button>
          <Button onClick={submit} disabled={busy} className="bg-rose-600 text-white hover:bg-rose-700">
            {busy ? <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" strokeWidth={2} data-icon="inline-start" /> : null}
            {t("actions.restore")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  )
}
