"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  PlusSignIcon,
  Loading03Icon,
  KeyIcon,
  Building06Icon,
  Delete02Icon,
  ViewIcon,
  ViewOffIcon,
  Tick02Icon,
  Copy01Icon,
  Alert02Icon,
  CodeIcon,
  Notification03Icon,
  Link04Icon,
} from "@hugeicons/core-free-icons"
import { PageTransition } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { Switch } from "@workspace/ui/components/switch"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { confirm } from "@workspace/console/stores/confirm"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Sentroy Env Vault — admin dashboard.
 *
 * Layout:
 *   • Sol panel: project listesi + "new project" butonu
 *   • Sağ panel: seçili project'in environment + variable + token + audit
 *     view'ları (tab değişimi yerine flat sections — admin scrollar).
 *
 * Tüm CRUD POST/PATCH/DELETE'i `/api/admin/env-vault/*` ya da
 * `/api/companies/<slug>/env-vault/*` endpoint'lerine.
 *
 * Tüm kullanıcı görünür string'ler `vault` next-intl namespace'inden gelir.
 */

// ── Types ────────────────────────────────────────────────────────────────

interface EnvProject {
  id: string
  slug: string
  name: string
  description: string | null
  defaultEnvironment: string
  createdAt: string
  updatedAt: string
}

interface EnvVariable {
  id: string
  key: string
  value: string | null
  type: "string" | "number" | "boolean" | "json" | "url"
  public: boolean
  description: string | null
  decryptError?: boolean
  updatedAt: string
}

