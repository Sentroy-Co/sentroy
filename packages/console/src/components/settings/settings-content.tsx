"use client"

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Sentroy } from "@sentroy-co/client-sdk"
import { MediaManagerTrigger } from "@sentroy-co/client-sdk/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Loading03Icon,
  Alert02Icon,
  ImageUpload01Icon,
  Delete02Icon,
  BuildingIcon,
  Edit02Icon,
  IdentificationIcon,
  PaintBoardIcon,
  ChartLineData01Icon,
  TimeScheduleIcon,
  Alert01Icon,
  Tick02Icon,
  KeyIcon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons"

import {
  PageTransition,
  EditableField,
  DirectAvatarUpload,
} from "@workspace/console/components/shared"
import { useCompanyStore } from "@workspace/console/stores/company"
import { AuditTimelineCard } from "@workspace/console/components/settings/audit-timeline-card"
import { AccessTokensContent } from "@workspace/console/components/access-tokens/access-tokens-content"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Progress } from "@workspace/ui/components/progress"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { resolveMediaPickUrl } from "@workspace/console/lib/media-pick-url"
import type { Company } from "@workspace/db/types"

interface CompanySettings extends Company {
  usage?: {
    domains: number
    members: number
    mailboxes: number
    storageBytes?: number
  }
  membership?: {
    role: "owner" | "admin" | "member"
  }
  plan: {
    id: string
    name: Record<string, string>
    description: Record<string, string>
    maxDomainsPerCompany: number
    maxMembersPerCompany: number
    maxMailboxesPerCompany: number
    maxContacts: number
    storageLimit: number
    monthlyEmailLimit: number
  } | null
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

function UsageBar({
  label,
  used,
  limit,
  format,
}: {
  label: string
  used: number
  limit: number
  format?: "bytes" | "number"
}) {
  const percent = limit > 0 ? Math.min((used / limit) * 100, 100) : 0
  const displayUsed = format === "bytes" ? formatBytes(used) : used
  const displayLimit = format === "bytes" ? formatBytes(limit) : limit

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {displayUsed} / {displayLimit}
        </span>
      </div>
      <Progress value={percent} />
    </div>
  )
}

// ─── Vertical tabs (Apple Settings.app inspired) ────────────────────────

type SectionId =
  | "general"
  | "branding"
  | "plan"
  | "tokens"
  | "activity"
  | "danger"

interface SectionDef {
  id: SectionId
  title: string
  description?: string
  icon: typeof IdentificationIcon
  /** Owner-only sections collapse out of the nav for non-owners. */
  ownerOnly?: boolean
  /** Owner/admin-only (canEdit) sections — hidden from plain members. */
  adminOnly?: boolean
  /** Tints stay subtle — these are accent dots, not full-card colors. */
  accent: string
}

