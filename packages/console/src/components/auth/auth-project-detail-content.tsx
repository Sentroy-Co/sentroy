"use client"

import { useEffect, useState, useCallback, useMemo, type MouseEvent as ReactMouseEvent } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useTranslations, useLocale } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  UserGroup02Icon,
  Settings02Icon,
  RefreshIcon,
  Delete02Icon,
  ChartBarLineIcon,
  UserBlock01Icon,
  KeyIcon,
  PulseIcon,
  WebhookIcon,
  PlusSignIcon,
  Edit02Icon,
  Copy01Icon,
  Tick02Icon,
  Mail01Icon as MailEditorIcon,
} from "@hugeicons/core-free-icons"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  BarChart,
  Bar,
} from "recharts"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@workspace/ui/components/tabs"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { Badge } from "@workspace/ui/components/badge"
import { Switch } from "@workspace/ui/components/switch"
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
import { confirm } from "@workspace/console/stores/confirm"
import { PageTransition, LocalizedField, type LocalizedValue } from "@workspace/console/components/shared"
import { CodeBlock } from "@workspace/console/components/marketing"
import { AUTH_MAIL_PRESETS, findPreset } from "@workspace/console/lib/auth-mail-presets"

/**
 * Auth Project detail — tabs:
 *   overview — stats, JWKS URL, public endpoints
 *   users — paginated end-user list + revoke-sessions, delete
 *   settings — branding, password policy, allowed origins, status toggle
 *   api-keys — rotate, prefix display
 *
 * i18n: console.json `authProjects.detail.*` namespace.
 */

interface AuthProjectDetail {
  id: string
  name: string
  slug: string
  projectId: string
  apiKeyPrefix: string
  enabled: boolean
  plan: "free" | "pro"
  maxMau: number
  maxSignupsPerHour: number
  branding: {
    displayName: string
    primaryColor: string | null
    logoUrl: string | null
  }
  emailVerificationRequired: boolean
  magicLinkEnabled: boolean
  passwordPolicy: {
    minLength: number
    requireUppercase: boolean
    requireNumber: boolean
  }
  allowedOrigins: string[]
  jwtSigningMode: "RS256"
  quotaUsage: { mau: number; signupsThisHour: number }
  stats: { users: number }
  rsaPublicJwk: Record<string, unknown>
  previousRsaPublicJwk: Record<string, unknown> | null
  previousRotatedAt: string | null
  customClaims?: {
    fromMetadata: string[]
    staticClaims: Record<string, string | number | boolean>
  }
  socialProviders?: {
    google?: { enabled: boolean; clientId: string; clientSecretEncrypted: string }
    github?: { enabled: boolean; clientId: string; clientSecretEncrypted: string }
    facebook?: { enabled: boolean; clientId: string; clientSecretEncrypted: string }
    microsoft?: {
      enabled: boolean
      clientId: string
      clientSecretEncrypted: string
      tenant?: string
    }
    twitter?: { enabled: boolean; clientId: string; clientSecretEncrypted: string }
    apple?: {
      enabled: boolean
      clientId: string
      teamId: string
      keyId: string
      privateKeyEncrypted: string
    }
  }
  createdAt: string
}

interface AuthProjectUser {
  id: string
  email: string
  emailVerified: boolean
  displayName: string | null
  image: string | null
  lastLoginAt: string | null
  lockedUntil: string | null
  createdAt: string
}

export function AuthProjectDetailContent({ projectId }: { projectId: string }) {
  const params = useParams<{ "company-slug": string; lang?: string }>()
  const companySlug = params["company-slug"]
  const lang = params.lang ?? "en"
  const apiBase = `/api/companies/${companySlug}/auth-projects/${projectId}`
  const t = useTranslations("authProjects.detail")

  const [project, setProject] = useState<AuthProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<
    | "overview"
    | "users"
    | "activity"
    | "webhooks"
    | "emails"
    | "settings"
    | "api-keys"
  >("overview")

  const fetchProject = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(apiBase)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("loadFailed"))
      setProject(json.data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [apiBase, t])

  useEffect(() => {
    fetchProject()
  }, [fetchProject])

  if (loading || !project) {
    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col gap-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-full w-full" />
      </div>
    )
  }

  const authPublicBase =
    typeof window !== "undefined"
      ? `${window.location.origin}`
      : "https://auth.sentroy.com"

  return (
    <PageTransition>
      <div className="flex h-[calc(100vh-4rem)] min-w-0 flex-col gap-4">
        <div className="flex min-w-0 items-start justify-between gap-3 border-b pb-4">
          <div className="flex min-w-0 flex-col gap-1">
            <Link
              href={`/${lang}/d/${companySlug}/auth-projects`}
              className="inline-flex w-fit items-center gap-1 text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon
                icon={ArrowLeft01Icon}
                strokeWidth={2}
                className="size-3"
              />
              {t("back")}
            </Link>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{project.name}</h1>
              {!project.enabled ? (
                <Badge variant="outline">{t("disabledBadge")}</Badge>
              ) : null}
              <Badge
                variant={project.plan === "pro" ? "default" : "secondary"}
                className="text-[10px] uppercase"
              >
                {project.plan}
              </Badge>
            </div>
            <code className="text-[11px] text-muted-foreground">
              {project.slug}
            </code>
          </div>
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as typeof tab)}
          className="min-h-0 min-w-0 flex-1"
        >
          <TabsList>
            <TabsTrigger value="overview">
              <HugeiconsIcon
                icon={ChartBarLineIcon}
                strokeWidth={2}
                className="size-3.5"
              />
              {t("tabs.overview")}
            </TabsTrigger>
            <TabsTrigger value="users">
              <HugeiconsIcon
                icon={UserGroup02Icon}
                strokeWidth={2}
                className="size-3.5"
              />
              {t("tabs.users")} ({project.stats.users})
            </TabsTrigger>
            <TabsTrigger value="activity">
              <HugeiconsIcon
                icon={PulseIcon}
                strokeWidth={2}
                className="size-3.5"
              />
              {t("tabs.activity")}
            </TabsTrigger>
            <TabsTrigger value="webhooks">
              <HugeiconsIcon
                icon={WebhookIcon}
                strokeWidth={2}
                className="size-3.5"
              />
              {t("tabs.webhooks")}
            </TabsTrigger>
            <TabsTrigger value="emails">
              <HugeiconsIcon
                icon={MailEditorIcon}
                strokeWidth={2}
                className="size-3.5"
              />
              {t("tabs.emails")}
            </TabsTrigger>
            <TabsTrigger value="settings">
              <HugeiconsIcon
                icon={Settings02Icon}
                strokeWidth={2}
                className="size-3.5"
              />
              {t("tabs.settings")}
            </TabsTrigger>
            <TabsTrigger value="api-keys">
              <HugeiconsIcon
                icon={KeyIcon}
                strokeWidth={2}
                className="size-3.5"
              />
              {t("tabs.apiKey")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="min-h-0 min-w-0 flex-1">
            <ScrollArea className="h-full">
              <div className="pe-3">
                <OverviewTab
                  project={project}
                  apiBase={apiBase}
                  authPublicBase={authPublicBase}
                  onReload={fetchProject}
                />
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="users" className="min-h-0 min-w-0 flex-1">
            <UsersTab apiBase={apiBase} onReload={fetchProject} />
          </TabsContent>

          <TabsContent value="activity" className="min-h-0 min-w-0 flex-1">
            <ScrollArea className="h-full">
              <div className="pe-3">
                <ActivityTab apiBase={apiBase} />
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="webhooks" className="min-h-0 min-w-0 flex-1">
            <ScrollArea className="h-full">
              <div className="pe-3">
                <WebhooksTab apiBase={apiBase} />
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="emails" className="min-h-0 min-w-0 flex-1">
            <ScrollArea className="h-full">
              <div className="pe-3">
                <EmailTemplatesTab apiBase={apiBase} />
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="settings" className="min-h-0 min-w-0 flex-1">
            <ScrollArea className="h-full">
              <div className="pe-3">
                <SettingsTab
                  apiBase={apiBase}
                  project={project}
                  onSaved={fetchProject}
                />
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="api-keys" className="min-h-0 min-w-0 flex-1">
            <ScrollArea className="h-full">
              <div className="pe-3">
                <ApiKeysTab apiBase={apiBase} project={project} />
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </PageTransition>
  )
}

// ─── Overview ─────────────────────────────────────────────────────────────

