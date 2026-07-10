"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { AnimatePresence, LayoutGroup, motion } from "framer-motion"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  PlusSignIcon,
  Mail01Icon,
  Delete02Icon,
  Loading03Icon,
  Copy01Icon,
  Tick02Icon,
  CloudUploadIcon,
  CloudDownloadIcon,
  EyeIcon,
  Layout01Icon,
  DashboardSquare01Icon,
  File01Icon,
  GlobalIcon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons"

import { PageTransition, EmptyState } from "@workspace/console/components/shared"
import { confirm } from "@workspace/console/stores/confirm"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"
import { TemplateEditorDialog } from "@/components/templates/template-editor-dialog"
import { TemplateImportDialog } from "@/components/templates/template-import-dialog"
import { TemplateLibraryDialog } from "@/components/templates/template-library-dialog"
import { TemplatePreviewDialog } from "@/components/templates/template-preview-dialog"
import {
  resolveLocalized,
  localizedLanguages,
  type LocalizedString,
} from "@sentroy-co/sdk"

export interface Template {
  id: string
  name: LocalizedString
  subject: LocalizedString
  mjmlBody: LocalizedString
  domainId?: string
  domainName?: string
  thumbnailUrl?: string
  createdAt?: string
  updatedAt?: string
}

function mapSdkTemplate(raw: Record<string, unknown>): Template {
  return {
    id: raw.id as string,
    name: (raw.name as LocalizedString) ?? "",
    subject: (raw.subject as LocalizedString) ?? "",
    mjmlBody: (raw.mjmlBody as LocalizedString) ?? "",
    domainId: raw.domainId as string | undefined,
    domainName: raw.domainName as string | undefined,
    thumbnailUrl: raw.thumbnailUrl as string | undefined,
    createdAt: raw.createdAt as string | undefined,
    updatedAt: raw.updatedAt as string | undefined,
  }
}

function formatDate(dateStr?: string) {
  if (!dateStr) return ""
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

/**
 * Stable, repeatable color palette for chips. Hash the source key so
 * the same domain always picks the same tone across reloads.
 */
const CHIP_TONES = [
  "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
  "bg-teal-500/10 text-teal-700 dark:text-teal-300",
  "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
] as const

function toneFor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0
  }
  return CHIP_TONES[Math.abs(h) % CHIP_TONES.length]!
}

/** Reusable filter chip — same pill shape used for "All" and each
 *  domain. Active state flips to primary; idle uses the per-key tone. */