export function SettingsContent() {
  const t = useTranslations("settings")
  const tCommon = useTranslations("common")
  const params = useParams<{ "company-slug": string; lang: string }>()
  const slug = params["company-slug"]
  const lang = params.lang
  const patchActiveCompany = useCompanyStore((s) => s.patchActiveCompany)
  const fetchCompanies = useCompanyStore((s) => s.fetchCompanies)

  const [company, setCompany] = useState<CompanySettings | null>(null)
  const [companyLoading, setCompanyLoading] = useState(true)
  const [section, setSection] = useState<SectionId>("general")

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState("")
  const [deleting, setDeleting] = useState(false)

  const [avatarRemoving, setAvatarRemoving] = useState(false)
  const [coverUpdating, setCoverUpdating] = useState(false)

  /**
   * MediaManager için Sentroy client. Cookie auth (no accessToken). Slug
   * yoksa null ve MediaManager dialog "no company" mesajını gösterir.
   */
  const sentroyClient = useMemo(() => {
    if (!slug) return null
    const baseUrl =
      process.env.NEXT_PUBLIC_CORE_APP_URL ||
      (typeof window !== "undefined" ? window.location.origin : "")
    return new Sentroy({
      baseUrl,
      companySlug: slug,
    } as unknown as ConstructorParameters<typeof Sentroy>[0])
  }, [slug])

  const fetchCompany = useCallback(async () => {
    setCompanyLoading(true)
    try {
      const res = await fetch(`/api/companies/${slug}/settings`)
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to load company settings")
      }
      setCompany(json.data as CompanySettings)
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load settings",
      )
    } finally {
      setCompanyLoading(false)
    }
  }, [slug])

  useEffect(() => {
    fetchCompany()
  }, [fetchCompany])

  const isOwner = company?.membership?.role === "owner"
  const canEdit =
    company?.membership?.role === "owner" ||
    company?.membership?.role === "admin"

  // ── Save helpers ──────────────────────────────────────────────────────

  async function patchCompany(patch: Partial<CompanySettings>) {
    const res = await fetch(`/api/companies/${slug}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    const json = await res.json()
    if (!res.ok) {
      throw new Error(json.error || "Failed to save settings")
    }
    return json.data as CompanySettings
  }

  async function handleSaveName(next: string) {
    const trimmed = next.trim()
    if (!trimmed) throw new Error("Name required")
    try {
      await patchCompany({ name: trimmed })
      setCompany((prev) => (prev ? { ...prev, name: trimmed } : prev))
      patchActiveCompany({ name: trimmed })
      fetchCompanies(true)
      toast.success(t("saved"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
      throw err
    }
  }

  async function handleSaveDescription(next: string) {
    const trimmed = next.trim()
    try {
      await patchCompany({ description: trimmed })
      setCompany((prev) =>
        prev ? { ...prev, description: trimmed } : prev,
      )
      toast.success(t("saved"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
      throw err
    }
  }

  async function handleSaveSlug(next: string) {
    const trimmed = next.trim().toLowerCase()
    if (!trimmed) throw new Error("Slug required")
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) {
      const msg = t("slugInvalid")
      toast.error(msg)
      throw new Error(msg)
    }
    try {
      await patchCompany({ slug: trimmed })
      toast.success(t("saved"))
      if (trimmed !== slug) {
        const segments = window.location.pathname.split("/")
        const idx = segments.indexOf(slug)
        if (idx > -1) {
          segments[idx] = trimmed
          window.location.href = segments.join("/")
          return
        }
      }
      setCompany((prev) => (prev ? { ...prev, slug: trimmed } : prev))
      fetchCompanies(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
      throw err
    }
  }

  function handleAvatarUploaded(response: unknown) {
    // DirectAvatarUpload backend response'unu doğrudan iletir; bizim
    // /api/companies/:slug/avatar endpoint'i `{data: {avatarUrl}}` döndürür.
    const data =
      (response as { data?: { avatarUrl?: string | null } } | null)?.data ?? {}
    const next = data.avatarUrl ?? null
    setCompany((prev) => (prev ? { ...prev, avatarUrl: next } : prev))
    patchActiveCompany({ avatarUrl: next })
    fetchCompanies(true)
    toast.success(t("avatarSaved"))
  }

  async function handleAvatarRemove() {
    setAvatarRemoving(true)
    try {
      const res = await fetch(`/api/companies/${slug}/avatar`, {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to remove avatar")
      setCompany((prev) => (prev ? { ...prev, avatarUrl: null } : prev))
      patchActiveCompany({ avatarUrl: null })
      fetchCompanies(true)
      toast.success(t("avatarRemoved"))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Remove failed")
    } finally {
      setAvatarRemoving(false)
    }
  }

  /**
   * Cover photo update — `/settings` PATCH endpoint'ine `coverImageUrl`
   * yollar. URL boş string ise kapağı kaldırır. Settings handler bu alanı
   * şirket dokümanına yazar; profile/c sayfası buradan okur.
   */
  async function handleCoverPick(url: string | null) {
    setCoverUpdating(true)
    try {
      const next = await patchCompany({
        coverImageUrl: url ?? null,
      } as Partial<CompanySettings>)
      setCompany((prev) =>
        prev ? { ...prev, coverImageUrl: next.coverImageUrl ?? null } : prev,
      )
      toast.success(t("saved"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setCoverUpdating(false)
    }
  }

  async function handleDeleteCompany() {
    if (!company) return
    if (deleteConfirm.trim() !== company.slug) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/companies/${slug}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: company.slug }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to delete company")
      toast.success(t("deleteSuccess"))
      window.location.href = `/${lang}/d`
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete")
      setDeleting(false)
    }
  }

  // ── Section definitions ────────────────────────────────────────────────

  const sections: SectionDef[] = [
    {
      id: "general",
      title: t("sectionGeneral"),
      description: t("sectionGeneralDesc"),
      icon: IdentificationIcon,
      accent: "bg-blue-500",
    },
    {
      id: "branding",
      title: t("sectionBranding"),
      description: t("sectionBrandingDesc"),
      icon: PaintBoardIcon,
      accent: "bg-fuchsia-500",
    },
    {
      id: "plan",
      title: t("sectionPlan"),
      description: t("sectionPlanDesc"),
      icon: ChartLineData01Icon,
      accent: "bg-emerald-500",
    },
    {
      id: "tokens",
      title: t("sectionTokens"),
      description: t("sectionTokensDesc"),
      icon: KeyIcon,
      adminOnly: true,
      accent: "bg-violet-500",
    },
    {
      id: "activity",
      title: t("sectionActivity"),
      description: t("sectionActivityDesc"),
      icon: TimeScheduleIcon,
      accent: "bg-amber-500",
    },
    {
      id: "danger",
      title: t("sectionDanger"),
      description: t("sectionDangerDesc"),
      icon: Alert01Icon,
      ownerOnly: true,
      accent: "bg-red-500",
    },
  ]

  const visibleSections = sections.filter(
    (s) => (!s.ownerOnly || isOwner) && (!s.adminOnly || canEdit),
  )

  // ── Render ────────────────────────────────────────────────────────────

  if (companyLoading) {
    // Skeleton, yüklenmiş layout'la birebir aynı genişlik/iskelet (mx-auto
    // max-w-5xl + hero + sol-nav/içerik) — manage'e tıklayınca full-width →
    // 5xl zıplaması olmasın.
    return (
      <PageTransition>
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <Skeleton className="aspect-[6/1] w-full rounded-2xl sm:aspect-[8/1]" />
          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            <Skeleton className="h-64 w-full rounded-2xl md:w-56 md:shrink-0" />
            <Skeleton className="h-96 w-full flex-1 rounded-2xl" />
          </div>
        </div>
      </PageTransition>
    )
  }
  if (!company) return null

  const coverUrl = (company as { coverImageUrl?: string | null }).coverImageUrl

  return (
    <PageTransition>
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        {/* ── Hero: cover + identity strip (Apple-light) ────────────── */}
        <SettingsHero
          company={company}
          coverUrl={coverUrl}
          coverUpdating={coverUpdating}
          canEdit={canEdit}
          sentroyClient={sentroyClient}
          onCoverPick={handleCoverPick}
          onAvatarUploaded={handleAvatarUploaded}
          onAvatarRemove={handleAvatarRemove}
          avatarUploadUrl={`/api/companies/${slug}/avatar`}
          avatarBusy={avatarRemoving}
          onShowUsage={() => setSection("plan")}
          tCommon={tCommon}
          t={t}
          lang={lang}
        />

        {/* ── Two-column layout: vertical nav + active section ───── */}
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          {/* Sidebar nav — sticky on desktop, horizontal scroll on mobile.
              data-app-subnav: OS embed'de yatay-strip'e zorlanır (çift sidebar
              olmasın; bkz. globals.css [data-embedded]). */}
          <nav data-app-subnav className="md:sticky md:top-6 md:w-56 md:shrink-0">
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 md:mx-0 md:flex-col md:overflow-visible md:px-0">
              {visibleSections.map((s) => (
                <SectionButton
                  key={s.id}
                  active={section === s.id}
                  onClick={() => setSection(s.id)}
                  icon={s.icon}
                  accent={s.accent}
                  title={s.title}
                  description={s.description}
                />
              ))}
            </div>
          </nav>

          {/* Active section content */}
          <div className="min-w-0 flex-1">
            {section === "general" && (
              <SectionGeneral
                company={company}
                canEdit={canEdit}
                onSaveName={handleSaveName}
                onSaveSlug={handleSaveSlug}
                onSaveDescription={handleSaveDescription}
                t={t}
              />
            )}

            {section === "branding" && (
              <SectionBranding
                company={company}
                coverUrl={coverUrl}
                canEdit={canEdit}
                sentroyClient={sentroyClient}
                onAvatarUploaded={handleAvatarUploaded}
                onAvatarRemove={handleAvatarRemove}
                onCoverPick={handleCoverPick}
                avatarUploadUrl={`/api/companies/${slug}/avatar`}
                avatarBusy={avatarRemoving}
                coverBusy={coverUpdating}
                t={t}
              />
            )}

            {section === "plan" && (
              <SectionPlan company={company} lang={lang} t={t} />
            )}

            {section === "tokens" && canEdit && <AccessTokensContent />}

            {section === "activity" && <AuditTimelineCard />}

            {section === "danger" && isOwner && (
              <SectionDanger
                company={company}
                onOpenDelete={() => {
                  setDeleteConfirm("")
                  setDeleteOpen(true)
                }}
                t={t}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Delete confirmation dialog ──────────────────────────── */}
      <Dialog
        open={deleteOpen}
        onOpenChange={(o) => (deleting ? null : setDeleteOpen(o))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <HugeiconsIcon
                icon={Alert02Icon}
                strokeWidth={2}
                className="size-5"
              />
              {t("deleteCompany")}
            </DialogTitle>
            <DialogDescription>
              {t("deleteCompanyDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              <li>
                {t("deleteItemDomains", {
                  count: company.usage?.domains ?? 0,
                })}
              </li>
              <li>
                {t("deleteItemMailboxes", {
                  count: company.usage?.mailboxes ?? 0,
                })}
              </li>
              <li>
                {t("deleteItemMembers", {
                  count: company.usage?.members ?? 0,
                })}
              </li>
              <li>{t("deleteItemApiKeys")}</li>
            </ul>
            <div className="flex flex-col gap-1.5">
              <Label>{t("deleteConfirmLabel", { slug: company.slug })}</Label>
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={company.slug}
                disabled={deleting}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteCompany}
              disabled={deleting || deleteConfirm.trim() !== company.slug}
            >
              {deleting && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {t("deleteCompanyConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  )
}

// Edit02Icon import edildi ama EditableField içinde kullanılır; burada
// doğrudan kullanılmıyor — tree-shaker temizler.
void Edit02Icon

// ─── Sub: Hero strip ─────────────────────────────────────────────────────

function SettingsHero({
  company,
  coverUrl,
  coverUpdating,
  canEdit,
  sentroyClient,
  onCoverPick,
  onAvatarUploaded,
  onAvatarRemove,
  avatarUploadUrl,
  avatarBusy,
  onShowUsage,
  tCommon: _tCommon,
  t,
  lang,
}: {
  company: CompanySettings
  coverUrl: string | null | undefined
  coverUpdating: boolean
  canEdit: boolean
  sentroyClient: Sentroy | null
  onCoverPick: (url: string | null) => void
  onAvatarUploaded: (response: unknown) => void
  onAvatarRemove: () => void
  avatarUploadUrl: string
  avatarBusy: boolean
  onShowUsage: () => void
  tCommon: ReturnType<typeof useTranslations>
  t: ReturnType<typeof useTranslations>
  lang: string
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
      {/* Cover image / gradient — clickable when editable */}
      <div className="relative aspect-[6/1] w-full bg-gradient-to-br from-primary/15 via-muted/30 to-primary/5 sm:aspect-[8/1]">
        {coverUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={coverUrl}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : null}
        {canEdit && sentroyClient && (
          <div className="absolute end-3 top-3 flex items-center gap-1.5">
            <MediaManagerTrigger
              client={sentroyClient}
              accept="image/*"
              maxItems={1}
              title={t("coverPickerTitle")}
              description={t("coverPickerDesc")}
              confirmLabel={t("coverPickerConfirm")}
              onSelect={(media) => {
                const raw = media[0]
                if (!raw) return
                const url = resolveMediaPickUrl(raw)
                if (!url) {
                  toast.error(t("mediaPickNoUrl"))
                  return
                }
                void onCoverPick(url)
              }}
              trigger={
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={coverUpdating}
                  className="gap-1.5 backdrop-blur-md bg-background/85 shadow-sm"
                >
                  {coverUpdating ? (
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      strokeWidth={2}
                      className="size-3.5 animate-spin"
                    />
                  ) : (
                    <HugeiconsIcon
                      icon={ImageUpload01Icon}
                      strokeWidth={2}
                      className="size-3.5"
                    />
                  )}
                  {coverUrl ? t("coverChange") : t("coverAdd")}
                </Button>
              }
            />
            {coverUrl && (
              <Button
                variant="secondary"
                size="icon-sm"
                onClick={() => onCoverPick(null)}
                disabled={coverUpdating}
                aria-label={t("coverRemove")}
                className="bg-background/85 backdrop-blur-md"
              >
                <HugeiconsIcon
                  icon={Delete02Icon}
                  strokeWidth={2}
                  className="size-3.5"
                />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Identity row — avatar overlaps cover */}
      <div className="flex flex-col gap-4 px-5 pb-5 pt-3 sm:px-6 sm:pb-6 md:flex-row md:items-end md:justify-between">
        <div className="flex items-end gap-4">
          {canEdit ? (
            <DirectAvatarUpload
              uploadUrl={avatarUploadUrl}
              defaultAspect="1:1"
              onUploaded={onAvatarUploaded}
            >
              {({ onClick, disabled }) => (
                <button
                  type="button"
                  onClick={onClick}
                  disabled={disabled || avatarBusy}
                  className="relative z-10 shrink-0 -mt-12 md:-mt-14 disabled:opacity-50"
                  aria-label={t("changeAvatar")}
                >
                  <AvatarTriggerInner
                    avatarUrl={company.avatarUrl}
                    name={company.name}
                    busy={avatarBusy || disabled}
                    canEdit
                  />
                </button>
              )}
            </DirectAvatarUpload>
          ) : (
            <div className="relative z-10 -mt-12 shrink-0 md:-mt-14">
              <AvatarTriggerInner
                avatarUrl={company.avatarUrl}
                name={company.name}
                busy={avatarBusy}
                canEdit={false}
              />
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-0.5 pb-1">
            <h1 className="truncate text-xl font-semibold leading-tight md:text-2xl">
              {company.name}
            </h1>
            <p className="truncate font-mono text-xs text-muted-foreground">
              /d/{company.slug}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pb-1 text-xs">
          {company.plan && (
            <button
              type="button"
              onClick={onShowUsage}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-1 font-medium transition-colors hover:bg-muted"
            >
              {company.plan.name[lang] || company.plan.name.en || "Plan"}
            </button>
          )}
          <button
            type="button"
            onClick={onShowUsage}
            className="rounded-full border px-2.5 py-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            {t("memberCount", { count: company.usage?.members ?? 0 })}
          </button>
          <button
            type="button"
            onClick={onShowUsage}
            className="rounded-full border px-2.5 py-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            {t("domainCount", { count: company.usage?.domains ?? 0 })}
          </button>
          {canEdit && company.avatarUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onAvatarRemove}
              disabled={avatarBusy}
              className="text-muted-foreground hover:text-destructive"
            >
              <HugeiconsIcon
                icon={Delete02Icon}
                strokeWidth={2}
                className="size-3.5"
                data-icon="inline-start"
              />
              {t("avatarRemove")}
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}

// ─── Sub: Section button (Apple Settings.app style) ─────────────────────

function SectionButton({
  active,
  onClick,
  icon,
  accent,
  title,
  description,
}: {
  active: boolean
  onClick: () => void
  icon: typeof IdentificationIcon
  accent: string
  title: string
  description?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className={cn(
        "group flex shrink-0 items-center gap-2.5 rounded-xl border border-transparent px-3 py-2.5 text-start transition-all md:w-full md:gap-3",
        active
          ? "border-border bg-card shadow-sm"
          : "hover:bg-muted/50",
      )}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-lg text-white shadow-sm",
          accent,
        )}
      >
        <HugeiconsIcon icon={icon} strokeWidth={2} className="size-3.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "truncate text-sm font-medium leading-tight",
            !active && "text-muted-foreground group-hover:text-foreground",
          )}
        >
          {title}
        </span>
        {description && (
          <span className="hidden truncate text-[11px] text-muted-foreground md:block">
            {description}
          </span>
        )}
      </span>
    </button>
  )
}

// ─── Sub: General section ────────────────────────────────────────────────

function SectionGeneral({
  company,
  canEdit,
  onSaveName,
  onSaveSlug,
  onSaveDescription,
  t,
}: {
  company: CompanySettings
  canEdit: boolean
  onSaveName: (next: string) => Promise<void>
  onSaveSlug: (next: string) => Promise<void>
  onSaveDescription: (next: string) => Promise<void>
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <SectionShell
      icon={IdentificationIcon}
      accent="bg-blue-500"
      title={t("sectionGeneral")}
      description={t("sectionGeneralDesc")}
    >
      <div className="grid gap-1 sm:grid-cols-2">
        <EditableField
          label={t("companyName")}
          display={company.name}
          value={company.name}
          dialogTitle={t("companyName")}
          dialogDescription={t("companyNameHint")}
          placeholder="Acme Inc."
          editable={canEdit}
          onSave={onSaveName}
          displayClassName="font-medium"
        />
        <EditableField
          label={t("slug")}
          display={<span className="font-mono">/d/{company.slug}</span>}
          value={company.slug}
          dialogTitle={t("slug")}
          dialogDescription={t("slugHint")}
          placeholder="my-company"
          editable={canEdit}
          transform={(v) =>
            v.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-")
          }
          validate={(v) => {
            if (!v.trim()) return t("slugRequired")
            if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)) {
              return t("slugInvalid")
            }
            return null
          }}
          onSave={onSaveSlug}
        />
      </div>
      <div className="mt-1 grid gap-1">
        <EditableField
          label={t("companyDescription")}
          display={
            company.description?.trim() ? (
              <span className="text-sm">{company.description}</span>
            ) : (
              <span className="text-sm text-muted-foreground">
                {t("companyDescriptionEmpty")}
              </span>
            )
          }
          value={company.description ?? ""}
          dialogTitle={t("companyDescription")}
          dialogDescription={t("companyDescriptionHint")}
          placeholder={t("companyDescriptionPlaceholder")}
          editable={canEdit}
          onSave={onSaveDescription}
          multiline
        />
      </div>
    </SectionShell>
  )
}

// ─── Sub: Branding section ───────────────────────────────────────────────

function SectionBranding({
  company,
  coverUrl,
  canEdit,
  sentroyClient,
  onAvatarUploaded,
  onAvatarRemove,
  onCoverPick,
  avatarUploadUrl,
  avatarBusy,
  coverBusy,
  t,
}: {
  company: CompanySettings
  coverUrl: string | null | undefined
  canEdit: boolean
  sentroyClient: Sentroy | null
  onAvatarUploaded: (response: unknown) => void
  onAvatarRemove: () => void
  onCoverPick: (url: string | null) => void
  avatarUploadUrl: string
  avatarBusy: boolean
  coverBusy: boolean
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <SectionShell
      icon={PaintBoardIcon}
      accent="bg-fuchsia-500"
      title={t("sectionBranding")}
      description={t("sectionBrandingDesc")}
    >
      <div className="flex flex-col gap-6">
        {/* Avatar block */}
        <div className="flex items-center gap-4 rounded-xl border bg-card/40 p-4">
          <AvatarTriggerInner
            avatarUrl={company.avatarUrl}
            name={company.name}
            busy={avatarBusy}
            canEdit={false}
          />
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium">{t("avatarTitle")}</span>
            <span className="text-xs text-muted-foreground">
              {t("avatarHint")}
            </span>
          </div>
          {canEdit && (
            <div className="flex items-center gap-1.5">
              <DirectAvatarUpload
                uploadUrl={avatarUploadUrl}
                defaultAspect="1:1"
                onUploaded={onAvatarUploaded}
              >
                {({ onClick, disabled }) => (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onClick}
                    disabled={disabled || avatarBusy}
                  >
                    {company.avatarUrl ? t("avatarReplace") : t("avatarUpload")}
                  </Button>
                )}
              </DirectAvatarUpload>
              {company.avatarUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onAvatarRemove}
                  disabled={avatarBusy}
                  className="text-muted-foreground hover:text-destructive"
                >
                  {t("avatarRemove")}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Cover block */}
        <div className="flex flex-col gap-3 rounded-xl border bg-card/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{t("coverTitle")}</span>
              <span className="text-xs text-muted-foreground">
                {t("coverHint")}
              </span>
            </div>
            {canEdit && sentroyClient && (
              <div className="flex items-center gap-1.5">
                <MediaManagerTrigger
                  client={sentroyClient}
                  accept="image/*"
                  maxItems={1}
                  title={t("coverPickerTitle")}
                  description={t("coverPickerDesc")}
                  confirmLabel={t("coverPickerConfirm")}
                  onSelect={(media) => {
                    const raw = media[0]
                    if (!raw) return
                    const url = resolveMediaPickUrl(raw)
                    if (!url) {
                      toast.error(t("mediaPickNoUrl"))
                      return
                    }
                    void onCoverPick(url)
                  }}
                  trigger={
                    <Button variant="secondary" size="sm" disabled={coverBusy}>
                      {coverUrl ? t("coverChange") : t("coverAdd")}
                    </Button>
                  }
                />
                {coverUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onCoverPick(null)}
                    disabled={coverBusy}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    {t("coverRemove")}
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="aspect-[6/1] overflow-hidden rounded-lg border bg-muted/40">
            {coverUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={coverUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-primary/15 via-muted/30 to-primary/5" />
            )}
          </div>
        </div>
      </div>
    </SectionShell>
  )
}

// ─── Sub: Plan section ───────────────────────────────────────────────────

function SectionPlan({
  company,
  lang,
  t,
}: {
  company: CompanySettings
  lang: string
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <SectionShell
      icon={ChartLineData01Icon}
      accent="bg-emerald-500"
      title={t("sectionPlan")}
      description={
        company.plan
          ? company.plan.name[lang] ||
            company.plan.name.en ||
            t("sectionPlanDesc")
          : t("sectionPlanDesc")
      }
    >
      <div className="flex flex-col gap-4">
        <UsageBar
          label={t("storage")}
          used={company.usage?.storageBytes ?? company.mailStorageUsed ?? 0}
          limit={
            company.plan?.storageLimit ?? company.mailStorageLimit ?? 0
          }
          format="bytes"
        />
        <UsageBar
          label={t("emailsSent")}
          used={company.monthlyEmailsSent ?? 0}
          limit={company.monthlyEmailLimit ?? 0}
        />
        <UsageBar
          label={t("mailboxes")}
          used={company.usage?.mailboxes ?? 0}
          limit={company.maxMailboxes ?? 0}
        />
        <UsageBar
          label={t("domains")}
          used={company.usage?.domains ?? 0}
          limit={company.maxDomains ?? 0}
        />
        <UsageBar
          label={t("members")}
          used={company.usage?.members ?? 0}
          limit={company.maxMembers ?? 0}
        />
      </div>
      <div className="flex items-center justify-end border-t pt-4">
        <Button render={<a href={`/${lang}/d/${company.slug}/billing`} />}>
          {t("upgradePlan")}
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            strokeWidth={2}
            className="size-3.5"
          />
        </Button>
      </div>
    </SectionShell>
  )
}

// ─── Sub: Danger section ─────────────────────────────────────────────────

function SectionDanger({
  company: _company,
  onOpenDelete,
  t,
}: {
  company: CompanySettings
  onOpenDelete: () => void
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <SectionShell
      icon={Alert01Icon}
      accent="bg-red-500"
      title={t("sectionDanger")}
      description={t("dangerZoneDescription")}
      destructive
    >
      <div className="flex flex-col gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <p className="font-medium">{t("deleteCompany")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("deleteCompanyDescription")}
          </p>
        </div>
        <Button variant="destructive" onClick={onOpenDelete}>
          {t("deleteCompany")}
        </Button>
      </div>
    </SectionShell>
  )
}

// ─── Sub: Section shell ──────────────────────────────────────────────────

function SectionShell({
  icon,
  accent,
  title,
  description,
  destructive,
  children,
}: {
  icon: typeof IdentificationIcon
  accent: string
  title: string
  description?: string
  destructive?: boolean
  children: ReactNode
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-6",
        destructive && "border-destructive/40",
      )}
    >
      <header className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm",
            accent,
          )}
        >
          <HugeiconsIcon icon={icon} strokeWidth={2} className="size-4" />
        </span>
        <div className="flex flex-1 flex-col gap-0.5">
          <h2
            className={cn(
              "text-base font-semibold leading-tight",
              destructive && "text-destructive",
            )}
          >
            {title}
          </h2>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {!destructive && (
          <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-3" />
          </span>
        )}
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

// ─── Sub: Avatar trigger ─────────────────────────────────────────────────

function AvatarTriggerInner({
  avatarUrl,
  name,
  busy,
  canEdit,
}: {
  avatarUrl: string | null | undefined
  name: string
  busy: boolean
  canEdit: boolean
}) {
  // URL set'li ama image yüklenemezse browser broken-image icon'u yerine
  // BuildingIcon fallback'e geçer. avatarUrl değişirse state sıfırlanır
  // (yeni avatar upload sonrası retry'e fırsat).
  const [errored, setErrored] = useState(false)
  useEffect(() => {
    setErrored(false)
  }, [avatarUrl])
  const showImage = !!avatarUrl && !errored
  return (
    <span
      className={cn(
        "group/avatar relative flex size-14 items-center justify-center overflow-hidden rounded-2xl border-4 border-card bg-muted shadow-sm md:size-16",
        canEdit && "cursor-pointer",
      )}
    >
      {showImage ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={avatarUrl ?? undefined}
          alt={name}
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <HugeiconsIcon
          icon={BuildingIcon}
          strokeWidth={1.5}
          className="size-6 text-muted-foreground/50"
        />
      )}
      {canEdit && !busy && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50 text-[10px] font-medium uppercase tracking-wide text-white opacity-0 transition-opacity group-hover/avatar:opacity-100">
          <HugeiconsIcon
            icon={ImageUpload01Icon}
            strokeWidth={2}
            className="size-3.5"
          />
        </span>
      )}
      {busy && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <HugeiconsIcon
            icon={Loading03Icon}
            strokeWidth={2}
            className="size-3.5 animate-spin text-white"
          />
        </span>
      )}
    </span>
  )
}