function OverviewTab({
  project,
  apiBase,
  authPublicBase,
  onReload,
}: {
  project: AuthProjectDetail
  apiBase: string
  authPublicBase: string
  onReload: () => void
}) {
  const t = useTranslations("authProjects.detail.overview")
  const [rotating, setRotating] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null)

  async function rotateJwtKey() {
    const ok = await confirm({
      title: t("rotateJwtTitle"),
      description: t("rotateJwtDescription"),
      confirmText: t("rotateJwtAction"),
      destructive: true,
    })
    if (!ok) return
    setRotating(true)
    try {
      const res = await fetch(`${apiBase}?action=rotate-jwt-key`, {
        method: "PATCH",
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || t("rotateJwtFailed"))
        return
      }
      toast.success(t("rotateJwtSuccess"))
      onReload()
    } finally {
      setRotating(false)
    }
  }

  async function clearPreviousJwtKey() {
    const ok = await confirm({
      title: t("clearPreviousTitle"),
      description: t("clearPreviousDescription"),
      confirmText: t("clearPreviousAction"),
      destructive: true,
    })
    if (!ok) return
    setClearing(true)
    try {
      const res = await fetch(`${apiBase}?action=clear-previous-jwt-key`, {
        method: "PATCH",
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || t("clearPreviousFailed"))
        return
      }
      toast.success(t("clearPreviousSuccess"))
      onReload()
    } finally {
      setClearing(false)
    }
  }
  const endpoints: EndpointSpec[] = [
    {
      label: t("endpoint.signup"),
      path: `/api/v1/auth/${project.slug}/signup`,
      method: "POST",
      body: `{
  "email": "alice@example.com",
  "password": "hunter2-strong",
  "displayName": "Alice"
}`,
      sdk: `await auth.signUp({
  email: "alice@example.com",
  password: "hunter2-strong",
  displayName: "Alice",
})`,
    },
    {
      label: t("endpoint.login"),
      path: `/api/v1/auth/${project.slug}/login`,
      method: "POST",
      body: `{
  "email": "alice@example.com",
  "password": "hunter2-strong"
}`,
      sdk: `const session = await auth.signIn({
  email: "alice@example.com",
  password: "hunter2-strong",
})`,
    },
    {
      label: t("endpoint.refresh"),
      path: `/api/v1/auth/${project.slug}/refresh`,
      method: "POST",
      body: `{
  "refreshToken": "<refresh-token-from-previous-login>"
}`,
      sdk: `const next = await auth.refresh(session.refreshToken)`,
    },
    {
      label: t("endpoint.userinfo"),
      path: `/api/v1/auth/${project.slug}/userinfo`,
      method: "GET",
      sdk: `const user = await auth.userInfo(session.accessToken)`,
    },
    {
      label: t("endpoint.verifyEmail"),
      path: `/api/v1/auth/${project.slug}/verify-email`,
      method: "POST",
      body: `{
  "token": "<single-use-token-from-verification-email>"
}`,
      sdk: `await auth.verifyEmail({ token })`,
    },
    {
      label: t("endpoint.passwordResetRequest"),
      path: `/api/v1/auth/${project.slug}/password-reset/request`,
      method: "POST",
      body: `{
  "email": "alice@example.com"
}`,
      sdk: `await auth.requestPasswordReset({ email: "alice@example.com" })`,
    },
    {
      label: t("endpoint.passwordResetConfirm"),
      path: `/api/v1/auth/${project.slug}/password-reset/confirm`,
      method: "POST",
      body: `{
  "token": "<single-use-token-from-reset-email>",
  "newPassword": "new-stronger-pass-2026"
}`,
      sdk: `await auth.confirmPasswordReset({
  token,
  newPassword: "new-stronger-pass-2026",
})`,
    },
    {
      label: t("endpoint.logout"),
      path: `/api/v1/auth/${project.slug}/logout`,
      method: "POST",
      body: `{
  "refreshToken": "<refresh-token-to-revoke>"
}`,
      sdk: `await auth.signOut(session.refreshToken)`,
    },
    {
      label: t("endpoint.jwks"),
      path: `/api/v1/auth/${project.slug}/jwks.json`,
      method: "GET",
      isPublic: true,
    },
  ]

  const usagePct = Math.min(100, (project.quotaUsage.mau / project.maxMau) * 100)

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={t("activeUsers")}
          value={project.quotaUsage.mau.toLocaleString()}
          hint={t("activeUsersHint", { max: project.maxMau.toLocaleString() })}
        />
        <StatCard
          label={t("signupsThisHour")}
          value={project.quotaUsage.signupsThisHour.toLocaleString()}
          hint={t("signupsHint", { max: project.maxSignupsPerHour })}
        />
        <StatCard
          label={t("jwtMode")}
          value={project.jwtSigningMode}
          hint={t("jwtModeHint")}
        />
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t("poolUsage")}</h3>
          <span className="text-xs text-muted-foreground">
            {usagePct.toFixed(1)}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${usagePct}%`,
              background: project.branding.primaryColor || "#111",
            }}
          />
        </div>
        {project.plan === "free" && usagePct > 75 ? (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-500">
            {t("freeLimitWarn")}
          </p>
        ) : null}
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">{t("endpointsTitle")}</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          {t("endpointsHint")}
        </p>
        <div className="flex flex-col gap-2">
          {endpoints.map((e) => (
            <EndpointCard
              key={e.path}
              endpoint={e}
              authPublicBase={authPublicBase}
              expanded={expandedEndpoint === e.path}
              onToggle={() =>
                setExpandedEndpoint((prev) => (prev === e.path ? null : e.path))
              }
              apiKeyPrefix={project.apiKeyPrefix}
            />
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">{t("jwksTitle")}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("jwksHint")}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={rotateJwtKey}
            disabled={rotating}
            className="h-7 shrink-0 text-[11px]"
          >
            {rotating ? t("rotateJwtBusy") : t("rotateJwtButton")}
          </Button>
        </div>
        <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-md border bg-muted/40 p-3 text-[11px] leading-relaxed">
          <code>{JSON.stringify(project.rsaPublicJwk, null, 2)}</code>
        </pre>
        {project.previousRsaPublicJwk ? (
          <div className="mt-4 rounded-md border border-amber-300/50 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                  {t("previousJwtTitle")}
                </h4>
                <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-300">
                  {project.previousRotatedAt
                    ? t("previousJwtRotatedAt", {
                        date: new Date(project.previousRotatedAt).toLocaleString(),
                      })
                    : t("previousJwtHint")}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={clearPreviousJwtKey}
                disabled={clearing}
                className="h-7 shrink-0 text-[11px] text-amber-900 dark:text-amber-200"
              >
                {clearing ? t("clearPreviousBusy") : t("clearPreviousButton")}
              </Button>
            </div>
            <pre className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-amber-300/50 bg-amber-100/50 p-2 text-[10px] dark:border-amber-900/50 dark:bg-amber-950/50">
              <code>{JSON.stringify(project.previousRsaPublicJwk, null, 2)}</code>
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  )
}

// ─── Endpoint card (expandable, syntax-highlighted samples) ──────────────

interface EndpointSpec {
  label: string
  path: string
  method: string
  /** JSON body string for POST/PUT/PATCH. Undefined → no body in cURL. */
  body?: string
  /** TypeScript SDK snippet. Undefined → hide TS tab. */
  sdk?: string
  /** True for endpoints that need no Authorization header (e.g. jwks.json). */
  isPublic?: boolean
}

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  POST: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  PUT: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  PATCH: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  DELETE: "bg-red-500/15 text-red-700 dark:text-red-300",
}

function EndpointCard({
  endpoint,
  authPublicBase,
  expanded,
  onToggle,
  apiKeyPrefix,
}: {
  endpoint: EndpointSpec
  authPublicBase: string
  expanded: boolean
  onToggle: () => void
  apiKeyPrefix: string
}) {
  // NOTE: i18n keys `endpointShowExample` / `endpointCopy` referenced below
  // need to be added to packages/console/messages/{en,tr}.json under
  // `authProjects.detail.overview` if missing — fallback strings inline.
  const t = useTranslations("authProjects.detail.overview")
  const [tab, setTab] = useState<"curl" | "ts">("curl")
  const [copied, setCopied] = useState(false)

  const fullUrl = `${authPublicBase}${endpoint.path}`
  const methodClass =
    METHOD_COLORS[endpoint.method] ?? "bg-muted text-muted-foreground"

  // Build cURL example.
  const authHeader = endpoint.isPublic
    ? ""
    : `  -H "Authorization: Bearer ${apiKeyPrefix || "aps_"}..." \\\n`
  const contentTypeHeader = endpoint.body
    ? `  -H "Content-Type: application/json" \\\n`
    : ""
  const dataLine = endpoint.body
    ? `  -d '${endpoint.body.replace(/\n\s*/g, " ")}'`
    : ""
  const curlExample = `curl -X ${endpoint.method} "${fullUrl}" \\\n${authHeader}${contentTypeHeader}${dataLine}`.replace(
    /\\\n$/,
    "",
  )

  // Build TS SDK example (with init context comment).
  const sdkExample = endpoint.sdk
    ? `// import { SentroyAuth } from "@sentroy-co/auth-sdk"
// const auth = new SentroyAuth({ projectSlug: "${endpoint.path.split("/")[4] || "..."}", apiKey: "${apiKeyPrefix || "aps_"}..." })

