"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  PlusSignIcon,
  Delete02Icon,
  ArrowRight01Icon,
  UserGroup02Icon,
  InformationCircleIcon,
  Copy01Icon,
  Tick02Icon,
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
import { confirm } from "@workspace/console/stores/confirm"

/**
 * Auth Projects management — list + create + delete + navigate-to-detail.
 *
 * i18n: tüm copy `console.json` `authProjects` namespace'inden çekilir.
 * Yeni bir kullanıcı-yüzlü string eklerken önce console.json'a key ekle
 * (en + tr), sonra burada `t("...")` ile referans ver.
 */

type Plan = "free" | "pro"

interface AuthProjectListItem {
  id: string
  name: string
  slug: string
  projectId: string
  apiKeyPrefix: string
  enabled: boolean
  plan: Plan
  maxMau: number
  branding: {
    displayName: string
    primaryColor: string | null
    logoUrl: string | null
  }
  emailVerificationRequired: boolean
  magicLinkEnabled: boolean
  allowedOrigins: string[]
  quotaUsage: { mau: number; signupsThisHour: number }
  createdAt: string
}

export function AuthProjectsContent() {
  const params = useParams<{ "company-slug": string; lang?: string }>()
  const slug = params["company-slug"]
  const lang = params.lang ?? "en"
  const router = useRouter()
  const t = useTranslations("authProjects.list")
  const apiBase = `/api/companies/${slug}/auth-projects`

  const [projects, setProjects] = useState<AuthProjectListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [revealKey, setRevealKey] = useState<{
    name: string
    apiKey: string
    projectSlug: string
  } | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(apiBase)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("loadFailed"))
      setProjects(json.data ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [apiBase, t])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function deleteProject(p: AuthProjectListItem) {
    const ok = await confirm({
      title: t("deleteConfirmTitle", { name: p.name }),
      description: t("deleteConfirmDescription", {
        count: p.quotaUsage.mau,
      }),
      confirmText: t("deleteConfirmAction"),
      destructive: true,
    })
    if (!ok) return
    const res = await fetch(`${apiBase}/${p.id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success(t("deleteSuccess"))
      fetchAll()
    } else {
      toast.error(t("deleteFailed"))
    }
  }

  return (
    <PageTransition>
      <div className="flex h-[calc(100vh-4rem)] min-w-0 flex-col gap-4">
        <div className="flex min-w-0 items-start justify-between gap-3 border-b pb-4">
          <div className="flex flex-col gap-1">
            <div className="inline-flex w-fit items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <HugeiconsIcon
                icon={UserGroup02Icon}
                strokeWidth={2}
                className="size-3"
              />
              {t("subtitle")}
            </div>
            <h1 className="text-xl font-semibold">{t("title")}</h1>
            <p className="max-w-2xl text-xs text-muted-foreground">
              {t("lede")}
            </p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <HugeiconsIcon
              icon={PlusSignIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("newButton")}
          </Button>
        </div>

        <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="min-w-0 pe-3">
            {loading ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full rounded-lg" />
                ))}
              </div>
            ) : projects.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <p className="text-sm text-muted-foreground">{t("emptyBody")}</p>
                <Button
                  size="sm"
                  className="mt-4"
                  onClick={() => setCreateOpen(true)}
                >
                  <HugeiconsIcon
                    icon={PlusSignIcon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  {t("emptyAction")}
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {projects.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    onOpen={() =>
                      router.push(
                        `/${lang}/d/${slug}/auth-projects/${p.id}`,
                      )
                    }
                    onDelete={() => deleteProject(p)}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        apiBase={apiBase}
        onCreated={(item) => {
          setRevealKey({
            name: item.name,
            apiKey: item.apiKey,
            projectSlug: item.slug,
          })
          fetchAll()
        }}
      />
      {revealKey ? (
        <ApiKeyRevealDialog
          open={!!revealKey}
          onOpenChange={(o) => !o && setRevealKey(null)}
          info={revealKey}
        />
      ) : null}
    </PageTransition>
  )
}

function ProjectCard({
  project,
  onOpen,
  onDelete,
}: {
  project: AuthProjectListItem
  onOpen: () => void
  onDelete: () => void
}) {
  const t = useTranslations("authProjects.list.card")

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen()
        }
      }}
      className="group relative cursor-pointer rounded-lg border bg-card p-4 transition hover:border-foreground/30 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex min-w-0 items-start gap-3">
        {project.branding.logoUrl ? (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background"
            style={
              project.branding.primaryColor
                ? { borderColor: `${project.branding.primaryColor}40` }
                : undefined
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={project.branding.logoUrl}
              alt={project.branding.displayName}
              className="h-full w-full object-contain"
            />
          </div>
        ) : (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sm font-semibold text-white"
            style={{ background: project.branding.primaryColor || "#111" }}
          >
            {project.branding.displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{project.name}</h3>
            {!project.enabled ? (
              <Badge variant="outline" className="text-[10px]">
                {t("disabled")}
              </Badge>
            ) : null}
            <Badge
              variant={project.plan === "pro" ? "default" : "secondary"}
              className="text-[10px] uppercase"
            >
              {project.plan}
            </Badge>
          </div>
          <code className="mt-0.5 block truncate text-[11px] text-muted-foreground">
            {project.slug}
          </code>
        </div>
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          strokeWidth={2}
          className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5"
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-muted-foreground">{t("usersLabel")}</div>
          <div className="font-mono">
            {project.quotaUsage.mau.toLocaleString()}{" "}
            <span className="text-muted-foreground">
              / {project.maxMau.toLocaleString()}
            </span>
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">{t("apiKeyPrefix")}</div>
          <code className="text-[11px]">{project.apiKeyPrefix}…</code>
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
        aria-label={t("deleteAria")}
      >
        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-4" />
      </button>
    </div>
  )
}

// ─── Create dialog ────────────────────────────────────────────────────────

function CreateProjectDialog({
  open,
  onOpenChange,
  apiBase,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  apiBase: string
  onCreated: (info: { id: string; name: string; slug: string; apiKey: string }) => void
}) {
  const t = useTranslations("authProjects.create")
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [primaryColor, setPrimaryColor] = useState("#111111")
  const [logoUrl, setLogoUrl] = useState("")
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(true)
  const [allowedOriginsText, setAllowedOriginsText] = useState("")
  // Slug user tarafından elle düzenlendi mi — true ise name'i takip etmiyoruz.
  const [slugDirty, setSlugDirty] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setName("")
      setSlug("")
      setSlugDirty(false)
      setPrimaryColor("#111111")
      setLogoUrl("")
      setEmailVerificationRequired(true)
      setAllowedOriginsText("")
    }
  }, [open])

  // name → slug auto-suggest (slug elle düzenlenene kadar)
  useEffect(() => {
    if (slugDirty || !name) return
    const auto = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32)
    setSlug(auto)
  }, [name, slugDirty])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !slug.trim()) {
      toast.error(t("validationNameSlugRequired"))
      return
    }
    setSubmitting(true)
    try {
      const allowedOrigins = allowedOriginsText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          branding: {
            displayName: name.trim(),
            primaryColor: primaryColor || null,
            logoUrl: logoUrl.trim() || null,
          },
          emailVerificationRequired,
          allowedOrigins,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || t("createFailed"))
        return
      }
      toast.success(t("createSuccess"))
      onOpenChange(false)
      onCreated({
        id: json.data.id,
        name: json.data.name,
        slug: json.data.slug,
        apiKey: json.data.apiKey,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <label htmlFor="ap-name" className="text-xs font-medium">
              {t("nameLabel")}
            </label>
            <Input
              id="ap-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              required
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="ap-slug" className="text-xs font-medium">
              {t("slugLabel")}
            </label>
            <Input
              id="ap-slug"
              value={slug}
              onChange={(e) => {
                setSlugDirty(true)
                setSlug(
                  e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                )
              }}
              placeholder={t("slugPlaceholder")}
              required
              pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
            />
            <p className="text-[11px] text-muted-foreground">{t("slugHint")}</p>
          </div>

          <div className="grid gap-2">
            <label className="text-xs font-medium">{t("brandingLabel")}</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                aria-label={t("brandingLabel")}
                className="h-9 w-12 cursor-pointer rounded-md border bg-background"
              />
              <Input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder={t("primaryColorPlaceholder")}
                className="font-mono text-xs"
              />
            </div>
            <Input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder={t("logoUrlPlaceholder")}
            />
            <p className="text-[11px] text-muted-foreground">{t("brandingHint")}</p>
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <div className="text-sm font-medium">{t("verifyTitle")}</div>
              <p className="text-[11px] text-muted-foreground">
                {t("verifyHint")}
              </p>
            </div>
            <Switch
              checked={emailVerificationRequired}
              onCheckedChange={setEmailVerificationRequired}
            />
          </div>

          <div className="grid gap-2">
            <label htmlFor="ap-origins" className="text-xs font-medium">
              {t("originsLabel")}
            </label>
            <Textarea
              id="ap-origins"
              rows={3}
              value={allowedOriginsText}
              onChange={(e) => setAllowedOriginsText(e.target.value)}
              placeholder={t("originsPlaceholder")}
            />
            <p className="text-[11px] text-muted-foreground">{t("originsHint")}</p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("submitting") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── API key reveal dialog ────────────────────────────────────────────────

function ApiKeyRevealDialog({
  open,
  onOpenChange,
  info,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  info: { name: string; apiKey: string; projectSlug: string }
}) {
  const t = useTranslations("authProjects.apiKeyReveal")
  const [copiedKey, setCopiedKey] = useState(false)
  const [copiedEndpoint, setCopiedEndpoint] = useState(false)

  function copyKey() {
    navigator.clipboard.writeText(info.apiKey)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 1500)
  }

  const endpointUrl = `${typeof window !== "undefined" ? window.location.origin : "https://auth.sentroy.com"}/api/v1/auth/${info.projectSlug}/signup`

  function copyEndpoint() {
    navigator.clipboard.writeText(endpointUrl)
    setCopiedEndpoint(true)
    setTimeout(() => setCopiedEndpoint(false), 1500)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t.rich("dialogDescription", {
              name: () => <strong>{info.name}</strong>,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border bg-muted/40 p-3">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("label")}
            </div>
            <code className="block break-all text-xs">{info.apiKey}</code>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyKey}
            className="w-full"
          >
            <HugeiconsIcon
              icon={copiedKey ? Tick02Icon : Copy01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {copiedKey ? t("copied") : t("copy")}
          </Button>

          {/* Bilgilendirme — error gibi görünmemesi için amber/info tonu,
              sol tarafta info icon. Önceki kırmızı destructive variant
              "hata oldu" izlenimi veriyordu. */}
          <div className="flex gap-2.5 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <HugeiconsIcon
              icon={InformationCircleIcon}
              strokeWidth={2}
              className="size-4 shrink-0 mt-0.5"
            />
            <p className="leading-relaxed">{t("infoNote")}</p>
          </div>

          <div className="grid gap-1.5">
            <label
              htmlFor="api-key-endpoint"
              className="text-[10px] uppercase tracking-wider text-muted-foreground"
            >
              {t("endpointHint")}
            </label>
            <div className="flex gap-2">
              <Input
                id="api-key-endpoint"
                readOnly
                value={endpointUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-[11px]"
              />
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={copyEndpoint}
                aria-label={t("copy")}
              >
                <HugeiconsIcon
                  icon={copiedEndpoint ? Tick02Icon : Copy01Icon}
                  strokeWidth={2}
                />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t("acknowledged")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