interface EnvToken {
  id: string
  name: string
  environment: string
  tokenPrefix: string
  permissions: ("read" | "write")[]
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

interface EnvWebhook {
  id: string
  name: string
  environment: string
  url: string
  secretPrefix: string
  enabled: boolean
  lastFiredAt: string | null
  lastStatus: number | null
  lastError: string | null
  createdAt: string
}

interface AuditLog {
  id: string
  action: string
  environment: string | null
  key: string | null
  actorEmail: string | null
  beforeChecksum: string | null
  afterChecksum: string | null
  meta: Record<string, unknown>
  createdAt: string
}

// ── Component ────────────────────────────────────────────────────────────

interface EnvVaultContentProps {
  /** API base path — system-admin için "/api/admin/env-vault",
   *  per-company için "/api/companies/<slug>/env-vault". Default admin. */
  apiBase?: string
}

export function EnvVaultContent({
  apiBase = "/api/admin/env-vault",
}: EnvVaultContentProps = {}) {
  const t = useTranslations("vault")
  const tSys = useTranslations("vault.systemEnvs")
  const params = useParams<{ lang?: string }>()
  const lang = params?.lang ?? "en"
  // Admin instance'da Sentroy system envs sayfasına bir kısayol göster.
  // Per-company UI (apiBase = `/api/companies/...`) için anlamsız.
  const isAdminInstance = apiBase.startsWith("/api/admin/")
  const [projects, setProjects] = useState<EnvProject[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/projects`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("common.loadFailed"))
      setProjects(json.data ?? [])
      if (!activeProjectId && json.data?.length > 0) {
        setActiveProjectId(json.data[0].id)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.loadFailed"))
    } finally {
      setLoadingProjects(false)
    }
  }, [activeProjectId, apiBase, t])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  )

  return (
    <PageTransition>
      <div className="flex h-[calc(100vh-4rem)] gap-4">
        {/* ── Sol panel: project list ───────────────────────────────── */}
        <aside className="flex w-72 flex-col gap-2 border-r pr-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t("projects.header")}</h2>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setCreateOpen(true)}
              title={t("projects.newButton")}
            >
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
            </Button>
          </div>
          {isAdminInstance ? (
            <Link
              href={`/${lang}/admin/env-vault/system`}
              className="rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground transition-colors hover:border-solid hover:bg-muted/30 hover:text-foreground"
            >
              {tSys("viewLink")} →
            </Link>
          ) : null}
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-1 pe-2">
              {loadingProjects ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-lg" />
                ))
              ) : projects.length === 0 ? (
                <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                  {t("projects.empty")}
                </p>
              ) : (
                projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActiveProjectId(p.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      "hover:bg-muted/50",
                      activeProjectId === p.id && "bg-muted font-medium",
                    )}
                  >
                    <HugeiconsIcon
                      icon={Building06Icon}
                      strokeWidth={2}
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{p.name}</div>
                      <div className="truncate font-mono text-[10px] text-muted-foreground">
                        {p.slug}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* ── Sağ panel: project detail ─────────────────────────────── */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {activeProject ? (
            <ProjectDetail
              project={activeProject}
              apiBase={apiBase}
              onProjectChanged={fetchProjects}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {t("projects.selectPrompt")}
            </div>
          )}
        </main>
      </div>

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        apiBase={apiBase}
        onCreated={fetchProjects}
      />
    </PageTransition>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────

function ProjectDetail({
  project,
  apiBase: rootApiBase,
  onProjectChanged,
}: {
  project: EnvProject
  apiBase: string
  onProjectChanged: () => void
}) {
  const t = useTranslations("vault")
  const [environment, setEnvironment] = useState(project.defaultEnvironment)
  const [environments, setEnvironments] = useState<string[]>([project.defaultEnvironment])
  const [variables, setVariables] = useState<EnvVariable[]>([])
  const [loadingVars, setLoadingVars] = useState(true)
  const [tokens, setTokens] = useState<EnvToken[]>([])
  const [webhooks, setWebhooks] = useState<EnvWebhook[]>([])
  const [audit, setAudit] = useState<AuditLog[]>([])
  const [createVarOpen, setCreateVarOpen] = useState(false)
  const [createTokenOpen, setCreateTokenOpen] = useState(false)
  const [createWebhookOpen, setCreateWebhookOpen] = useState(false)
  const [editingVar, setEditingVar] = useState<EnvVariable | null>(null)
  const [devMode, setDevMode] = useState(false)

  const apiBase = `${rootApiBase}/projects/${project.id}`

  const fetchAll = useCallback(async () => {
    setLoadingVars(true)
    try {
      const [projectRes, varsRes, tokensRes, webhooksRes, auditRes] =
        await Promise.all([
          fetch(apiBase),
          fetch(`${apiBase}/variables?environment=${encodeURIComponent(environment)}`),
          fetch(`${apiBase}/tokens`),
          fetch(`${apiBase}/webhooks`),
          fetch(`${apiBase}/audit`),
        ])
      const [projectJ, varsJ, tokensJ, webhooksJ, auditJ] = await Promise.all([
        projectRes.json(),
        varsRes.json(),
        tokensRes.json(),
        webhooksRes.json(),
        auditRes.json(),
      ])
      if (projectJ.data?.environments) {
        setEnvironments(
          projectJ.data.environments.length > 0
            ? projectJ.data.environments
            : [project.defaultEnvironment],
        )
      }
      setVariables(varsJ.data ?? [])
      setTokens(tokensJ.data ?? [])
      setWebhooks(webhooksJ.data ?? [])
      setAudit(auditJ.data ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.loadFailed"))
    } finally {
      setLoadingVars(false)
    }
  }, [apiBase, environment, project.defaultEnvironment, t])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Project değişince environment + dev mode reset
  useEffect(() => {
    setEnvironment(project.defaultEnvironment)
    setDevMode(false)
  }, [project.id, project.defaultEnvironment])

  // Environment değişince dev mode kapansın (textarea içeriği ile sync olur)
  useEffect(() => {
    setDevMode(false)
  }, [environment])

  async function deleteVariable(v: EnvVariable) {
    const ok = await confirm({
      title: t("variables.deleteTitle", { key: v.key }),
      description: t("variables.deleteDescription", { key: v.key, environment }),
      confirmText: t("variables.deleteConfirm"),
      destructive: true,
    })
    if (!ok) return
    const res = await fetch(`${apiBase}/variables/${v.id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success(t("variables.deleted"))
      fetchAll()
    } else {
      toast.error(t("variables.deleteFailed"))
    }
  }

  async function deleteToken(tk: EnvToken) {
    const ok = await confirm({
      title: t("tokens.revokeTitle", { name: tk.name }),
      description: t("tokens.revokeDescription"),
      confirmText: t("tokens.revokeConfirm"),
      destructive: true,
    })
    if (!ok) return
    const res = await fetch(`${apiBase}/tokens/${tk.id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success(t("tokens.revoked"))
      fetchAll()
    } else {
      toast.error(t("tokens.revokeFailed"))
    }
  }

  async function deleteProject() {
    const ok = await confirm({
      title: t("projects.deleteTitle", { slug: project.slug }),
      description: t("projects.deleteDescription"),
      confirmText: t("projects.deleteConfirm"),
      destructive: true,
    })
    if (!ok) return
    const res = await fetch(apiBase, { method: "DELETE" })
    if (res.ok) {
      toast.success(t("projects.deleted"))
      onProjectChanged()
    } else {
      toast.error(t("projects.deleteFailed"))
    }
  }

  async function deleteWebhook(w: EnvWebhook) {
    const ok = await confirm({
      title: t("webhooks.deleteTitle", { name: w.name }),
      description: t("webhooks.deleteDescription", { url: w.url }),
      confirmText: t("webhooks.deleteConfirm"),
      destructive: true,
    })
    if (!ok) return
    const res = await fetch(`${apiBase}/webhooks/${w.id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success(t("webhooks.deleted"))
      fetchAll()
    } else {
      toast.error(t("webhooks.deleteFailed"))
    }
  }

  async function toggleWebhook(w: EnvWebhook) {
    const res = await fetch(`${apiBase}/webhooks/${w.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !w.enabled }),
    })
    if (res.ok) {
      fetchAll()
    } else {
      toast.error(t("common.failed"))
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col gap-4">
      {/* Header */}
      <div className="flex min-w-0 items-start justify-between gap-3 border-b pb-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">{project.name}</h1>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
              {project.slug}
            </code>
            {project.description ? (
              <span className="truncate">· {project.description}</span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("environment.label")}</span>
            <Select
              value={environment}
              onValueChange={(v) => v && setEnvironment(v)}
            >
              <SelectTrigger className="h-8 w-32">
                <span className="truncate">{environment}</span>
              </SelectTrigger>
              <SelectContent>
                {environments.map((e) => (
                  <SelectItem key={e} value={e} label={e}>
                    {e}
                  </SelectItem>
                ))}
                <SelectItem value="__new__" label={t("environment.newOption")}>
                  {t("environment.newOption")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={deleteProject}>
            <HugeiconsIcon
              icon={Delete02Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("projects.deleteAction")}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="variables" className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
        <TabsList className="w-fit shrink-0">
          <TabsTrigger value="variables">
            {t("variables.header")}
            {variables.length > 0 ? (
              <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                {variables.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="tokens">
            {t("tokens.header")}
            {tokens.length > 0 ? (
              <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                {tokens.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="webhooks">
            {t("webhooks.header")}
            {webhooks.length > 0 ? (
              <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                {webhooks.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="audit">{t("audit.header")}</TabsTrigger>
        </TabsList>

        {/* Variables */}
        <TabsContent
          value="variables"
          className="flex min-h-0 min-w-0 flex-col gap-3"
        >
          <div className="flex shrink-0 items-center justify-end gap-2">
            {devMode ? null : (
              <Button size="sm" onClick={() => setCreateVarOpen(true)}>
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("variables.newButton")}
              </Button>
            )}
            <Button
              size="sm"
              variant={devMode ? "default" : "outline"}
              onClick={() => setDevMode((v) => !v)}
            >
              <HugeiconsIcon
                icon={CodeIcon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {devMode
                ? t("variables.exitDeveloperModeButton")
                : t("variables.developerModeButton")}
            </Button>
          </div>
          <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <div className="min-w-0 pe-3">
              {devMode ? (
                <DeveloperModeEditor
                  variables={variables}
                  environment={environment}
                  apiBase={apiBase}
                  onApplied={() => {
                    setDevMode(false)
                    fetchAll()
                  }}
                  onExit={() => setDevMode(false)}
                />
              ) : loadingVars ? (
                <Skeleton className="h-32 w-full rounded-lg" />
              ) : variables.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  {t("variables.empty", { environment })}
                </p>
              ) : (
                <div className="rounded-lg border">
                  {variables.map((v) => (
                    <VariableRow
                      key={v.id}
                      variable={v}
                      onEdit={() => setEditingVar(v)}
                      onDelete={() => deleteVariable(v)}
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Tokens */}
        <TabsContent
          value="tokens"
          className="flex min-h-0 min-w-0 flex-col gap-3"
        >
          <div className="flex shrink-0 items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreateTokenOpen(true)}
            >
              <HugeiconsIcon
                icon={KeyIcon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {t("tokens.newButton")}
            </Button>
          </div>
          <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <div className="min-w-0 pe-3">
              {tokens.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  {t("tokens.empty")}
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border">
                  {tokens.map((tk) => (
                    <div
                      key={tk.id}
                      className="flex items-center gap-3 border-b px-3 py-2 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 max-w-full items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {tk.name}
                          </span>
                          <Badge variant="secondary" className="text-[10px]">
                            {tk.environment}
                          </Badge>
                          {tk.permissions.map((p) => (
                            <Badge
                              key={p}
                              variant="outline"
                              className="text-[10px]"
                            >
                              {p}
                            </Badge>
                          ))}
                        </div>
                        <div className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground">
                          {tk.tokenPrefix}…{" "}
                          {tk.lastUsedAt
                            ? `· ${t("tokens.lastUsed", { date: new Date(tk.lastUsedAt).toLocaleString() })}`
                            : `· ${t("tokens.neverUsed")}`}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => deleteToken(tk)}
                        title={t("tokens.revokeAction")}
                      >
                        <HugeiconsIcon
                          icon={Delete02Icon}
                          strokeWidth={2}
                          className="text-destructive"
                        />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Webhooks */}
        <TabsContent
          value="webhooks"
          className="flex min-h-0 min-w-0 flex-col gap-3"
        >
          <div className="flex shrink-0 items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreateWebhookOpen(true)}
            >
              <HugeiconsIcon
                icon={Notification03Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {t("webhooks.newButton")}
            </Button>
          </div>
          <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <div className="min-w-0 pe-3">
              {webhooks.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  {t("webhooks.empty")}
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border">
                  {webhooks.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center gap-3 border-b px-3 py-2 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 max-w-full items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {w.name}
                          </span>
                          <Badge variant="secondary" className="text-[10px]">
                            {w.environment}
                          </Badge>
                          {!w.enabled ? (
                            <Badge variant="outline" className="text-[10px]">
                              paused
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-0.5 flex min-w-0 items-center gap-1 truncate font-mono text-[10.5px] text-muted-foreground">
                          <HugeiconsIcon
                            icon={Link04Icon}
                            strokeWidth={2}
                            className="size-3 shrink-0"
                          />
                          <span className="truncate">{w.url}</span>
                        </div>
                        <div className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                          {w.lastFiredAt
                            ? `${t("webhooks.lastFired", { date: new Date(w.lastFiredAt).toLocaleString() })}${
                                w.lastStatus
                                  ? ` · ${t("webhooks.lastStatus", { status: w.lastStatus })}`
                                  : ""
                              }`
                            : t("webhooks.neverFired")}
                          {w.lastError ? (
                            <span className="ms-1 text-destructive">
                              · {t("webhooks.lastError", { message: w.lastError })}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <label
                          className="flex items-center gap-1.5 text-xs text-muted-foreground"
                          title={t("webhooks.toggleHint")}
                        >
                          <Switch
                            checked={w.enabled}
                            onCheckedChange={() => toggleWebhook(w)}
                          />
                          {t("webhooks.toggleEnabled")}
                        </label>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => deleteWebhook(w)}
                          title={t("webhooks.deleteAction")}
                        >
                          <HugeiconsIcon
                            icon={Delete02Icon}
                            strokeWidth={2}
                            className="text-destructive"
                          />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Audit */}
        <TabsContent
          value="audit"
          className="flex min-h-0 min-w-0 flex-col gap-3"
        >
          <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <div className="min-w-0 pe-3">
              {audit.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  {t("audit.empty")}
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border font-mono text-[11.5px]">
                  {audit.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-baseline gap-2 border-b px-3 py-1.5 last:border-0"
                    >
                      <span className="shrink-0 text-muted-foreground">
                        {new Date(a.createdAt).toLocaleString()}
                      </span>
                      <Badge variant="outline" className="shrink-0 text-[9px]">
                        {a.action}
                      </Badge>
                      {a.environment ? (
                        <span className="shrink-0 text-muted-foreground">
                          {a.environment}
                        </span>
                      ) : null}
                      {a.key ? <span>{a.key}</span> : null}
                      <span className="ms-auto truncate text-muted-foreground">
                        {a.actorEmail ?? t("audit.system")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <CreateVariableDialog
        open={createVarOpen}
        onOpenChange={setCreateVarOpen}
        apiBase={apiBase}
        environment={environment}
        onSaved={fetchAll}
      />
      {editingVar ? (
        <EditVariableDialog
          variable={editingVar}
          apiBase={apiBase}
          environment={environment}
          open={!!editingVar}
          onOpenChange={(o) => !o && setEditingVar(null)}
          onSaved={fetchAll}
        />
      ) : null}
      <CreateTokenDialog
        open={createTokenOpen}
        onOpenChange={setCreateTokenOpen}
        apiBase={apiBase}
        defaultEnvironment={environment}
        environments={environments}
        onCreated={fetchAll}
      />
      <CreateWebhookDialog
        open={createWebhookOpen}
        onOpenChange={setCreateWebhookOpen}
        apiBase={apiBase}
        defaultEnvironment={environment}
        environments={environments}
        onCreated={fetchAll}
      />
    </div>
  )
}

function VariableRow({
  variable,
  onEdit,
  onDelete,
}: {
  variable: EnvVariable
  onEdit: () => void
  onDelete: () => void
}) {
  const t = useTranslations("vault")
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)

  function copy() {
    if (variable.value === null) return
    navigator.clipboard.writeText(variable.value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex min-w-0 items-center gap-3 border-b px-3 py-2 last:border-0">
      <button
        type="button"
        onClick={onEdit}
        className="-mx-3 -my-2 flex min-w-0 flex-1 flex-col items-start px-3 py-2 text-left hover:bg-muted/30"
      >
        <div className="flex min-w-0 max-w-full items-center gap-2">
          <code className="truncate text-sm font-medium">{variable.key}</code>
          {variable.public ? (
            <Badge variant="outline" className="text-[9px]">
              {t("variables.publicBadge")}
            </Badge>
          ) : null}
          {variable.decryptError ? (
            <Badge variant="destructive" className="text-[9px]">
              {t("variables.decryptError")}
            </Badge>
          ) : null}
        </div>
        <div className="mt-0.5 max-w-full truncate font-mono text-[11.5px] text-muted-foreground">
          {variable.value === null
            ? t("variables.decryptFailed")
            : revealed
              ? variable.value
              : "•".repeat(Math.min(20, variable.value.length || 1))}
        </div>
      </button>
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setRevealed((v) => !v)}
          disabled={variable.value === null}
          title={revealed ? t("variables.rowHide") : t("variables.rowReveal")}
        >
          <HugeiconsIcon
            icon={revealed ? ViewOffIcon : ViewIcon}
            strokeWidth={2}
          />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={copy}
          disabled={variable.value === null}
          title={t("variables.rowCopy")}
        >
          <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} strokeWidth={2} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          title={t("variables.rowDelete")}
        >
          <HugeiconsIcon
            icon={Delete02Icon}
            strokeWidth={2}
            className="text-destructive"
          />
        </Button>
      </div>
    </div>
  )
}

// ── Developer mode (.env editor) ─────────────────────────────────────────

interface ParsedEntry {
  key: string
  value: string
  public: boolean
  description: string | null
}

interface ParseResult {
  entries: ParsedEntry[]
  errors: { line: number; message: string }[]
}

/**
 * Parses .env-style text into structured entries.
 *
 * Supported per line:
 *   - blank → resets pending description/public
 *   - `# @public`           → next variable is public
 *   - `# any text`          → appended to next variable's description
 *   - `KEY=value`           → emits entry
 *   - `KEY="quoted value"`  → unquoted
 *   - `KEY='quoted value'`  → unquoted
 *   - `export KEY=value`    → 'export ' prefix stripped
 *
 * Anything else is reported as a parse error (with line number).
 * Duplicate keys also reported.
 *
 * @param parseInvalidSyntax / @param parseInvalidKey / @param duplicateKey
 *   come in pre-translated so the parser stays pure.
 */
function parseEnvText(
  text: string,
  msgs: {
    invalidSyntax: string
    invalidKey: string
    duplicateKey: (key: string) => string
  },
): ParseResult {
  const lines = text.split(/\r?\n/)
  const entries: ParsedEntry[] = []
  const errors: { line: number; message: string }[] = []
  const seen = new Set<string>()

  let pendingDescription: string[] = []
  let pendingPublic = false

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw?.trim() ?? ""

    if (line === "") {
      pendingDescription = []
      pendingPublic = false
      continue
    }

    if (line.startsWith("#")) {
      const body = line.slice(1).trim()
      if (body === "@public") {
        pendingPublic = true
      } else if (body) {
        pendingDescription.push(body)
      }
      continue
    }

    const work = line.startsWith("export ") ? line.slice(7).trimStart() : line
    const eq = work.indexOf("=")
    if (eq <= 0) {
      errors.push({ line: i + 1, message: msgs.invalidSyntax })
      pendingDescription = []
      pendingPublic = false
      continue
    }
    const key = work.slice(0, eq).trim()
    let value = work.slice(eq + 1)

    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
      errors.push({ line: i + 1, message: msgs.invalidKey })
      pendingDescription = []
      pendingPublic = false
      continue
    }

    // strip surrounding quotes (single or double)
    const trimmedValue = value.trim()
    if (
      (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
      (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
    ) {
      value = trimmedValue.slice(1, -1)
      if (trimmedValue.startsWith('"')) {
        // basic escape decoding for double-quoted values
        value = value.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\")
      }
    } else {
      value = trimmedValue
    }

    if (seen.has(key)) {
      errors.push({ line: i + 1, message: msgs.duplicateKey(key) })
      pendingDescription = []
      pendingPublic = false
      continue
    }
    seen.add(key)

    entries.push({
      key,
      value,
      public: pendingPublic,
      description: pendingDescription.length > 0 ? pendingDescription.join(" ") : null,
    })

    pendingDescription = []
    pendingPublic = false
  }

  return { entries, errors }
}

/** Serialize current variables into the same .env format that parseEnvText accepts. */
function serializeVariables(variables: EnvVariable[]): string {
  const blocks: string[] = []
  for (const v of variables) {
    const parts: string[] = []
    if (v.description) {
      parts.push(`# ${v.description}`)
    }
    if (v.public) {
      parts.push("# @public")
    }
    const value = v.value ?? ""
    const needsQuote = /[\s"'#$`\\]/.test(value) || value === ""
    const escaped = needsQuote
      ? `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`
      : value
    parts.push(`${v.key}=${escaped}`)
    blocks.push(parts.join("\n"))
  }
  return blocks.join("\n\n")
}

interface VarDiff {
  added: ParsedEntry[]
  updated: { entry: ParsedEntry; existing: EnvVariable }[]
  deleted: EnvVariable[]
}

function diffEntries(parsed: ParsedEntry[], existing: EnvVariable[]): VarDiff {
  const existingByKey = new Map(existing.map((v) => [v.key, v]))
  const added: ParsedEntry[] = []
  const updated: { entry: ParsedEntry; existing: EnvVariable }[] = []

  for (const entry of parsed) {
    const ex = existingByKey.get(entry.key)
    if (!ex) {
      added.push(entry)
      continue
    }
    const valueChanged = (ex.value ?? "") !== entry.value
    const publicChanged = ex.public !== entry.public
    const descChanged = (ex.description ?? "") !== (entry.description ?? "")
    if (valueChanged || publicChanged || descChanged) {
      updated.push({ entry, existing: ex })
    }
  }

  const parsedKeys = new Set(parsed.map((e) => e.key))
  const deleted = existing.filter((v) => !parsedKeys.has(v.key))

  return { added, updated, deleted }
}

function DeveloperModeEditor({
  variables,
  environment,
  apiBase,
  onApplied,
  onExit,
}: {
  variables: EnvVariable[]
  environment: string
  apiBase: string
  onApplied: () => void
  onExit: () => void
}) {
  const t = useTranslations("vault")
  const initial = useMemo(() => serializeVariables(variables), [variables])
  const [text, setText] = useState(initial)
  const [saving, setSaving] = useState(false)

  // Re-seed when the underlying variables change (env switch, refetch)
  useEffect(() => {
    setText(initial)
  }, [initial])

  const parse = useMemo(
    () =>
      parseEnvText(text, {
        invalidSyntax: t("developerMode.parseInvalidSyntax"),
        invalidKey: t("developerMode.parseInvalidKey"),
        duplicateKey: (key) => t("developerMode.duplicateKey", { key }),
      }),
    [text, t],
  )

  const diff = useMemo(
    () => diffEntries(parse.entries, variables),
    [parse.entries, variables],
  )

  const dirty = text !== initial
  const hasChanges =
    diff.added.length > 0 || diff.updated.length > 0 || diff.deleted.length > 0
  const hasErrors = parse.errors.length > 0

  async function handleExit() {
    if (dirty) {
      const ok = await confirm({
        title: t("developerMode.exitConfirmTitle"),
        description: t("developerMode.exitConfirmDescription"),
        confirmText: t("developerMode.exitConfirmButton"),
        destructive: true,
      })
      if (!ok) return
    }
    onExit()
  }

  async function handleSave() {
    if (hasErrors) {
      toast.error(parse.errors[0]
        ? t("developerMode.parseError", {
            line: parse.errors[0].line,
            message: parse.errors[0].message,
          })
        : t("developerMode.saveFailed"))
      return
    }
    if (!hasChanges) {
      toast.info(t("developerMode.noChanges"))
      return
    }

    if (diff.deleted.length > 0) {
      const ok = await confirm({
        title: t("developerMode.deleteConfirmTitle", { count: diff.deleted.length }),
        description: t("developerMode.deleteConfirmDescription", {
          keys: diff.deleted.map((v) => v.key).join(", "),
          environment,
        }),
        confirmText: t("developerMode.deleteConfirmButton"),
        destructive: true,
      })
      if (!ok) return
    }

    setSaving(true)
    try {
      // upserts: POST /variables (server treats as upsert by env+key)
      const upserts = [...diff.added, ...diff.updated.map((u) => u.entry)]
      for (const entry of upserts) {
        const res = await fetch(`${apiBase}/variables`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            environment,
            key: entry.key,
            value: entry.value,
            public: entry.public,
            description: entry.description,
          }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `${entry.key}: ${res.status}`)
        }
      }
      // deletes
      for (const v of diff.deleted) {
        const res = await fetch(`${apiBase}/variables/${v.id}`, { method: "DELETE" })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `${v.key}: ${res.status}`)
        }
      }
      toast.success(
        t("developerMode.saveSuccess", {
          added: diff.added.length,
          updated: diff.updated.length,
          deleted: diff.deleted.length,
        }),
      )
      onApplied()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("developerMode.saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {t("developerMode.description", { environment })}
      </p>
      {/* min-w-0 wrapper guarantees the textarea cannot push the parent
          column wider than its share of the flex layout, even if shadcn's
          field-sizing utility re-orders ahead of our override class. */}
      <div className="w-full min-w-0 overflow-hidden">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={20}
          spellCheck={false}
          wrap="soft"
          placeholder={t("developerMode.placeholder")}
          // Inline style is cascade-proof — guarantees the textarea sticks
          // to its parent's width even with very long no-whitespace values.
          style={{ fieldSizing: "fixed" } as React.CSSProperties}
          className="block h-[28rem] max-h-[60vh] w-full max-w-full min-w-0 resize-y overflow-auto font-mono text-xs leading-relaxed"
        />
      </div>
      {hasErrors ? (
        <div className="flex flex-col gap-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
          {parse.errors.slice(0, 5).map((err, i) => (
            <div key={i} className="flex items-center gap-2">
              <HugeiconsIcon
                icon={Alert02Icon}
                strokeWidth={2}
                className="size-3.5 shrink-0 text-destructive"
              />
              <span className="font-mono">
                {t("developerMode.parseError", { line: err.line, message: err.message })}
              </span>
            </div>
          ))}
          {parse.errors.length > 5 ? (
            <div className="text-muted-foreground">
              … +{parse.errors.length - 5}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-xs text-muted-foreground font-mono">
          {hasChanges
            ? t("developerMode.summary", {
                added: diff.added.length,
                updated: diff.updated.length,
                deleted: diff.deleted.length,
              })
            : t("developerMode.noChanges")}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExit} disabled={saving}>
            {t("developerMode.exit")}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || hasErrors || !hasChanges}
          >
            {saving && (
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="animate-spin"
                data-icon="inline-start"
              />
            )}
            {t("developerMode.save")}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Dialogs ──────────────────────────────────────────────────────────────

function CreateProjectDialog({
  open,
  onOpenChange,
  apiBase,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  apiBase: string
  onCreated: () => void
}) {
  const t = useTranslations("vault")
  const [slug, setSlug] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [defaultEnv, setDefaultEnv] = useState("prod")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setSlug("")
      setName("")
      setDescription("")
      setDefaultEnv("prod")
    }
  }, [open])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`${apiBase}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          name,
          description: description || null,
          defaultEnvironment: defaultEnv,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("common.failed"))
      toast.success(t("projects.created"))
      onOpenChange(false)
      onCreated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.failed"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("projects.createTitle")}</DialogTitle>
          <DialogDescription>{t("projects.createDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">{t("projects.slugLabel")}</label>
            <Input
              value={slug}
              onChange={(e) =>
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
              }
              placeholder="my-blog"
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">{t("projects.nameLabel")}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Blog"
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">
              {t("projects.descriptionLabel")}
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">
              {t("projects.defaultEnvLabel")}
            </label>
            <Input
              value={defaultEnv}
              onChange={(e) =>
                setDefaultEnv(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
              }
              placeholder="prod"
              disabled={saving}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving || !slug || !name}>
            {saving && (
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="animate-spin"
                data-icon="inline-start"
              />
            )}
            {t("projects.createSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreateVariableDialog({
  open,
  onOpenChange,
  apiBase,
  environment,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  apiBase: string
  environment: string
  onSaved: () => void
}) {
  const t = useTranslations("vault")
  const [key, setKey] = useState("")
  const [value, setValue] = useState("")
  const [isPublic, setIsPublic] = useState(false)
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setKey("")
      setValue("")
      setIsPublic(false)
      setDescription("")
    }
  }, [open])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`${apiBase}/variables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environment,
          key,
          value,
          public: isPublic,
          description: description || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("common.failed"))
      toast.success(t("variables.saved"))
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.failed"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("variables.createTitle", { environment })}</DialogTitle>
          <DialogDescription>{t("variables.createDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">{t("variables.keyLabel")}</label>
            <Input
              value={key}
              onChange={(e) =>
                setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))
              }
              placeholder="DATABASE_URL"
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">{t("variables.valueLabel")}</label>
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={4}
              disabled={saving}
              className="font-mono text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">
              {t("projects.descriptionLabel")}
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
            />
          </div>
          <label className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">{t("variables.publicLabel")}</div>
              <div className="text-xs text-muted-foreground">
                {t("variables.publicHint")}
              </div>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </label>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving || !key}>
            {saving && (
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="animate-spin"
                data-icon="inline-start"
              />
            )}
            {t("variables.createSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditVariableDialog({
  variable,
  apiBase,
  environment,
  open,
  onOpenChange,
  onSaved,
}: {
  variable: EnvVariable
  apiBase: string
  environment: string
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const t = useTranslations("vault")
  const [value, setValue] = useState(variable.value ?? "")
  const [isPublic, setIsPublic] = useState(variable.public)
  const [description, setDescription] = useState(variable.description ?? "")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setValue(variable.value ?? "")
      setIsPublic(variable.public)
      setDescription(variable.description ?? "")
    }
  }, [open, variable])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`${apiBase}/variables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environment,
          key: variable.key,
          value,
          public: isPublic,
          description: description || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("common.failed"))
      toast.success(t("variables.updated"))
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.failed"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <code>{variable.key}</code>
          </DialogTitle>
          <DialogDescription>
            {t("variables.editDescription", { environment })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {variable.decryptError ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
              <HugeiconsIcon
                icon={Alert02Icon}
                strokeWidth={2}
                className="mt-0.5 size-3.5 shrink-0 text-destructive"
              />
              <span>{t("variables.decryptWarning")}</span>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">{t("variables.valueLabel")}</label>
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={4}
              disabled={saving}
              className="font-mono text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">
              {t("projects.descriptionLabel")}
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
            />
          </div>
          <label className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">{t("variables.publicLabel")}</div>
              <div className="text-xs text-muted-foreground">
                {t("variables.publicHintShort")}
              </div>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </label>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && (
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="animate-spin"
                data-icon="inline-start"
              />
            )}
            {t("variables.createSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreateTokenDialog({
  open,
  onOpenChange,
  apiBase,
  defaultEnvironment,
  environments,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  apiBase: string
  defaultEnvironment: string
  environments: string[]
  onCreated: () => void
}) {
  const t = useTranslations("vault")
  const [name, setName] = useState("")
  const [environment, setEnvironment] = useState(defaultEnvironment)
  const [permissions, setPermissions] = useState<("read" | "write")[]>(["read"])
  const [expiresAt, setExpiresAt] = useState("")
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<{ plainToken: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open) {
      setName("")
      setEnvironment(defaultEnvironment)
      setPermissions(["read"])
      setExpiresAt("")
      setCreated(null)
    }
  }, [open, defaultEnvironment])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`${apiBase}/tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          environment,
          permissions,
          expiresAt: expiresAt || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("common.failed"))
      setCreated({ plainToken: json.data.plainToken })
      onCreated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.failed"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("tokens.createdTitle")}</DialogTitle>
              <DialogDescription>{t("tokens.createdDescription")}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
                <code className="flex-1 break-all font-mono text-xs">
                  {created.plainToken}
                </code>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    navigator.clipboard.writeText(created.plainToken)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                  }}
                >
                  <HugeiconsIcon
                    icon={copied ? Tick02Icon : Copy01Icon}
                    strokeWidth={2}
                  />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("tokens.createdHint")}</p>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>
                {t("tokens.createdDone")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("tokens.createTitle")}</DialogTitle>
              <DialogDescription>{t("tokens.createDescription")}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">{t("tokens.nameLabel")}</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="prod-coolify"
                  disabled={saving}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">
                  {t("tokens.environmentLabel")}
                </label>
                <Select
                  value={environment}
                  onValueChange={(v) => v && setEnvironment(v)}
                >
                  <SelectTrigger>
                    <span className="truncate">{environment}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {environments.map((e) => (
                      <SelectItem key={e} value={e} label={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">{t("tokens.expiresLabel")}</label>
                <Input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  disabled={saving}
                />
              </div>
              <label className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="text-sm font-medium">
                    {t("tokens.writePermissionLabel")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("tokens.writePermissionHint")}
                  </div>
                </div>
                <Switch
                  checked={permissions.includes("write")}
                  onCheckedChange={(c) =>
                    setPermissions(c ? ["read", "write"] : ["read"])
                  }
                />
              </label>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                {t("common.cancel")}
              </Button>
              <Button onClick={handleSave} disabled={saving || !name || !environment}>
                {saving && (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    strokeWidth={2}
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                )}
                {t("tokens.generateButton")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function CreateWebhookDialog({
  open,
  onOpenChange,
  apiBase,
  defaultEnvironment,
  environments,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  apiBase: string
  defaultEnvironment: string
  environments: string[]
  onCreated: () => void
}) {
  const t = useTranslations("vault")
  const [name, setName] = useState("")
  const [environment, setEnvironment] = useState(defaultEnvironment)
  const [url, setUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<{ plainSecret: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open) {
      setName("")
      setEnvironment(defaultEnvironment)
      setUrl("")
      setCreated(null)
    }
  }, [open, defaultEnvironment])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`${apiBase}/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, environment, url }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("common.failed"))
      setCreated({ plainSecret: json.data.plainSecret })
      onCreated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.failed"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("webhooks.createdTitle")}</DialogTitle>
              <DialogDescription>
                {t("webhooks.createdDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
                <code className="flex-1 break-all font-mono text-xs">
                  {created.plainSecret}
                </code>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    navigator.clipboard.writeText(created.plainSecret)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                  }}
                >
                  <HugeiconsIcon
                    icon={copied ? Tick02Icon : Copy01Icon}
                    strokeWidth={2}
                  />
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>
                {t("webhooks.createdDone")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("webhooks.createTitle")}</DialogTitle>
              <DialogDescription>
                {t("webhooks.createDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">
                  {t("webhooks.nameLabel")}
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="prod-app"
                  disabled={saving}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">
                  {t("webhooks.environmentLabel")}
                </label>
                <Select
                  value={environment}
                  onValueChange={(v) => v && setEnvironment(v)}
                >
                  <SelectTrigger>
                    <span className="truncate">{environment}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {environments.map((e) => (
                      <SelectItem key={e} value={e} label={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">
                  {t("webhooks.urlLabel")}
                </label>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={t("webhooks.urlPlaceholder")}
                  disabled={saving}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !name || !environment || !url}
              >
                {saving && (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    strokeWidth={2}
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                )}
                {t("webhooks.createSubmit")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