${endpoint.sdk}`
    : null

  async function copyUrl(ev: ReactMouseEvent) {
    ev.stopPropagation()
    try {
      await navigator.clipboard.writeText(fullUrl)
      setCopied(true)
      toast.success(t("endpointCopy") || "Copied")
      setTimeout(() => setCopied(false), 1200)
    } catch {
      toast.error(t("endpointCopy") || "Copy failed")
    }
  }

  return (
    <div className="overflow-hidden rounded-md border bg-card transition-colors">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
      >
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${methodClass}`}
        >
          {endpoint.method}
        </span>
        <code className="min-w-0 flex-1 truncate text-[11px] text-foreground">
          {fullUrl}
        </code>
        <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">
          {endpoint.label}
        </span>
        <span
          role="button"
          tabIndex={0}
          aria-label={t("endpointCopy") || "Copy URL"}
          onClick={copyUrl}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault()
              ev.stopPropagation()
              void copyUrl(ev as unknown as ReactMouseEvent)
            }
          }}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <HugeiconsIcon
            icon={copied ? Tick02Icon : Copy01Icon}
            size={12}
            strokeWidth={2}
          />
        </span>
        <span
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground transition-transform"
          style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
          aria-hidden="true"
        >
          <HugeiconsIcon icon={ArrowRight01Icon} size={12} strokeWidth={2} />
        </span>
      </button>

      {expanded ? (
        <div className="border-t bg-muted/20 p-3">
          {sdkExample ? (
            <div className="mb-2 inline-flex overflow-hidden rounded-md border bg-background text-[11px]">
              <button
                type="button"
                onClick={() => setTab("curl")}
                className={`px-2.5 py-1 transition-colors ${
                  tab === "curl"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                cURL
              </button>
              <button
                type="button"
                onClick={() => setTab("ts")}
                className={`px-2.5 py-1 transition-colors ${
                  tab === "ts"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                TypeScript SDK
              </button>
            </div>
          ) : null}
          {tab === "curl" || !sdkExample ? (
            <CodeBlock
              code={curlExample}
              language="bash"
              className="rounded-md border bg-[#0d1117] p-3 text-[12px]"
            />
          ) : (
            <CodeBlock
              code={sdkExample ?? ""}
              language="ts"
              className="rounded-md border bg-[#0d1117] p-3 text-[12px]"
            />
          )}
        </div>
      ) : null}
    </div>
  )
}

// ─── Users tab ────────────────────────────────────────────────────────────