function FilterChip({
  label,
  count,
  active,
  tone,
  icon,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  tone?: string
  icon?: typeof PlusSignIcon
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : tone
            ? cn("border-transparent hover:brightness-110", tone)
            : "border-border bg-card hover:bg-muted",
      )}
    >
      {icon ? (
        <HugeiconsIcon icon={icon} strokeWidth={2} className="size-3" />
      ) : null}
      <span className="font-medium">{label}</span>
      <span
        className={cn(
          "tabular-nums text-[10px]",
          active
            ? "text-primary-foreground/80"
            : tone
              ? "opacity-70"
              : "text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  )
}

const VIEW_MODE_KEY = "sentroy.mail-templates.viewMode"

export function TemplatesContent() {
  const t = useTranslations("templates")
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]

  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
    null
  )
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Domain filter — drives the chip bar at the top. "all" leaves the
  // grid as-is; "standalone" surfaces templates without a domain
  // binding; any other value is a domain id.
  const [filterDomain, setFilterDomain] = useState<string>("all")

  // View mode persisted to localStorage so the user's preferred
  // layout sticks across reloads.
  const [viewMode, setViewMode] = useState<"grid" | "masonry">("grid")
  useEffect(() => {
    const saved =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(VIEW_MODE_KEY)
    if (saved === "grid" || saved === "masonry") setViewMode(saved)
  }, [])
  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(VIEW_MODE_KEY, viewMode)
  }, [viewMode])

  const apiBase = `/api/companies/${slug}/templates`

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(apiBase)
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to load templates")
      }
      const list = (json.data as Record<string, unknown>[]) ?? []
      setTemplates(list.map(mapSdkTemplate))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load templates"
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  // Distinct domains observed across the templates — drives the chip
  // bar. Sorted alphabetically so the order is deterministic across
  // reloads. `standalone` is synthesized when at least one template
  // has no domain.
  const domainOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    let standaloneCount = 0
    for (const tpl of templates) {
      if (tpl.domainId && tpl.domainName) {
        if (!map.has(tpl.domainId)) {
          map.set(tpl.domainId, { id: tpl.domainId, name: tpl.domainName })
        }
      } else {
        standaloneCount += 1
      }
    }
    const list = Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
    return { domains: list, standaloneCount }
  }, [templates])

  const domainCounts = useMemo(() => {
    const map = new Map<string, number>()
    map.set("all", templates.length)
    map.set("standalone", domainOptions.standaloneCount)
    for (const d of domainOptions.domains) {
      map.set(d.id, templates.filter((tpl) => tpl.domainId === d.id).length)
    }
    return map
  }, [templates, domainOptions])

  const visibleTemplates = useMemo(() => {
    if (filterDomain === "all") return templates
    if (filterDomain === "standalone")
      return templates.filter((tpl) => !tpl.domainId)
    return templates.filter((tpl) => tpl.domainId === filterDomain)
  }, [templates, filterDomain])

  // Infinite scroll — render in chunks so a thousand-template account
  // doesn't paint everything on the first frame. Same pattern as the
  // admin library: sentinel div bumps `visibleCount` when it lands
  // near the viewport.
  const PAGE_SIZE = 60
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [filterDomain])
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    if (visibleCount >= visibleTemplates.length) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((n) =>
            Math.min(n + PAGE_SIZE, visibleTemplates.length),
          )
        }
      },
      { rootMargin: "600px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visibleCount, visibleTemplates.length])

  const renderedItems = useMemo(
    () => visibleTemplates.slice(0, visibleCount),
    [visibleTemplates, visibleCount],
  )

  // FAB collapse on scroll — once past the header the floating "New"
  // button drops its label and shrinks to an icon-only disc.
  const [pageScrolled, setPageScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setPageScrolled(window.scrollY > 80)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  function handleCreate() {
    setSelectedTemplate(null)
    setEditorOpen(true)
  }

  function handleEdit(template: Template) {
    setSelectedTemplate(template)
    setEditorOpen(true)
  }

  function handleExport() {
    if (templates.length === 0) return
    const payload = templates.map((tpl) => ({
      name: tpl.name,
      subject: tpl.subject,
      mjmlBody: tpl.mjmlBody,
      variables: [] as string[],
      description: "",
      isActive: true,
    }))
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    const stamp = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `sentroy-templates-${stamp}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(t("exportSuccess", { count: templates.length }))
  }

  function handlePreview(e: React.MouseEvent, template: Template) {
    e.stopPropagation()
    setPreviewTemplate(template)
    setPreviewOpen(true)
  }

  function handleCopyId(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    navigator.clipboard.writeText(id)
    setCopiedId(id)
    toast.success(t("idCopied"))
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function handleDelete(e: React.MouseEvent, template: Template) {
    e.stopPropagation()

    const templateName = resolveLocalized(template.name) || t("untitled")
    const ok = await confirm({
      title: t("confirmDeleteTitle"),
      description: t("confirmDeleteDesc", { name: templateName }),
      confirmText: t("delete"),
      destructive: true,
    })
    if (!ok) return

    setDeletingId(template.id)
    try {
      const res = await fetch(`${apiBase}/${template.id}`, {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to delete template")
      }
      setTemplates((prev) => prev.filter((tpl) => tpl.id !== template.id))
      toast.success(t("templateDeleted"))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to delete template"
      toast.error(message)
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <PageTransition className="flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      </PageTransition>
    )
  }

  // Card body shared between grid and masonry. Closure captures the
  // setters so we don't have to prop-drill through a separate
  // component.
  const renderCard = (template: Template, masonry: boolean) => {
    const name = resolveLocalized(template.name) || t("untitled")
    const subject = resolveLocalized(template.subject)
    const langs = localizedLanguages(template.name)
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => handleEdit(template)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            handleEdit(template)
          }
        }}
        className="group/card flex cursor-pointer flex-col gap-3 overflow-hidden rounded-xl border bg-card transition-colors hover:border-foreground/20"
      >
        <div
          className={cn(
            "relative overflow-hidden bg-muted/40",
            !masonry && "aspect-[3/4]",
          )}
        >
          {template.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={template.thumbnailUrl}
              alt={name}
              className={cn(
                masonry
                  ? "block h-auto w-full"
                  : "size-full object-cover",
              )}
            />
          ) : (
            <div
              className={cn(
                "flex items-center justify-center",
                masonry ? "py-12" : "size-full",
              )}
            >
              <HugeiconsIcon
                icon={File01Icon}
                strokeWidth={1.5}
                className="size-10 text-muted-foreground/40"
              />
            </div>
          )}

          {/* Hover-only action row in the top-right corner of the
              thumbnail — keeps the card body clean while still
              giving the user one-tap access to preview / copy id /
              delete. */}
          <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover/card:opacity-100">
            <button
              type="button"
              onClick={(e) => handlePreview(e, template)}
              title={t("preview")}
              className="pointer-events-auto inline-flex size-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
            >
              <HugeiconsIcon
                icon={EyeIcon}
                strokeWidth={2}
                className="size-3.5"
              />
            </button>
            <button
              type="button"
              onClick={(e) => handleCopyId(e, template.id)}
              title={t("copyId")}
              className="pointer-events-auto inline-flex size-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
            >
              <HugeiconsIcon
                icon={copiedId === template.id ? Tick02Icon : Copy01Icon}
                strokeWidth={2}
                className="size-3.5"
              />
            </button>
            <button
              type="button"
              onClick={(e) => handleDelete(e, template)}
              disabled={deletingId === template.id}
              title={t("delete")}
              className="pointer-events-auto inline-flex size-7 items-center justify-center rounded-full bg-background/90 text-destructive shadow-sm backdrop-blur transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
            >
              <HugeiconsIcon
                icon={
                  deletingId === template.id ? Loading03Icon : Delete02Icon
                }
                strokeWidth={2}
                className={cn(
                  "size-3.5",
                  deletingId === template.id && "animate-spin",
                )}
              />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 px-4 pb-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{name}</span>
              {subject ? (
                <span className="truncate text-xs text-muted-foreground">
                  {subject}
                </span>
              ) : null}
            </div>
            {template.domainName ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (template.domainId) setFilterDomain(template.domainId)
                }}
                className={cn(
                  "shrink-0 rounded-full border border-transparent px-2 py-0.5 text-[10px] capitalize transition-colors hover:brightness-110",
                  toneFor(template.domainId || template.domainName),
                  filterDomain === template.domainId &&
                    "ring-1 ring-primary/40",
                )}
              >
                {template.domainName}
              </button>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1">
              {langs.map((lang) => (
                <span
                  key={lang}
                  className="rounded border border-border bg-muted/40 px-1 text-[9.5px] font-medium uppercase text-muted-foreground"
                >
                  {lang}
                </span>
              ))}
            </div>
            {template.updatedAt ? (
              <span className="text-[10px] text-muted-foreground">
                {formatDate(template.updatedAt)}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <PageTransition className="flex flex-1 flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">{t("title")}</h1>

          {/* Secondary actions get rolled into a "More" dropdown so
              the header stays scannable. The primary "Create" action
              now lives in the floating bottom-right FAB instead. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm">
                  <HugeiconsIcon
                    icon={MoreHorizontalIcon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  {t("moreActions")}
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setLibraryOpen(true)}>
                <HugeiconsIcon
                  icon={Mail01Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("browseLibrary")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setImportOpen(true)}>
                <HugeiconsIcon
                  icon={CloudUploadIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("importTemplate")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleExport}
                disabled={templates.length === 0}
              >
                <HugeiconsIcon
                  icon={CloudDownloadIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("exportTemplate")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Domain chip bar + view-mode toggle. Same pattern as the
            admin library: scroll the chip strip on its own axis,
            keep the toggle pinned right via flex. */}
        {templates.length > 0 ? (
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
              <FilterChip
                label={t("allDomains")}
                count={domainCounts.get("all") ?? 0}
                active={filterDomain === "all"}
                onClick={() => setFilterDomain("all")}
              />
              {domainOptions.standaloneCount > 0 ? (
                <FilterChip
                  label={t("standaloneOnly")}
                  count={domainCounts.get("standalone") ?? 0}
                  active={filterDomain === "standalone"}
                  onClick={() => setFilterDomain("standalone")}
                />
              ) : null}
              {domainOptions.domains.map((d) => (
                <FilterChip
                  key={d.id}
                  label={d.name}
                  count={domainCounts.get(d.id) ?? 0}
                  active={filterDomain === d.id}
                  tone={toneFor(d.id)}
                  icon={GlobalIcon}
                  onClick={() => setFilterDomain(d.id)}
                />
              ))}
            </div>

            <div className="hidden shrink-0 items-center gap-0.5 self-start rounded-full border bg-muted/40 p-0.5 md:flex">
              {(
                [
                  { value: "grid", icon: Layout01Icon, label: t("viewGrid") },
                  {
                    value: "masonry",
                    icon: DashboardSquare01Icon,
                    label: t("viewMasonry"),
                  },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setViewMode(mode.value)}
                  title={mode.label}
                  aria-label={mode.label}
                  aria-pressed={viewMode === mode.value}
                  className={cn(
                    "inline-flex size-7 items-center justify-center rounded-full transition-colors",
                    viewMode === mode.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <HugeiconsIcon
                    icon={mode.icon}
                    strokeWidth={2}
                    className="size-3.5"
                  />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed">
          <EmptyState
            icon={<HugeiconsIcon icon={Mail01Icon} strokeWidth={1.5} />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              <Button onClick={handleCreate}>
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("createTemplate")}
              </Button>
            }
          />
        </div>
      ) : visibleTemplates.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {t("noMatch")}
        </div>
      ) : viewMode === "masonry" ? (
        <>
          <div className="gap-3 sm:columns-2 md:columns-3 xl:columns-4 2xl:columns-5 [column-fill:_balance]">
            {renderedItems.map((tpl) => (
              <div key={tpl.id} className="mb-3 break-inside-avoid">
                {renderCard(tpl, true)}
              </div>
            ))}
          </div>
          {visibleCount < visibleTemplates.length ? (
            <div ref={sentinelRef} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {Array.from({
                length: Math.min(4, visibleTemplates.length - visibleCount),
              }).map((_, i) => (
                <Skeleton key={i} className="h-[420px] w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="text-center text-[11px] text-muted-foreground">
              {t("totalCount", { count: visibleTemplates.length })}
            </div>
          )}
        </>
      ) : (
        <>
          <LayoutGroup>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <AnimatePresence mode="popLayout" initial={false}>
                {renderedItems.map((tpl) => (
                  <motion.div
                    key={tpl.id}
                    layout
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{
                      layout: { duration: 0.22, ease: "easeOut" },
                      opacity: { duration: 0.16 },
                      scale: { duration: 0.16 },
                    }}
                  >
                    {renderCard(tpl, false)}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </LayoutGroup>
          {visibleCount < visibleTemplates.length ? (
            <div ref={sentinelRef} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {Array.from({
                length: Math.min(4, visibleTemplates.length - visibleCount),
              }).map((_, i) => (
                <Skeleton key={i} className="h-[420px] w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="text-center text-[11px] text-muted-foreground">
              {t("totalCount", { count: visibleTemplates.length })}
            </div>
          )}
        </>
      )}

      <TemplateEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        template={selectedTemplate}
        onSaved={fetchTemplates}
      />

      <TemplateImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        slug={slug}
        onImported={fetchTemplates}
      />

      <TemplateLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onCloned={fetchTemplates}
      />

      <TemplatePreviewDialog
        open={previewOpen}
        onOpenChange={(o) => {
          setPreviewOpen(o)
          if (!o) setPreviewTemplate(null)
        }}
        template={previewTemplate}
        onThumbnailGenerated={(id, url) => {
          setTemplates((prev) =>
            prev.map((tpl) =>
              tpl.id === id ? { ...tpl, thumbnailUrl: url } : tpl,
            ),
          )
        }}
      />

      {/* FAB — fixed bottom-right, label collapses on scroll. */}
      <button
        type="button"
        onClick={handleCreate}
        title={t("createTemplate")}
        aria-label={t("createTemplate")}
        className={cn(
          "fixed bottom-6 right-6 z-40 inline-flex h-12 items-center justify-center gap-2 overflow-hidden rounded-full bg-primary text-primary-foreground shadow-lg ring-1 ring-foreground/5 transition-all hover:brightness-110",
          pageScrolled ? "w-12 px-0" : "w-auto px-5",
        )}
      >
        <HugeiconsIcon
          icon={PlusSignIcon}
          strokeWidth={2}
          className="size-5 shrink-0"
        />
        <span
          className={cn(
            "whitespace-nowrap text-sm font-medium transition-[max-width,opacity] duration-200",
            pageScrolled ? "max-w-0 opacity-0" : "max-w-[200px] opacity-100",
          )}
        >
          {t("createTemplate")}
        </span>
      </button>
    </PageTransition>
  )
}