function UsersTab({
  apiBase,
  onReload,
}: {
  apiBase: string
  onReload: () => void
}) {
  const t = useTranslations("authProjects.detail.users")
  const [users, setUsers] = useState<AuthProjectUser[]>([])
  const [pagination, setPagination] = useState({ total: 0, limit: 50, skip: 0 })
  const [filter, setFilter] = useState<"all" | "verified" | "unverified">("all")
  const [loading, setLoading] = useState(true)
  const [importOpen, setImportOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: String(pagination.limit),
        skip: String(pagination.skip),
      })
      if (filter === "verified") params.set("emailVerified", "true")
      if (filter === "unverified") params.set("emailVerified", "false")
      const res = await fetch(`${apiBase}/users?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("loadFailed"))
      setUsers(json.data.items ?? [])
      setPagination(json.data.pagination)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [apiBase, filter, pagination.limit, pagination.skip, t])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  async function deleteUser(u: AuthProjectUser) {
    const ok = await confirm({
      title: t("deleteConfirmTitle"),
      description: t("deleteConfirmDescription", { email: u.email }),
      confirmText: t("deleteConfirmAction"),
      destructive: true,
    })
    if (!ok) return
    const res = await fetch(`${apiBase}/users/${u.id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success(t("deleteSuccess"))
      fetchUsers()
      onReload()
    } else {
      toast.error(t("deleteFailed"))
    }
  }

  async function revokeSessions(u: AuthProjectUser) {
    const ok = await confirm({
      title: t("revokeConfirmTitle"),
      description: t("revokeConfirmDescription", { email: u.email }),
      confirmText: t("revokeConfirmAction"),
      destructive: true,
    })
    if (!ok) return
    const res = await fetch(`${apiBase}/users/${u.id}/revoke-sessions`, {
      method: "POST",
    })
    const json = await res.json()
    if (res.ok) {
      toast.success(t("revokeSuccess", { count: json.data.revoked }))
    } else {
      toast.error(t("revokeFailed"))
    }
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex items-center gap-2 border-b pb-3">
        <div className="flex rounded-md border p-0.5">
          {(["all", "verified", "unverified"] as const).map((f) => (
            <button
              key={f}
              onClick={() => {
                setFilter(f)
                setPagination((p) => ({ ...p, skip: 0 }))
              }}
              className={`rounded-sm px-2.5 py-1 text-xs transition ${
                filter === f
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {f === "all"
                ? t("filterAll")
                : f === "verified"
                  ? t("filterVerified")
                  : t("filterUnverified")}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="default"
            className="h-7 text-[11px]"
            onClick={() => setInviteOpen(true)}
          >
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} data-icon="inline-start" />
            {t("inviteButton")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            onClick={() => setImportOpen(true)}
          >
            {t("importButton")}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t("total", { count: pagination.total.toLocaleString() })}
          </span>
        </div>
      </div>

      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <div className="pe-3">
          {loading ? (
            <div className="space-y-2 py-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t("empty")}
            </p>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">{t("headerEmail")}</th>
                    <th className="px-3 py-2 text-left">{t("headerStatus")}</th>
                    <th className="px-3 py-2 text-left">{t("headerLastLogin")}</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b last:border-b-0 hover:bg-muted/30"
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium">{u.email}</div>
                        {u.displayName ? (
                          <div className="text-[11px] text-muted-foreground">
                            {u.displayName}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {u.emailVerified ? (
                            <Badge variant="default" className="text-[10px]">
                              {t("verified")}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              {t("unverified")}
                            </Badge>
                          )}
                          {u.lockedUntil &&
                          new Date(u.lockedUntil) > new Date() ? (
                            <Badge
                              variant="destructive"
                              className="text-[10px]"
                            >
                              {t("locked")}
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {u.lastLoginAt
                          ? new Date(u.lastLoginAt).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => revokeSessions(u)}
                            aria-label={t("revokeSessionsAria")}
                            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                          >
                            <HugeiconsIcon
                              icon={UserBlock01Icon}
                              strokeWidth={2}
                              className="size-4"
                            />
                          </button>
                          <button
                            onClick={() => deleteUser(u)}
                            aria-label={t("deleteAria")}
                            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                          >
                            <HugeiconsIcon
                              icon={Delete02Icon}
                              strokeWidth={2}
                              className="size-4"
                            />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ScrollArea>

      {pagination.total > pagination.limit ? (
        <div className="flex items-center justify-between border-t pt-3">
          <div className="text-[11px] text-muted-foreground">
            {t("pagination", {
              from: pagination.skip + 1,
              to: Math.min(
                pagination.skip + pagination.limit,
                pagination.total,
              ),
              total: pagination.total.toLocaleString(),
            })}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pagination.skip === 0}
              onClick={() =>
                setPagination((p) => ({
                  ...p,
                  skip: Math.max(0, p.skip - p.limit),
                }))
              }
            >
              {t("previous")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pagination.skip + pagination.limit >= pagination.total}
              onClick={() =>
                setPagination((p) => ({ ...p, skip: p.skip + p.limit }))
              }
            >
              {t("next")}
            </Button>
          </div>
        </div>
      ) : null}

      <UsersImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        apiBase={apiBase}
        onImported={() => {
          fetchUsers()
          onReload()
        }}
      />
      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        apiBase={apiBase}
        onInvited={onReload}
      />
    </div>
  )
}

function InviteUserDialog({
  open,
  onOpenChange,
  apiBase,
  onInvited,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  apiBase: string
  onInvited: () => void
}) {
  const t = useTranslations("authProjects.detail.invite")
  const [email, setEmail] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setEmail("")
      setDisplayName("")
    }
  }, [open])

  async function submit() {
    if (!email.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`${apiBase}/users/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          displayName: displayName.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || t("failureToast"))
        return
      }
      toast.success(t("successToast", { email: email.trim() }))
      onOpenChange(false)
      onInvited()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <label className="text-xs font-medium">{t("emailLabel")}</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              required
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-medium">{t("displayNameLabel")}</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("displayNamePlaceholder")}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">{t("hint")}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={submit} disabled={submitting || !email.trim()}>
            {submitting ? t("sending") : t("send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UsersImportDialog({
  open,
  onOpenChange,
  apiBase,
  onImported,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  apiBase: string
  onImported: () => void
}) {
  const t = useTranslations("authProjects.detail.users")
  const [csv, setCsv] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<
    | { imported: number; skipped: number; invalid: number; totalRows: number; errors: Array<{ row: number; reason: string }> }
    | null
  >(null)

  useEffect(() => {
    if (!open) {
      setCsv("")
      setResult(null)
    }
  }, [open])

  async function submit() {
    if (!csv.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`${apiBase}/users/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || t("importFailureToast"))
        return
      }
      setResult(json.data)
      toast.success(t("importSuccessToast", { count: json.data?.imported ?? 0 }))
      onImported()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("importDialogTitle")}</DialogTitle>
          <DialogDescription>{t("importDialogDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <pre className="rounded-md border bg-muted/30 p-2 text-[10px] text-muted-foreground whitespace-pre-wrap">
{`email,password,displayName
alice@example.com,,Alice
bob@example.com,SecurePass!9,Bob`}
          </pre>
          <Textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={10}
            placeholder={t("importTextareaPlaceholder")}
            className="font-mono text-xs"
          />
          {result ? (
            <div className="grid gap-1 rounded-md border bg-muted/20 p-3 text-xs">
              <div className="font-medium">
                {t("importResultHeader", {
                  imported: result.imported,
                  skipped: result.skipped,
                  invalid: result.invalid,
                  total: result.totalRows,
                })}
              </div>
              {result.errors.length > 0 ? (
                <ul className="mt-2 list-disc space-y-0.5 ps-5 text-[11px] text-muted-foreground">
                  {result.errors.slice(0, 10).map((e) => (
                    <li key={e.row}>
                      {t("importErrorRow", { row: e.row })}: {e.reason}
                    </li>
                  ))}
                  {result.errors.length > 10 ? <li>… +{result.errors.length - 10}</li> : null}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
          <Button type="button" onClick={submit} disabled={submitting || !csv.trim()}>
            {submitting ? t("importing") : t("importSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Settings tab ─────────────────────────────────────────────────────────

function SettingsTab({
  apiBase,
  project,
  onSaved,
}: {
  apiBase: string
  project: AuthProjectDetail
  onSaved: () => void
}) {
  const t = useTranslations("authProjects.detail.settings")
  const [name, setName] = useState(project.name)
  const [displayName, setDisplayName] = useState(project.branding.displayName)
  const [primaryColor, setPrimaryColor] = useState(
    project.branding.primaryColor || "#111111",
  )
  const [logoUrl, setLogoUrl] = useState(project.branding.logoUrl || "")
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(
    project.emailVerificationRequired,
  )
  const [minLength, setMinLength] = useState(project.passwordPolicy.minLength)
  const [requireUppercase, setRequireUppercase] = useState(
    project.passwordPolicy.requireUppercase,
  )
  const [requireNumber, setRequireNumber] = useState(
    project.passwordPolicy.requireNumber,
  )
  const [allowedOriginsText, setAllowedOriginsText] = useState(
    project.allowedOrigins.join("\n"),
  )
  const [enabled, setEnabled] = useState(project.enabled)
  const [saving, setSaving] = useState(false)

  // Custom claims state
  const [fromMetadataText, setFromMetadataText] = useState(
    (project.customClaims?.fromMetadata ?? []).join(", "),
  )
  const [staticClaimsText, setStaticClaimsText] = useState(
    JSON.stringify(project.customClaims?.staticClaims ?? {}, null, 2),
  )
  const [claimsError, setClaimsError] = useState<string | null>(null)

  // Social providers state — 6 provider
  const [googleEnabled, setGoogleEnabled] = useState(
    project.socialProviders?.google?.enabled ?? false,
  )
  const [googleClientId, setGoogleClientId] = useState(
    project.socialProviders?.google?.clientId ?? "",
  )
  const [googleClientSecret, setGoogleClientSecret] = useState("")
  const [githubEnabled, setGithubEnabled] = useState(
    project.socialProviders?.github?.enabled ?? false,
  )
  const [githubClientId, setGithubClientId] = useState(
    project.socialProviders?.github?.clientId ?? "",
  )
  const [githubClientSecret, setGithubClientSecret] = useState("")
  const [facebookEnabled, setFacebookEnabled] = useState(
    project.socialProviders?.facebook?.enabled ?? false,
  )
  const [facebookClientId, setFacebookClientId] = useState(
    project.socialProviders?.facebook?.clientId ?? "",
  )
  const [facebookClientSecret, setFacebookClientSecret] = useState("")
  const [microsoftEnabled, setMicrosoftEnabled] = useState(
    project.socialProviders?.microsoft?.enabled ?? false,
  )
  const [microsoftClientId, setMicrosoftClientId] = useState(
    project.socialProviders?.microsoft?.clientId ?? "",
  )
  const [microsoftClientSecret, setMicrosoftClientSecret] = useState("")
  const [microsoftTenant, setMicrosoftTenant] = useState(
    project.socialProviders?.microsoft?.tenant ?? "",
  )
  const [twitterEnabled, setTwitterEnabled] = useState(
    project.socialProviders?.twitter?.enabled ?? false,
  )
  const [twitterClientId, setTwitterClientId] = useState(
    project.socialProviders?.twitter?.clientId ?? "",
  )
  const [twitterClientSecret, setTwitterClientSecret] = useState("")
  const [appleEnabled, setAppleEnabled] = useState(
    project.socialProviders?.apple?.enabled ?? false,
  )
  const [appleClientId, setAppleClientId] = useState(
    project.socialProviders?.apple?.clientId ?? "",
  )
  const [appleTeamId, setAppleTeamId] = useState(
    project.socialProviders?.apple?.teamId ?? "",
  )
  const [appleKeyId, setAppleKeyId] = useState(
    project.socialProviders?.apple?.keyId ?? "",
  )
  const [applePrivateKey, setApplePrivateKey] = useState("")

  async function save() {
    setClaimsError(null)
    let staticClaims: Record<string, string | number | boolean> = {}
    try {
      const parsed = JSON.parse(staticClaimsText || "{}") as unknown
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
            staticClaims[k] = v
          }
        }
      } else {
        throw new Error("Object literal required.")
      }
    } catch (e) {
      setClaimsError(e instanceof Error ? e.message : "Invalid JSON")
      return
    }
    const fromMetadata = fromMetadataText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)

    setSaving(true)
    try {
      const allowedOrigins = allowedOriginsText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          branding: {
            displayName: displayName.trim(),
            primaryColor: primaryColor || null,
            logoUrl: logoUrl.trim() || null,
          },
          emailVerificationRequired,
          passwordPolicy: {
            minLength,
            requireUppercase,
            requireNumber,
          },
          allowedOrigins,
          enabled,
          customClaims: { fromMetadata, staticClaims },
          socialProviders: {
            google: {
              enabled: googleEnabled,
              clientId: googleClientId.trim(),
              ...(googleClientSecret.trim()
                ? { clientSecret: googleClientSecret.trim() }
                : {}),
            },
            github: {
              enabled: githubEnabled,
              clientId: githubClientId.trim(),
              ...(githubClientSecret.trim()
                ? { clientSecret: githubClientSecret.trim() }
                : {}),
            },
            facebook: {
              enabled: facebookEnabled,
              clientId: facebookClientId.trim(),
              ...(facebookClientSecret.trim()
                ? { clientSecret: facebookClientSecret.trim() }
                : {}),
            },
            microsoft: {
              enabled: microsoftEnabled,
              clientId: microsoftClientId.trim(),
              ...(microsoftClientSecret.trim()
                ? { clientSecret: microsoftClientSecret.trim() }
                : {}),
              ...(microsoftTenant.trim()
                ? { tenant: microsoftTenant.trim() }
                : {}),
            },
            twitter: {
              enabled: twitterEnabled,
              clientId: twitterClientId.trim(),
              ...(twitterClientSecret.trim()
                ? { clientSecret: twitterClientSecret.trim() }
                : {}),
            },
            apple: {
              enabled: appleEnabled,
              clientId: appleClientId.trim(),
              teamId: appleTeamId.trim(),
              keyId: appleKeyId.trim(),
              ...(applePrivateKey.trim()
                ? { privateKey: applePrivateKey }
                : {}),
            },
          },
        }),
      })
      if (res.ok) {
        toast.success(t("saveSuccess"))
        setGoogleClientSecret("")
        setGithubClientSecret("")
        setFacebookClientSecret("")
        setMicrosoftClientSecret("")
        setTwitterClientSecret("")
        setApplePrivateKey("")
        onSaved()
      } else {
        const json = await res.json()
        toast.error(json.error || t("saveFailed"))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-6 py-2">
      <Section title={t("general")}>
        <div className="grid gap-3">
          <Field label={t("nameLabel")}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field
            label={t("enabledTitle")}
            hint={t("enabledHint")}
          >
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </Field>
        </div>
      </Section>

      <Section title={t("branding")}>
        <div className="grid gap-3">
          <Field label={t("displayNameLabel")}>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </Field>
          <Field label={t("primaryColorLabel")}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                aria-label={t("primaryColorLabel")}
                className="h-9 w-12 cursor-pointer rounded-md border bg-background"
              />
              <Input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </Field>
          <Field label={t("logoUrlLabel")}>
            <Input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder={t("logoUrlPlaceholder")}
            />
          </Field>
        </div>
      </Section>

      <Section title={t("verification")}>
        <Field
          label={t("verifyTitle")}
          hint={t("verifyHint")}
        >
          <Switch
            checked={emailVerificationRequired}
            onCheckedChange={setEmailVerificationRequired}
          />
        </Field>
      </Section>

      <Section title={t("passwordPolicy")}>
        <div className="grid gap-3">
          <Field label={t("minLengthLabel")}>
            <Input
              type="number"
              min={6}
              max={128}
              value={minLength}
              onChange={(e) => setMinLength(Number(e.target.value) || 8)}
              className="w-24"
            />
          </Field>
          <Field label={t("uppercaseLabel")}>
            <Switch
              checked={requireUppercase}
              onCheckedChange={setRequireUppercase}
            />
          </Field>
          <Field label={t("numberLabel")}>
            <Switch
              checked={requireNumber}
              onCheckedChange={setRequireNumber}
            />
          </Field>
        </div>
      </Section>

      <Section title={t("originsLabel")}>
        <Textarea
          value={allowedOriginsText}
          onChange={(e) => setAllowedOriginsText(e.target.value)}
          rows={4}
          placeholder={t("originsPlaceholder")}
        />
        <p className="text-[11px] text-muted-foreground">
          {t("originsHint")}
        </p>
      </Section>

      <Section title={t("socialTitle")}>
        <p className="text-[11px] text-muted-foreground">{t("socialHint")}</p>
        <SocialProvidersGrid
          project={project}
          state={{
            google: {
              enabled: googleEnabled,
              setEnabled: setGoogleEnabled,
              clientId: googleClientId,
              setClientId: setGoogleClientId,
              clientSecret: googleClientSecret,
              setClientSecret: setGoogleClientSecret,
            },
            github: {
              enabled: githubEnabled,
              setEnabled: setGithubEnabled,
              clientId: githubClientId,
              setClientId: setGithubClientId,
              clientSecret: githubClientSecret,
              setClientSecret: setGithubClientSecret,
            },
            facebook: {
              enabled: facebookEnabled,
              setEnabled: setFacebookEnabled,
              clientId: facebookClientId,
              setClientId: setFacebookClientId,
              clientSecret: facebookClientSecret,
              setClientSecret: setFacebookClientSecret,
            },
            microsoft: {
              enabled: microsoftEnabled,
              setEnabled: setMicrosoftEnabled,
              clientId: microsoftClientId,
              setClientId: setMicrosoftClientId,
              clientSecret: microsoftClientSecret,
              setClientSecret: setMicrosoftClientSecret,
              tenant: microsoftTenant,
              setTenant: setMicrosoftTenant,
            },
            twitter: {
              enabled: twitterEnabled,
              setEnabled: setTwitterEnabled,
              clientId: twitterClientId,
              setClientId: setTwitterClientId,
              clientSecret: twitterClientSecret,
              setClientSecret: setTwitterClientSecret,
            },
            apple: {
              enabled: appleEnabled,
              setEnabled: setAppleEnabled,
              clientId: appleClientId,
              setClientId: setAppleClientId,
              teamId: appleTeamId,
              setTeamId: setAppleTeamId,
              keyId: appleKeyId,
              setKeyId: setAppleKeyId,
              privateKey: applePrivateKey,
              setPrivateKey: setApplePrivateKey,
            },
          }}
        />
      </Section>

      <Section title={t("claimsTitle")}>
        <p className="text-[11px] text-muted-foreground">{t("claimsHint")}</p>
        <Field label={t("fromMetadataLabel")}>
          <Input
            value={fromMetadataText}
            onChange={(e) => setFromMetadataText(e.target.value)}
            placeholder="role, planTier, organizationId"
            className="font-mono text-xs"
          />
        </Field>
        <p className="text-[11px] text-muted-foreground">
          {t("fromMetadataHint")}
        </p>
        <div className="grid gap-1.5">
          <label className="text-xs font-medium">{t("staticClaimsLabel")}</label>
          <Textarea
            value={staticClaimsText}
            onChange={(e) => setStaticClaimsText(e.target.value)}
            rows={6}
            className="font-mono text-xs"
            placeholder='{\n  "tenant": "acme",\n  "plan": "pro"\n}'
          />
          <p className="text-[11px] text-muted-foreground">{t("staticClaimsHint")}</p>
          {claimsError ? (
            <p className="text-[11px] text-destructive">{claimsError}</p>
          ) : null}
        </div>
      </Section>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button onClick={save} disabled={saving}>
          {saving ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-3">
        <label className="text-xs font-medium">{label}</label>
        {children}
      </div>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

// ─── API keys tab ─────────────────────────────────────────────────────────

function ApiKeysTab({
  apiBase,
  project,
}: {
  apiBase: string
  project: AuthProjectDetail
}) {
  const t = useTranslations("authProjects.detail.apiKey")
  const [rotatedKey, setRotatedKey] = useState<string | null>(null)
  const [rotating, setRotating] = useState(false)

  async function rotate() {
    const ok = await confirm({
      title: t("rotateConfirmTitle"),
      description: t("rotateConfirmDescription"),
      confirmText: t("rotateConfirmAction"),
      destructive: true,
    })
    if (!ok) return
    setRotating(true)
    try {
      const res = await fetch(`${apiBase}?action=rotate-api-key`, {
        method: "PATCH",
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || t("rotateFailed"))
        return
      }
      setRotatedKey(json.data.apiKey)
    } finally {
      setRotating(false)
    }
  }

  return (
    <div className="grid gap-4 py-2">
      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">{t("current")}</h3>
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("prefixLabel")}</span>
            <code className="text-[11px]">{project.apiKeyPrefix}…</code>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t("prefixHint")}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <h3 className="text-sm font-semibold text-destructive">{t("rotateTitle")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("rotateHint")}
        </p>
        <Button
          variant="destructive"
          size="sm"
          className="mt-3"
          onClick={rotate}
          disabled={rotating}
        >
          <HugeiconsIcon
            icon={RefreshIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {rotating ? t("rotating") : t("rotateAction")}
        </Button>
      </div>

      {rotatedKey ? (
        <Dialog
          open={!!rotatedKey}
          onOpenChange={(o) => !o && setRotatedKey(null)}
        >
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{t("newDialogTitle")}</DialogTitle>
              <DialogDescription>
                {t("newDialogDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border bg-muted/40 p-3">
              <code className="block break-all text-xs">{rotatedKey}</code>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(rotatedKey)
                toast.success(t("copied"))
              }}
            >
              {t("copyToClipboard")}
            </Button>
            <DialogFooter>
              <Button onClick={() => setRotatedKey(null)}>
                {t("acknowledged")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}

// ─── Activity tab (audit + analytics) ─────────────────────────────────────

interface AnalyticsData {
  totalUsers: number
  quotaUsage: { mau: number; signupsThisHour: number }
  series: {
    signups: Array<{ date: string; count: number }>
    logins: Array<{ date: string; count: number }>
    lockouts: Array<{ date: string; count: number }>
  }
}

interface AuditItem {
  id: string
  userId?: string
  action: string
  resource: string
  resourceId?: string
  ipAddress?: string | null
  createdAt: string
  details?: Record<string, unknown> | null
}

function ActivityTab({ apiBase }: { apiBase: string }) {
  const t = useTranslations("authProjects.detail.activity")
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [audit, setAudit] = useState<AuditItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`${apiBase}/analytics`).then((r) => r.json()),
      fetch(`${apiBase}/audit?limit=100`).then((r) => r.json()),
    ])
      .then(([a, b]) => {
        setAnalytics(a.data as AnalyticsData)
        setAudit(b.data as AuditItem[])
      })
      .catch(() => {
        setAnalytics(null)
        setAudit([])
      })
      .finally(() => setLoading(false))
  }, [apiBase])

  if (loading) {
    return (
      <div className="space-y-3 py-2">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="grid gap-4 py-2">
      {analytics ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("totalUsers")}
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {analytics.totalUsers.toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("mau")}
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {analytics.quotaUsage.mau.toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("signupsThisHour")}
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {analytics.quotaUsage.signupsThisHour.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-4">
              <h3 className="pb-2 text-sm font-semibold">{t("signupTrend")}</h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={analytics.series.signups}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                    tickFormatter={(v: string) => v.slice(5)}
                    interval={3}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    width={24}
                  />
                  <RTooltip
                    contentStyle={{
                      background: "var(--background)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontSize: 11,
                    }}
                  />
                  <Line type="monotone" dataKey="count" stroke="#22c55e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border bg-card p-4">
              <h3 className="pb-2 text-sm font-semibold">{t("loginTrend")}</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={analytics.series.logins}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                    tickFormatter={(v: string) => v.slice(5)}
                    interval={3}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    width={24}
                  />
                  <RTooltip
                    contentStyle={{
                      background: "var(--background)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontSize: 11,
                    }}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : null}

      <div className="rounded-xl border bg-card p-4">
        <h3 className="pb-2 text-sm font-semibold">{t("auditTitle")}</h3>
        {audit.length === 0 ? (
          <p className="rounded-md border border-dashed py-6 text-center text-[11px] text-muted-foreground">
            {t("auditEmpty")}
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-xs">
              <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">{t("action")}</th>
                  <th className="px-3 py-2 text-left">IP</th>
                  <th className="px-3 py-2 text-left">{t("at")}</th>
                </tr>
              </thead>
              <tbody>
                {audit.slice(0, 50).map((a) => (
                  <tr key={a.id} className="border-b last:border-b-0">
                    <td className="px-3 py-1.5 font-mono text-[10px]">
                      {a.action.replace(/^auth-project\./, "")}
                    </td>
                    <td className="px-3 py-1.5 text-[10px] text-muted-foreground">
                      {a.ipAddress ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-[10px] text-muted-foreground">
                      {new Date(a.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Webhooks tab ─────────────────────────────────────────────────────────

const WEBHOOK_TOPICS = [
  "user.signup",
  "user.login",
  "user.password-changed",
  "user.email-changed",
  "user.account-locked",
  "user.account-deleted",
] as const
type WebhookTopic = (typeof WEBHOOK_TOPICS)[number]

interface WebhookItem {
  id: string
  url: string
  secretPrefix: string
  topicFilter: WebhookTopic[]
  enabled: boolean
  description: string | null
  createdAt: string
}

function WebhooksTab({ apiBase }: { apiBase: string }) {
  const t = useTranslations("authProjects.detail.webhooks")
  const [items, setItems] = useState<WebhookItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [createdSecret, setCreatedSecret] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${apiBase}/webhooks`)
      const json = await res.json()
      setItems(json.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function deleteOne(w: WebhookItem) {
    const ok = await confirm({
      title: t("deleteConfirmTitle", { url: w.url }),
      description: t("deleteConfirmDescription"),
      confirmText: t("deleteConfirmAction"),
      destructive: true,
    })
    if (!ok) return
    const res = await fetch(`${apiBase}/webhooks/${w.id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success(t("deleteSuccessToast"))
      fetchAll()
    } else {
      toast.error(t("deleteFailureToast"))
    }
  }

  async function toggleEnabled(w: WebhookItem) {
    const res = await fetch(`${apiBase}/webhooks/${w.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !w.enabled }),
    })
    if (res.ok) {
      toast.success(t("updateSuccessToast"))
      fetchAll()
    } else {
      toast.error(t("updateFailureToast"))
    }
  }

  async function rotateSecret(w: WebhookItem) {
    const ok = await confirm({
      title: t("rotateSecretConfirmTitle"),
      description: t("rotateSecretConfirmDescription"),
      confirmText: t("rotateSecretConfirmAction"),
      destructive: true,
    })
    if (!ok) return
    const res = await fetch(`${apiBase}/webhooks/${w.id}?action=rotate-secret`, {
      method: "PATCH",
    })
    const json = await res.json()
    if (res.ok) {
      setCreatedSecret(json.data?.secret ?? null)
      toast.success(t("rotateSecretSuccess"))
      fetchAll()
    } else {
      toast.error(json.error || t("rotateSecretFailure"))
    }
  }

  return (
    <div className="grid gap-3 py-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{t("description")}</p>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} data-icon="inline-start" />
          {t("newButton")}
        </Button>
      </div>
      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <h3 className="text-sm font-semibold">{t("emptyTitle")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("emptyBody")}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          {items.map((w, i) => (
            <div
              key={w.id}
              className={`flex items-start gap-3 px-4 py-3 ${i > 0 ? "border-t" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <code className="truncate text-xs font-mono">{w.url}</code>
                  {!w.enabled ? (
                    <Badge variant="outline" className="text-[10px]">{t("disabled")}</Badge>
                  ) : null}
                  {w.topicFilter.length === 0 ? (
                    <Badge variant="outline" className="text-[10px]">{t("allEvents")}</Badge>
                  ) : (
                    w.topicFilter.map((tp) => (
                      <Badge key={tp} variant="outline" className="text-[10px]">{tp}</Badge>
                    ))
                  )}
                </div>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  secret: <code>{w.secretPrefix}…</code> · {new Date(w.createdAt).toLocaleString()}
                </p>
                {w.description ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{w.description}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-1">
                <Switch
                  checked={w.enabled}
                  onCheckedChange={() => toggleEnabled(w)}
                  aria-label={t("toggleAria")}
                />
                <button
                  type="button"
                  onClick={() => rotateSecret(w)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title={t("rotateSecretAria")}
                >
                  <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteOne(w)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                  title={t("deleteAria")}
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <WebhookCreateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        apiBase={apiBase}
        onCreated={(secret) => {
          setCreatedSecret(secret)
          fetchAll()
        }}
      />

      {createdSecret ? (
        <Dialog open={!!createdSecret} onOpenChange={(o) => !o && setCreatedSecret(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("secretShownTitle")}</DialogTitle>
              <DialogDescription>{t("secretShownDescription")}</DialogDescription>
            </DialogHeader>
            <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-md border bg-muted/40 p-3 text-[11px]">
              <code>{createdSecret}</code>
            </pre>
            <DialogFooter>
              <Button onClick={() => setCreatedSecret(null)}>{t("secretClose")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}

function WebhookCreateDialog({
  open,
  onOpenChange,
  apiBase,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  apiBase: string
  onCreated: (secret: string) => void
}) {
  const t = useTranslations("authProjects.detail.webhooks")
  const [url, setUrl] = useState("")
  const [description, setDescription] = useState("")
  const [topics, setTopics] = useState<Set<WebhookTopic>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setUrl("")
      setDescription("")
      setTopics(new Set())
    }
  }, [open])

  function toggleTopic(t: WebhookTopic) {
    setTopics((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  async function submit() {
    if (!url.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`${apiBase}/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          topicFilter: Array.from(topics),
          description: description.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || t("createFailureToast"))
        return
      }
      onOpenChange(false)
      if (json.data?.secret) onCreated(json.data.secret)
      toast.success(t("createSuccessToast"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createDialogTitle")}</DialogTitle>
          <DialogDescription>{t("createDialogDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <label className="text-xs font-medium">URL</label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.example.com/sentroy-webhook"
              type="url"
              required
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-medium">{t("descriptionLabel")}</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-medium">{t("topicsLabel")}</label>
            <p className="text-[11px] text-muted-foreground">{t("topicsHint")}</p>
            <div className="grid gap-1">
              {WEBHOOK_TOPICS.map((tp) => (
                <label key={tp} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={topics.has(tp)}
                    onChange={() => toggleTopic(tp)}
                  />
                  <code>{tp}</code>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={submit} disabled={submitting || !url.trim()}>
            {submitting ? t("creating") : t("createSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Email templates tab ──────────────────────────────────────────────────

interface MailTemplateItem {
  key: string
  category: string
  label: string
  description: string
  variables: Array<{ name: string; description: string; sample: string }>
  defaultSubject: { tr?: string; en?: string }
  defaultHtmlBody: { tr?: string; en?: string }
  override:
    | { subject: { tr?: string; en?: string }; htmlBody: { tr?: string; en?: string }; enabled: boolean }
    | null
}

function EmailTemplatesTab({ apiBase }: { apiBase: string }) {
  const t = useTranslations("authProjects.detail.emails")
  const locale = useLocale()
  const [items, setItems] = useState<MailTemplateItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<MailTemplateItem | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${apiBase}/mail-templates`)
      const json = await res.json()
      setItems(json.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  return (
    <div className="grid gap-3 py-2">
      <p className="text-xs text-muted-foreground">{t("description")}</p>
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          {items.map((it, i) => (
            <div
              key={it.key}
              className={`flex items-start gap-3 px-4 py-3 ${i > 0 ? "border-t" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium">{it.label}</span>
                  <Badge variant="outline" className="text-[10px]">{it.category}</Badge>
                  {it.override ? (
                    <Badge variant="default" className="text-[10px]">{t("customized")}</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">{t("default")}</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {it.description}
                </p>
                <code className="mt-0.5 block text-[10px] text-muted-foreground">
                  {it.key}
                </code>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={() => setEditing(it)}
              >
                <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} data-icon="inline-start" />
                {t("editButton")}
              </Button>
            </div>
          ))}
        </div>
      )}
      <EmailTemplateEditDialog
        template={editing}
        apiBase={apiBase}
        locale={locale}
        onClose={() => setEditing(null)}
        onSaved={() => {
          fetchAll()
          setEditing(null)
        }}
      />
    </div>
  )
}

function EmailTemplateEditDialog({
  template,
  apiBase,
  locale,
  onClose,
  onSaved,
}: {
  template: MailTemplateItem | null
  apiBase: string
  locale: string
  onClose: () => void
  onSaved: () => void
}) {
  const t = useTranslations("authProjects.detail.emails")
  // LocalizedField multi-field: tek widget içinde subject + htmlBody'i her
  // dil için tab'la yönetir (mail uygulamasındaki templates pattern'iyle
  // aynı UX).
  const [fields, setFields] = useState<{
    subject: LocalizedValue
    htmlBody: LocalizedValue
  }>({ subject: { tr: "", en: "" }, htmlBody: { tr: "", en: "" } })
  const [enabled, setEnabled] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [activeLang, setActiveLang] = useState(locale)
  const [presetOpen, setPresetOpen] = useState(false)

  useEffect(() => {
    if (!template) return
    const src = template.override ?? {
      subject: template.defaultSubject,
      htmlBody: template.defaultHtmlBody,
      enabled: true,
    }
    setFields({
      subject: { tr: src.subject.tr ?? "", en: src.subject.en ?? "" },
      htmlBody: { tr: src.htmlBody.tr ?? "", en: src.htmlBody.en ?? "" },
    })
    setEnabled(src.enabled)
    setPresetOpen(false)
  }, [template])

  // Önizleme — sadece display tarafı: html body'sini iframe'de render et,
  // variable placeholder'ları sample değerlerle replace et. Hook
  // sırasının open/closed render arasında değişmemesi için early
  // return'ÜN ÖNCESİNDE çağrılır (React rules-of-hooks #310).
  const previewHtml = useMemo(() => {
    if (!template) return ""
    let body = fields.htmlBody[activeLang] || ""
    for (const v of template.variables) {
      const re = new RegExp(`\\{\\{?${v.name}\\}?\\}`, "g")
      body = body.replace(re, escapeHtml(v.sample))
    }
    return body
  }, [fields.htmlBody, activeLang, template])

  if (!template) return null

  async function save() {
    if (!template) return
    setSubmitting(true)
    try {
      const res = await fetch(
        `${apiBase}/mail-templates/${encodeURIComponent(template.key)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: {
              tr: fields.subject.tr || undefined,
              en: fields.subject.en || undefined,
            },
            htmlBody: {
              tr: fields.htmlBody.tr || undefined,
              en: fields.htmlBody.en || undefined,
            },
            enabled,
          }),
        },
      )
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || t("saveFailureToast"))
        return
      }
      toast.success(t("saveSuccessToast"))
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  async function reset() {
    if (!template) return
    const ok = await confirm({
      title: t("resetConfirmTitle"),
      description: t("resetConfirmDescription"),
      confirmText: t("resetConfirmAction"),
      destructive: true,
    })
    if (!ok) return
    setSubmitting(true)
    try {
      const res = await fetch(
        `${apiBase}/mail-templates/${encodeURIComponent(template.key)}`,
        { method: "DELETE" },
      )
      if (res.ok) {
        toast.success(t("resetSuccessToast"))
        onSaved()
      } else {
        const json = await res.json()
        toast.error(json.error || t("resetFailureToast"))
      }
    } finally {
      setSubmitting(false)
    }
  }

  function applyPreset(presetId: string) {
    const p = findPreset(presetId)
    if (!p) return
    setFields({
      subject: { tr: p.subjectHint.tr, en: p.subjectHint.en },
      htmlBody: { tr: p.htmlBody.tr, en: p.htmlBody.en },
    })
    setPresetOpen(false)
    toast.success(t("presetAppliedToast", { name: p.label }))
  }


  return (
    <Dialog open={!!template} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="pr-8">{template.label}</DialogTitle>
          <DialogDescription>{template.description}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh]">
          <div className="grid gap-3 pe-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2">
              <div className="flex items-center gap-3">
                <Switch checked={enabled} onCheckedChange={setEnabled} />
                <span className="text-xs">{t("enabledLabel")}</span>
              </div>
              <div className="relative">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={() => setPresetOpen((v) => !v)}
                >
                  {t("presetPickerLabel")}
                </Button>
                {presetOpen ? (
                  <div className="absolute right-0 top-9 z-20 w-72 rounded-md border bg-popover p-1 shadow-lg">
                    {AUTH_MAIL_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyPreset(p.id)}
                        className="block w-full rounded-md p-2 text-left transition hover:bg-muted"
                      >
                        <div className="text-xs font-semibold">{p.label}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {p.description}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <LocalizedField
              label=""
              value={fields}
              onChange={setFields}
              defaultLocale={locale}
              onActiveChange={setActiveLang}
              fields={[
                {
                  name: "subject",
                  label: t("subjectLabel"),
                  placeholder:
                    template.defaultSubject[activeLang as "tr" | "en"] ?? "",
                },
                {
                  name: "htmlBody",
                  label: t("htmlBodyLabel"),
                  multiline: true,
                  rows: 12,
                  placeholder:
                    template.defaultHtmlBody[activeLang as "tr" | "en"] ?? "",
                },
              ]}
            />
            <div className="grid gap-1.5">
              <label className="text-xs font-medium">
                {t("previewLabel")} ({activeLang.toUpperCase()})
              </label>
              <iframe
                title="preview"
                srcDoc={previewHtml}
                className="h-72 w-full rounded-md border bg-white"
                sandbox=""
              />
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <h4 className="text-xs font-semibold">{t("variablesTitle")}</h4>
              <p className="mt-1 text-[10px] text-muted-foreground">{t("variablesHint")}</p>
              <ul className="mt-2 grid gap-1 text-[11px] sm:grid-cols-2">
                {template.variables.map((v) => (
                  <li key={v.name} className="flex items-start gap-2">
                    <code className="shrink-0 text-[10px] text-foreground">
                      {`{${v.name}}`}
                    </code>
                    <span className="text-muted-foreground">{v.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </ScrollArea>
        <DialogFooter className="gap-2">
          {template.override ? (
            <Button type="button" variant="ghost" onClick={reset} disabled={submitting}>
              {t("resetButton")}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={save} disabled={submitting}>
            {submitting ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPE_MAP[c] ?? c)
}

// ─── Social providers grid ────────────────────────────────────────────────

type SocialProviderId =
  | "google"
  | "github"
  | "apple"
  | "facebook"
  | "microsoft"
  | "twitter"

interface SocialProviderDef {
  id: SocialProviderId
  label: string
  /** Brand-recognizable monogram color (gri görünümde dot, expand'de accent). */
  brandColor: string
  /** Inline SVG path (24x24 viewBox). currentColor ile renklendirme. */
  svg: React.ReactNode
  /** Şu an backend destekliyor mu (false = coming soon, disabled). */
  active: boolean
}

const SOCIAL_PROVIDERS: SocialProviderDef[] = [
  {
    id: "google",
    label: "Google",
    brandColor: "#ea4335",
    active: true,
    svg: (
      <svg viewBox="0 0 24 24" className="size-6">
        <path
          fill="currentColor"
          d="M21.35 11.1H12v3.2h5.35c-.5 2.5-2.5 4.2-5.35 4.2-3.2 0-5.8-2.6-5.8-5.8s2.6-5.8 5.8-5.8c1.5 0 2.7.6 3.7 1.5l2.2-2.2C16.4 4.7 14.4 4 12 4 7.5 4 4 7.5 4 12s3.5 8 8 8c4.5 0 7.6-3.2 7.6-7.6 0-.5-.1-1-.25-1.3z"
        />
      </svg>
    ),
  },
  {
    id: "github",
    label: "GitHub",
    brandColor: "#1a1f24",
    active: true,
    svg: (
      <svg viewBox="0 0 24 24" className="size-6">
        <path
          fill="currentColor"
          d="M12 2C6.5 2 2 6.6 2 12.2c0 4.5 2.9 8.3 6.8 9.6.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.4-3.4-1.4-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1 .8-.2 1.7-.4 2.5-.4s1.7.1 2.5.4c1.9-1.3 2.8-1 2.8-1 .6 1.5.2 2.5.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.6 5 .4.3.7 1 .7 2v3c0 .3.2.6.7.5 4-1.3 6.8-5.1 6.8-9.6C22 6.6 17.5 2 12 2z"
        />
      </svg>
    ),
  },
  {
    id: "apple",
    label: "Apple",
    brandColor: "#000",
    active: true,
    svg: (
      <svg viewBox="0 0 24 24" className="size-6">
        <path
          fill="currentColor"
          d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
        />
      </svg>
    ),
  },
  {
    id: "facebook",
    label: "Facebook",
    brandColor: "#1877f2",
    active: true,
    svg: (
      <svg viewBox="0 0 24 24" className="size-6">
        <path
          fill="currentColor"
          d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c5.05-.5 9-4.76 9-9.95z"
        />
      </svg>
    ),
  },
  {
    id: "microsoft",
    label: "Microsoft",
    brandColor: "#0078d4",
    active: true,
    svg: (
      <svg viewBox="0 0 24 24" className="size-6">
        <path fill="currentColor" d="M3 3h8.5v8.5H3V3zm9.5 0H21v8.5h-8.5V3zM3 12.5h8.5V21H3v-8.5zm9.5 0H21V21h-8.5v-8.5z" />
      </svg>
    ),
  },
  {
    id: "twitter",
    label: "X",
    brandColor: "#000",
    active: true,
    svg: (
      <svg viewBox="0 0 24 24" className="size-6">
        <path
          fill="currentColor"
          d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"
        />
      </svg>
    ),
  },
]

interface StdProviderState {
  enabled: boolean
  setEnabled: (v: boolean) => void
  clientId: string
  setClientId: (v: string) => void
  clientSecret: string
  setClientSecret: (v: string) => void
}
interface MicrosoftProviderState extends StdProviderState {
  tenant: string
  setTenant: (v: string) => void
}
interface AppleProviderState {
  enabled: boolean
  setEnabled: (v: boolean) => void
  clientId: string
  setClientId: (v: string) => void
  teamId: string
  setTeamId: (v: string) => void
  keyId: string
  setKeyId: (v: string) => void
  privateKey: string
  setPrivateKey: (v: string) => void
}

function SocialProvidersGrid({
  project,
  state,
}: {
  project: AuthProjectDetail
  state: {
    google: StdProviderState
    github: StdProviderState
    facebook: StdProviderState
    microsoft: MicrosoftProviderState
    twitter: StdProviderState
    apple: AppleProviderState
  }
}) {
  const t = useTranslations("authProjects.detail.settings")
  const [expanded, setExpanded] = useState<SocialProviderId | null>(null)

  function isConfigured(id: SocialProviderId): boolean {
    if (id === "apple") {
      return Boolean(project.socialProviders?.apple?.clientId)
    }
    return Boolean(project.socialProviders?.[id]?.clientId)
  }

  function isEnabledLocal(id: SocialProviderId): boolean {
    return state[id].enabled
  }

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://auth.sentroy.com"

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {SOCIAL_PROVIDERS.map((p) => {
          const isExpanded = expanded === p.id
          const configured = isConfigured(p.id)
          const enabled = isEnabledLocal(p.id)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                if (!p.active) return
                setExpanded(isExpanded ? null : p.id)
              }}
              disabled={!p.active}
              title={p.active ? p.label : `${p.label} — ${t("comingSoon")}`}
              className={`group relative flex flex-col items-center gap-1.5 rounded-lg border p-3 transition ${
                !p.active
                  ? "cursor-not-allowed opacity-40"
                  : isExpanded
                    ? "border-foreground"
                    : "hover:border-foreground/40"
              }`}
              style={
                isExpanded
                  ? { borderColor: p.brandColor, color: p.brandColor }
                  : !p.active
                    ? { color: "#94a3b8" }
                    : enabled
                      ? { color: p.brandColor }
                      : { color: "#64748b" }
              }
            >
              {p.svg}
              <span className="text-[10px] font-medium text-foreground">
                {p.label}
              </span>
              {enabled && configured ? (
                <span
                  className="absolute right-1.5 top-1.5 size-1.5 rounded-full"
                  style={{ background: p.brandColor }}
                  aria-label="enabled"
                />
              ) : null}
            </button>
          )
        })}
      </div>

      {expanded === "google" ? (
        <StandardProviderForm
          providerId="google"
          brandColor="#ea4335"
          label="Google"
          callbackUrl={`${origin}/api/v1/auth/${project.slug}/social/google/callback`}
          callbackLabel={t("googleCallbackLabel")}
          hint={t("googleProviderHint")}
          clientIdPlaceholder="123456789012-xxxxxxxxxxx.apps.googleusercontent.com"
          hasStoredSecret={Boolean(project.socialProviders?.google?.clientSecretEncrypted)}
          state={state.google}
        />
      ) : null}
      {expanded === "github" ? (
        <StandardProviderForm
          providerId="github"
          brandColor="#1a1f24"
          label="GitHub"
          callbackUrl={`${origin}/api/v1/auth/${project.slug}/social/github/callback`}
          callbackLabel={t("githubCallbackLabel")}
          hint={t("githubProviderHint")}
          clientIdPlaceholder="Iv1.abc123def456"
          hasStoredSecret={Boolean(project.socialProviders?.github?.clientSecretEncrypted)}
          state={state.github}
        />
      ) : null}
      {expanded === "facebook" ? (
        <StandardProviderForm
          providerId="facebook"
          brandColor="#1877f2"
          label="Facebook"
          callbackUrl={`${origin}/api/v1/auth/${project.slug}/social/facebook/callback`}
          callbackLabel={t("facebookCallbackLabel")}
          hint={t("facebookProviderHint")}
          clientIdPlaceholder="1234567890123456"
          hasStoredSecret={Boolean(project.socialProviders?.facebook?.clientSecretEncrypted)}
          state={state.facebook}
        />
      ) : null}
      {expanded === "microsoft" ? (
        <MicrosoftProviderForm
          callbackUrl={`${origin}/api/v1/auth/${project.slug}/social/microsoft/callback`}
          callbackLabel={t("microsoftCallbackLabel")}
          hint={t("microsoftProviderHint")}
          hasStoredSecret={Boolean(project.socialProviders?.microsoft?.clientSecretEncrypted)}
          state={state.microsoft}
        />
      ) : null}
      {expanded === "twitter" ? (
        <StandardProviderForm
          providerId="twitter"
          brandColor="#000"
          label="X"
          callbackUrl={`${origin}/api/v1/auth/${project.slug}/social/twitter/callback`}
          callbackLabel={t("twitterCallbackLabel")}
          hint={t("twitterProviderHint")}
          clientIdPlaceholder="VGhpc0lzWW91ckNsaWVudElk"
          hasStoredSecret={Boolean(project.socialProviders?.twitter?.clientSecretEncrypted)}
          state={state.twitter}
        />
      ) : null}
      {expanded === "apple" ? (
        <AppleProviderForm
          callbackUrl={`${origin}/api/v1/auth/${project.slug}/social/apple/callback`}
          callbackLabel={t("appleCallbackLabel")}
          hint={t("appleProviderHint")}
          hasStoredKey={Boolean(project.socialProviders?.apple?.privateKeyEncrypted)}
          state={state.apple}
        />
      ) : null}
    </div>
  )
}

function ProviderShell({
  brandColor,
  label,
  enabled,
  setEnabled,
  callbackUrl,
  callbackLabel,
  hint,
  children,
}: {
  brandColor: string
  label: string
  enabled: boolean
  setEnabled: (v: boolean) => void
  callbackUrl: string
  callbackLabel: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <div
      className="grid gap-3 rounded-md border p-4"
      style={{ borderColor: `${brandColor}40` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="size-2 rounded-full"
            style={{ background: brandColor }}
          />
          <span className="text-sm font-semibold">{label}</span>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>
      {children}
      <p className="text-[11px] text-muted-foreground">
        {callbackLabel}{" "}
        <code className="break-all text-[10px]">{callbackUrl}</code>
      </p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  )
}

function StandardProviderForm({
  providerId,
  brandColor,
  label,
  callbackUrl,
  callbackLabel,
  hint,
  clientIdPlaceholder,
  hasStoredSecret,
  state,
}: {
  providerId: SocialProviderId
  brandColor: string
  label: string
  callbackUrl: string
  callbackLabel: string
  hint: string
  clientIdPlaceholder: string
  hasStoredSecret: boolean
  state: StdProviderState
}) {
  const t = useTranslations("authProjects.detail.settings")
  return (
    <ProviderShell
      brandColor={brandColor}
      label={label}
      enabled={state.enabled}
      setEnabled={state.setEnabled}
      callbackUrl={callbackUrl}
      callbackLabel={callbackLabel}
      hint={hint}
    >
      <Field label={t("clientIdLabel")}>
        <Input
          value={state.clientId}
          onChange={(e) => state.setClientId(e.target.value)}
          placeholder={clientIdPlaceholder}
          className="font-mono text-xs"
        />
      </Field>
      <Field
        label={
          hasStoredSecret
            ? t("clientSecretRotateLabel")
            : t("clientSecretLabel")
        }
      >
        <Input
          value={state.clientSecret}
          onChange={(e) => state.setClientSecret(e.target.value)}
          type="password"
          placeholder={
            hasStoredSecret
              ? t("clientSecretRotatePlaceholder")
              : t("clientSecretPlaceholder")
          }
          className="font-mono text-xs"
        />
      </Field>
      {providerId === "twitter" ? (
        <p className="text-[10px] text-amber-700 dark:text-amber-400">
          {t("twitterEmailWarning")}
        </p>
      ) : null}
    </ProviderShell>
  )
}

function MicrosoftProviderForm({
  callbackUrl,
  callbackLabel,
  hint,
  hasStoredSecret,
  state,
}: {
  callbackUrl: string
  callbackLabel: string
  hint: string
  hasStoredSecret: boolean
  state: MicrosoftProviderState
}) {
  const t = useTranslations("authProjects.detail.settings")
  return (
    <ProviderShell
      brandColor="#0078d4"
      label="Microsoft"
      enabled={state.enabled}
      setEnabled={state.setEnabled}
      callbackUrl={callbackUrl}
      callbackLabel={callbackLabel}
      hint={hint}
    >
      <Field label={t("clientIdLabel")}>
        <Input
          value={state.clientId}
          onChange={(e) => state.setClientId(e.target.value)}
          placeholder="00000000-0000-0000-0000-000000000000"
          className="font-mono text-xs"
        />
      </Field>
      <Field
        label={
          hasStoredSecret
            ? t("clientSecretRotateLabel")
            : t("clientSecretLabel")
        }
      >
        <Input
          value={state.clientSecret}
          onChange={(e) => state.setClientSecret(e.target.value)}
          type="password"
          placeholder={
            hasStoredSecret
              ? t("clientSecretRotatePlaceholder")
              : t("clientSecretPlaceholder")
          }
          className="font-mono text-xs"
        />
      </Field>
      <Field label={t("microsoftTenantLabel")}>
        <Input
          value={state.tenant}
          onChange={(e) => state.setTenant(e.target.value)}
          placeholder="common"
          className="font-mono text-xs"
        />
      </Field>
      <p className="text-[11px] text-muted-foreground">
        {t("microsoftTenantHint")}
      </p>
    </ProviderShell>
  )
}

function AppleProviderForm({
  callbackUrl,
  callbackLabel,
  hint,
  hasStoredKey,
  state,
}: {
  callbackUrl: string
  callbackLabel: string
  hint: string
  hasStoredKey: boolean
  state: AppleProviderState
}) {
  const t = useTranslations("authProjects.detail.settings")
  return (
    <ProviderShell
      brandColor="#000"
      label="Apple"
      enabled={state.enabled}
      setEnabled={state.setEnabled}
      callbackUrl={callbackUrl}
      callbackLabel={callbackLabel}
      hint={hint}
    >
      <Field label={t("appleServiceIdLabel")}>
        <Input
          value={state.clientId}
          onChange={(e) => state.setClientId(e.target.value)}
          placeholder="com.example.signin"
          className="font-mono text-xs"
        />
      </Field>
      <Field label={t("appleTeamIdLabel")}>
        <Input
          value={state.teamId}
          onChange={(e) => state.setTeamId(e.target.value)}
          placeholder="ABCDE12345"
          className="font-mono text-xs"
        />
      </Field>
      <Field label={t("appleKeyIdLabel")}>
        <Input
          value={state.keyId}
          onChange={(e) => state.setKeyId(e.target.value)}
          placeholder="ABCDE12345"
          className="font-mono text-xs"
        />
      </Field>
      <div className="grid gap-1.5">
        <label className="text-xs font-medium">
          {hasStoredKey
            ? t("applePrivateKeyRotateLabel")
            : t("applePrivateKeyLabel")}
        </label>
        <Textarea
          value={state.privateKey}
          onChange={(e) => state.setPrivateKey(e.target.value)}
          rows={6}
          placeholder={
            hasStoredKey
              ? t("applePrivateKeyRotatePlaceholder")
              : "-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----"
          }
          className="font-mono text-[10px]"
        />
        <p className="text-[11px] text-muted-foreground">
          {t("applePrivateKeyHint")}
        </p>
      </div>
    </ProviderShell>
  )
}
