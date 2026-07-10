"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import * as htmlToImage from "html-to-image"
import { AnimatePresence, LayoutGroup, motion } from "framer-motion"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  PlusSignIcon,
  Delete02Icon,
  PencilEdit01Icon,
  Loading03Icon,
  File01Icon,
  AiBrain01Icon,
  Layout01Icon,
  GridViewIcon,
  DashboardSquare01Icon,
} from "@hugeicons/core-free-icons"
import {
  LocalizedField,
  PageTransition,
  type LocalizedValue,
} from "@workspace/console/components/shared"
import { AdminAiComposeDialog } from "@/components/admin/ai-compose-dialog"
import { CollectionAiFillWizard } from "@/components/admin/collection-ai-fill-wizard"
import { routing } from "@workspace/auth/i18n/routing"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { parseEmailTemplate } from "@workspace/ui/lib/email-template"

const HugerteEditor = dynamic(
  () => import("@workspace/ui/components/hugerte-editor"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center rounded-xl border bg-muted/30">
        <HugeiconsIcon
          icon={Loading03Icon}
          strokeWidth={2}
          className="size-5 animate-spin text-muted-foreground"
        />
      </div>
    ),
  },
)
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import { confirm } from "@workspace/console/stores/confirm"
import { cn } from "@workspace/ui/lib/utils"

type LocalizedString = Record<string, string>

const CATEGORIES = [
  "otp",
  "verification",
  "password-reset",
  "welcome",
  "newsletter",
  "transactional",
  "billing",
  "marketing",
  "notification",
  "other",
] as const

type Category = (typeof CATEGORIES)[number]

/** Extracts variable names — hem scalar `{var}` hem section `{#name}...{/name}`
 *  isimlerini tek listede döndürür. UI sadece audit için kullanır. */
function extractVariableNames(str: string): string[] {
  const parsed = parseEmailTemplate(str)
  return [...parsed.scalars, ...parsed.sections.map((s) => s.name)]
}

const PLACEHOLDER_TINTS: Record<string, [string, string]> = {
  otp: ["#a78bfa", "#7c3aed"],
  verification: ["#60a5fa", "#2563eb"],
  "password-reset": ["#fbbf24", "#d97706"],
  welcome: ["#34d399", "#059669"],
  newsletter: ["#f472b6", "#db2777"],
  transactional: ["#22d3ee", "#0891b2"],
  billing: ["#fb923c", "#ea580c"],
  marketing: ["#e879f9", "#c026d7"],
  notification: ["#38bdf8", "#0284c7"],
  other: ["#a1a1aa", "#52525b"],
}

/**
 * html-to-image fail olunca üretilen fallback. Template adı + kategori
 * tint'iyle 600×800 SVG kart, sonra canvas üzerinden PNG blob.
 * Kullanıcı boş thumbnail yerine en azından okunaklı bir kart görür.
 */
async function buildPlaceholderThumbnailBlob(input: {
  title: string
  category: Category
}): Promise<Blob | null> {
  const [light, dark] =
    PLACEHOLDER_TINTS[input.category] ?? PLACEHOLDER_TINTS.other
  const safeTitle = (input.title || "Template")
    .replace(/[<&>]/g, " ")
    .slice(0, 64)

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${light}"/>
      <stop offset="100%" stop-color="${dark}"/>
    </linearGradient>
  </defs>
  <rect width="600" height="800" fill="url(#g)"/>
  <text x="300" y="380" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="36" font-weight="600" fill="rgba(255,255,255,0.95)">${safeTitle}</text>
  <text x="300" y="420" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="16" font-weight="500" fill="rgba(255,255,255,0.7)" letter-spacing="2">${input.category.toUpperCase()}</text>
</svg>`

  return new Promise<Blob | null>((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = 600
      canvas.height = 800
      const ctx = canvas.getContext("2d")
      if (!ctx) return resolve(null)
      ctx.drawImage(img, 0, 0)
      canvas.toBlob((b) => resolve(b), "image/png")
    }
    img.onerror = () => resolve(null)
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
  })
}

interface SystemTemplate {
  id: string
  key: string
  collectionId: string | null
  name: LocalizedString
  description: LocalizedString
  category: Category
  subject: LocalizedString
  htmlBody: LocalizedString
  variables: string[]
  thumbnailUrl: string | null
  isPublic: boolean
  order: number
  createdAt: string
}

interface TemplateCollection {
  id: string
  key: string
  name: LocalizedString
  description: LocalizedString
  coverUrl: string | null
  isPublic: boolean
  order: number
}

const CATEGORY_COLORS: Record<Category, string> = {
  otp: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  verification: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  "password-reset": "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  welcome: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  newsletter: "bg-pink-500/10 text-pink-700 dark:text-pink-300",
  transactional: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  billing: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  marketing: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
  notification: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  other: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
}

/**
 * Stable, repeatable color palette for collection chips. Hash the
 * collection key so the same collection always picks the same tone
 * across reloads — a slug change picks a new color, which is fine.
 */
const COLLECTION_TONES = [
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

function collectionToneFor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0
  }
  return COLLECTION_TONES[Math.abs(h) % COLLECTION_TONES.length]!
}

/**
 * Pill-shaped chip used for both top-level filters: collection chips
 * (with optional edit/delete affordances) and category chips. Click
 * on the chip body fires `onClick`; nested action buttons stop their
 * own propagation so they never fire a stray filter change.
 */
function CollectionChip({
  label,
  count,
  active,
  hidden,
  tone,
  onClick,
  onEdit,
  onDelete,
  onAiFill,
}: {
  label: string
  count: number
  active: boolean
  hidden?: boolean
  /** Optional tonal class — picked from `COLLECTION_TONES` for real
   *  collections so each chip has a consistent identity color. */
  tone?: string
  onClick: () => void
  onEdit?: () => void
  onDelete?: () => void
  onAiFill?: () => void
}) {
  return (
    <div
      className={cn(
        "group relative flex shrink-0 items-center gap-1.5 overflow-hidden rounded-full border pl-3 pr-2 py-1 text-sm transition-colors",
        active
          ? "border-primary/60 bg-primary text-primary-foreground"
          : tone
            ? cn("border-transparent hover:brightness-110", tone)
            : "border-border bg-muted/30 hover:bg-muted",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1.5"
      >
        <span className="font-medium">{label}</span>
        <span
          className={cn(
            "tabular-nums text-[10.5px]",
            active
              ? "text-primary-foreground/85"
              : tone
                ? "opacity-70"
                : "text-muted-foreground",
          )}
        >
          {count}
        </span>
        {hidden ? (
          <span
            className={cn(
              "rounded-md border px-1 text-[9.5px] uppercase tracking-wide",
              active
                ? "border-primary-foreground/30 text-primary-foreground/85"
                : tone
                  ? "border-current/30 opacity-70"
                  : "border-border text-muted-foreground",
            )}
          >
            hidden
          </span>
        ) : null}
      </button>
      {onAiFill ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onAiFill()
          }}
          className={cn(
            "inline-flex size-5 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100",
            active
              ? "text-primary-foreground/80 hover:bg-primary-foreground/15"
              : "text-muted-foreground hover:bg-foreground/10",
          )}
          title="AI fill"
        >
          <HugeiconsIcon
            icon={AiBrain01Icon}
            strokeWidth={2}
            className="size-3"
          />
        </button>
      ) : null}
      {onEdit ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          className={cn(
            "inline-flex size-5 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100",
            active
              ? "text-primary-foreground/80 hover:bg-primary-foreground/15"
              : "text-muted-foreground hover:bg-foreground/10",
          )}
          title="Edit"
        >
          <HugeiconsIcon
            icon={PencilEdit01Icon}
            strokeWidth={2}
            className="size-3"
          />
        </button>
      ) : null}
      {onDelete ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className={cn(
            "inline-flex size-5 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100",
            active
              ? "text-primary-foreground/80 hover:bg-primary-foreground/15"
              : "text-muted-foreground hover:bg-foreground/10",
          )}
          title="Delete"
        >
          <HugeiconsIcon
            icon={Delete02Icon}
            strokeWidth={2}
            className="size-3"
          />
        </button>
      ) : null}
    </div>
  )
}

/**
 * Compact category filter pill — used in the horizontally scrolling
 * category bar. Counts come from the active-collection scope so the
 * user always sees how many templates a tap will surface.
 */
function CategoryChip({
  label,
  count,
  active,
  tone,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  tone?: string
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
          : cn(
              "border-border bg-card hover:bg-muted",
              !tone && "text-foreground",
              tone,
            ),
      )}
    >
      <span className="font-medium">{label}</span>
      <span
        className={cn(
          "tabular-nums text-[10px]",
          active ? "text-primary-foreground/80" : "text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  )
}

export function TemplateLibraryContent() {
  const t = useTranslations("templateLibrary")
  const [items, setItems] = useState<SystemTemplate[]>([])
  const [collections, setCollections] = useState<TemplateCollection[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<SystemTemplate | null>(null)
  const [filterCategory, setFilterCategory] = useState<Category | "all">("all")
  const [filterCollection, setFilterCollection] = useState<string>("all")
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false)
  const [editingCollection, setEditingCollection] =
    useState<TemplateCollection | null>(null)
  // AI fill wizard — null = closed; setting opens the wizard for the
  // chosen collection. Refresh runs once the wizard reports completion
  // so the just-generated templates show up in the grid.
  const [aiFillCollection, setAiFillCollection] =
    useState<TemplateCollection | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [tplRes, colRes] = await Promise.all([
        fetch("/api/admin/template-library"),
        fetch("/api/admin/template-collections"),
      ])
      const tplJson = await tplRes.json()
      const colJson = await colRes.json()
      if (tplRes.ok) setItems(tplJson.data)
      if (colRes.ok) setCollections(colJson.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function removeCollection(c: TemplateCollection) {
    const ok = await confirm({
      title: t("deleteCollectionTitle"),
      description: t("deleteCollectionDesc", { key: c.key }),
      confirmText: t("delete"),
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/admin/template-collections/${c.id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error()
      toast.success(t("collectionDeleted"))
      refresh()
    } catch {
      toast.error(t("deleteFailed"))
    }
  }

  async function remove(item: SystemTemplate) {
    const ok = await confirm({
      title: t("deleteTitle"),
      description: t("deleteDesc", { key: item.key }),
      confirmText: t("delete"),
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/admin/template-library/${item.id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error()
      toast.success(t("deleted"))
      refresh()
    } catch {
      toast.error(t("deleteFailed"))
    }
  }

  async function togglePublic(item: SystemTemplate) {
    try {
      const res = await fetch(`/api/admin/template-library/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !item.isPublic }),
      })
      if (!res.ok) throw new Error()
      refresh()
    } catch {
      toast.error(t("updateFailed"))
    }
  }

  // Items pre-filtered by the active collection. Pulled out so the
  // category buttons can show *per-collection* counts (e.g. "OTP (3)"
  // really means "3 OTP templates within the selected collection")
  // rather than a misleading global total.
  const collectionScopedItems = useMemo(() => {
    if (filterCollection === "all") return items
    if (filterCollection === "standalone")
      return items.filter((i) => !i.collectionId)
    return items.filter((i) => i.collectionId === filterCollection)
  }, [items, filterCollection])

  // Per-category counts inside the active collection scope. The "all"
  // bucket is always the scope total — clicking it just clears the
  // category filter, not the collection filter.
  const categoryCounts = useMemo(() => {
    const map = new Map<Category | "all", number>()
    map.set("all", collectionScopedItems.length)
    for (const c of CATEGORIES) map.set(c, 0)
    for (const it of collectionScopedItems) {
      map.set(it.category, (map.get(it.category) ?? 0) + 1)
    }
    return map
  }, [collectionScopedItems])

  // Per-collection totals — drives the chip-bar counters at the top.
  const collectionCounts = useMemo(() => {
    const map = new Map<string, number>()
    map.set("all", items.length)
    map.set("standalone", items.filter((i) => !i.collectionId).length)
    for (const c of collections) {
      map.set(c.id, items.filter((it) => it.collectionId === c.id).length)
    }
    return map
  }, [items, collections])

  const visibleItems = useMemo(
    () =>
      filterCategory === "all"
        ? collectionScopedItems
        : collectionScopedItems.filter((i) => i.category === filterCategory),
    [collectionScopedItems, filterCategory],
  )

  // Infinite scroll — render in chunks so a thousand-template library
  // doesn't paint a thousand cards on first frame. Sentinel div at
  // the end of the grid bumps the visible window by `PAGE_SIZE` when
  // it scrolls into view; reset whenever the filter shape changes so
  // the user always starts at the top of the new result set.
  const PAGE_SIZE = 60
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [filterCategory, filterCollection])
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    if (visibleCount >= visibleItems.length) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((n) => Math.min(n + PAGE_SIZE, visibleItems.length))
        }
      },
      { rootMargin: "600px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visibleCount, visibleItems.length])

  const renderedItems = useMemo(
    () => visibleItems.slice(0, visibleCount),
    [visibleItems, visibleCount],
  )

  // View mode — three options: dense grid (4-up), wider grid (5-up
  // for very wide displays), and Pinterest-style masonry. Persisted
  // to localStorage so the admin's preference sticks across reloads.
  const VIEW_MODE_KEY = "sentroy.template-library.viewMode"
  const [viewMode, setViewMode] = useState<"grid-4" | "grid-5" | "masonry">(
    "grid-4",
  )
  useEffect(() => {
    const saved =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(VIEW_MODE_KEY)
    if (saved === "grid-4" || saved === "grid-5" || saved === "masonry") {
      setViewMode(saved)
    }
  }, [])
  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(VIEW_MODE_KEY, viewMode)
  }, [viewMode])

  // FAB collapse on scroll — once the user has scrolled past the
  // header the floating "New template" button drops its label and
  // shrinks to an icon-only disc. Threshold is small (80px) so the
  // collapse fires roughly when the page header leaves view.
  const [pageScrolled, setPageScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => {
      setPageScrolled(window.scrollY > 80)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <PageTransition className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div>
            <CardTitle className="text-base">{t("templatesTitle")}</CardTitle>
            <CardDescription>{t("templatesDesc")}</CardDescription>
          </div>

          {/* Collection bar — chip strip + add button as siblings in
              a flex row. The strip uses `flex-1 min-w-0 overflow-x-auto`
              so it only takes the available width and scrolls inside
              its own bounds; without `min-w-0` flex's auto-min would
              let the chips push the parent wider than the card. The
              add button sits next to it as a `shrink-0` sibling, no
              absolute positioning needed. */}
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
              <CollectionChip
                label={t("allCollections")}
                count={collectionCounts.get("all") ?? 0}
                active={filterCollection === "all"}
                onClick={() => setFilterCollection("all")}
              />
              {(collectionCounts.get("standalone") ?? 0) > 0 ? (
                <CollectionChip
                  label={t("standaloneOnly")}
                  count={collectionCounts.get("standalone") ?? 0}
                  active={filterCollection === "standalone"}
                  onClick={() => setFilterCollection("standalone")}
                />
              ) : null}
              {collections.map((c) => {
                const count = collectionCounts.get(c.id) ?? 0
                const active = filterCollection === c.id
                return (
                  <CollectionChip
                    key={c.id}
                    label={c.name.en || c.key}
                    count={count}
                    active={active}
                    hidden={!c.isPublic}
                    tone={collectionToneFor(c.id || c.key)}
                    onClick={() => setFilterCollection(c.id)}
                    onAiFill={() => setAiFillCollection(c)}
                    onEdit={() => {
                      setEditingCollection(c)
                      setCollectionDialogOpen(true)
                    }}
                    onDelete={() => removeCollection(c)}
                  />
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingCollection(null)
                setCollectionDialogOpen(true)
              }}
              title={t("newCollection")}
              aria-label={t("newCollection")}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
            >
              <HugeiconsIcon
                icon={PlusSignIcon}
                strokeWidth={2}
                className="size-4"
              />
            </button>
          </div>

          {/* Horizontally scrolling category bar + view-mode toggle.
              `min-w-0` on the scrolling row stops chip overflow from
              dragging the toggle out of view. */}
          <div className="flex items-stretch gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
              <CategoryChip
                label={t("allCategories")}
                count={categoryCounts.get("all") ?? 0}
                active={filterCategory === "all"}
                onClick={() => setFilterCategory("all")}
              />
              {CATEGORIES.map((c) => (
                <CategoryChip
                  key={c}
                  label={t(`categories.${c}`)}
                  count={categoryCounts.get(c) ?? 0}
                  active={filterCategory === c}
                  tone={
                    filterCategory === c
                      ? undefined
                      : (CATEGORY_COLORS[c] ?? undefined)
                  }
                  onClick={() => setFilterCategory(c)}
                />
              ))}
            </div>

            {/* View mode toggle — three states: dense grid, wide
                5-column grid (only meaningful on 2xl+), Pinterest
                masonry. Hidden on small viewports because grid-5 and
                masonry both look the same as grid-4 below md. */}
            <div className="hidden shrink-0 items-center gap-0.5 self-start rounded-full border bg-muted/40 p-0.5 md:flex">
              {(
                [
                  { value: "grid-4", icon: Layout01Icon, label: t("viewGrid4") },
                  { value: "grid-5", icon: GridViewIcon, label: t("viewGrid5") },
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
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-32 w-full rounded-xl" />
          ) : visibleItems.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              {t("empty")}
            </div>
          ) : (
            <>
              {(() => {
                // Card body is identical across grid/masonry; only the
                // wrapper differs. Inlining as a closure keeps the
                // closure scope (setFilterCategory, togglePublic, etc.)
                // in reach without prop-drilling a separate component.
                const renderCard = (
                  item: SystemTemplate,
                  masonry: boolean,
                ) => (
                  <div className="flex flex-col gap-3 overflow-hidden rounded-xl border bg-card transition-colors hover:border-foreground/20">
                    <div
                      className={cn(
                        "overflow-hidden bg-muted/40",
                        // Grid mode pins the thumbnail to a 3:4 frame
                        // so the row heights match. Masonry lets the
                        // image's intrinsic ratio set its height —
                        // that's the whole point of Pinterest layout.
                        !masonry && "aspect-[3/4]",
                      )}
                    >
                      {item.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.thumbnailUrl}
                          alt={item.name.en || item.key}
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
                    </div>
                    <div className="flex flex-col gap-2 px-4 pb-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-sm font-medium">
                            {item.name.en || item.key}
                          </span>
                          <code className="truncate font-mono text-[10px] text-muted-foreground">
                            {item.key}
                          </code>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFilterCategory(item.category)}
                          title={t("filterByCategory", {
                            category: t(`categories.${item.category}`),
                          })}
                          className={cn(
                            "shrink-0 rounded-full border border-transparent px-2 py-0.5 text-[10px] capitalize transition-colors",
                            CATEGORY_COLORS[item.category],
                            filterCategory === item.category &&
                              "ring-1 ring-primary/40",
                            "hover:brightness-110",
                          )}
                        >
                          {t(`categories.${item.category}`)}
                        </button>
                      </div>
                      {item.collectionId && (
                        <button
                          type="button"
                          onClick={() =>
                            setFilterCollection(item.collectionId!)
                          }
                          className="flex items-center gap-1.5 self-start text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <span className="size-1.5 rounded-full bg-primary/60" />
                          {collections.find(
                            (c) => c.id === item.collectionId,
                          )?.name.en ||
                            collections.find(
                              (c) => c.id === item.collectionId,
                            )?.key ||
                            item.collectionId}
                        </button>
                      )}
                      {item.description.en && (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {item.description.en}
                        </p>
                      )}
                      <div className="mt-1 flex items-center justify-between border-t pt-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={item.isPublic}
                            onCheckedChange={() => togglePublic(item)}
                            aria-label="Public"
                          />
                          <span className="text-xs text-muted-foreground">
                            {item.isPublic ? t("public") : t("private")}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setEditing(item)}
                          >
                            <HugeiconsIcon
                              icon={PencilEdit01Icon}
                              strokeWidth={2}
                              className="size-4"
                            />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => remove(item)}
                          >
                            <HugeiconsIcon
                              icon={Delete02Icon}
                              strokeWidth={2}
                              className="size-4"
                            />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )

                if (viewMode === "masonry") {
                  // CSS columns — Pinterest-style top-to-bottom
                  // column-flow. Each card is `break-inside-avoid` so
                  // browsers never split a card across columns.
                  // Framer's layout animation can't run here (the
                  // layout is column-flow, not absolute positioning),
                  // so we drop the AnimatePresence wrapper in this
                  // branch and accept snap-on-filter changes — the
                  // masonry geometry shifts anyway, animation would
                  // look weird.
                  return (
                    <div className="gap-3 sm:columns-2 md:columns-3 xl:columns-4 2xl:columns-5 [column-fill:_balance]">
                      {renderedItems.map((item) => (
                        <div
                          key={item.id}
                          className="mb-3 break-inside-avoid"
                        >
                          {renderCard(item, true)}
                        </div>
                      ))}
                    </div>
                  )
                }

                const gridClass =
                  viewMode === "grid-5"
                    ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5"
                    : "grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
                return (
                  <LayoutGroup>
                    <div className={gridClass}>
                      <AnimatePresence mode="popLayout" initial={false}>
                        {renderedItems.map((item) => (
                          <motion.div
                            key={item.id}
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
                            {renderCard(item, false)}
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </LayoutGroup>
                )
              })()}
              {/* Infinite-scroll sentinel — appears below the rendered
                  chunk while more items remain. The IntersectionObserver
                  in the parent component bumps `visibleCount` when this
                  enters the viewport (or 600px before, via rootMargin).
                  A skeleton row hints at the upcoming chunk. */}
              {visibleCount < visibleItems.length ? (
                <div ref={sentinelRef} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {Array.from({
                    length: Math.min(
                      4,
                      visibleItems.length - visibleCount,
                    ),
                  }).map((_, i) => (
                    <Skeleton
                      key={i}
                      className="h-[420px] w-full rounded-xl"
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-4 text-center text-[11px] text-muted-foreground">
                  {t("totalCount", { count: visibleItems.length })}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <TemplateEditDialog
        open={creating || !!editing}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false)
            setEditing(null)
          }
        }}
        template={editing}
        collections={collections}
        onSaved={() => {
          setCreating(false)
          setEditing(null)
          refresh()
        }}
      />

      <CollectionEditDialog
        open={collectionDialogOpen}
        onOpenChange={(o) => {
          if (!o) {
            setCollectionDialogOpen(false)
            setEditingCollection(null)
          }
        }}
        collection={editingCollection}
        onSaved={() => {
          setCollectionDialogOpen(false)
          setEditingCollection(null)
          refresh()
        }}
      />

      <CollectionAiFillWizard
        open={!!aiFillCollection}
        onOpenChange={(o) => {
          if (!o) setAiFillCollection(null)
        }}
        collection={aiFillCollection}
        onCompleted={refresh}
      />

      {/* Floating action — sticks to the bottom-right of the viewport
          and collapses to an icon-only disc once the user has
          scrolled past the header. The transition is keyed on width
          so the label slides out instead of popping. */}
      <button
        type="button"
        onClick={() => setCreating(true)}
        title={t("newTemplate")}
        aria-label={t("newTemplate")}
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
          {t("newTemplate")}
        </span>
      </button>
    </PageTransition>
  )
}

function TemplateEditDialog({
  open,
  onOpenChange,
  template,
  collections,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: SystemTemplate | null
  collections: TemplateCollection[]
  onSaved: () => void
}) {
  const t = useTranslations("templateLibrary")
  const isEdit = !!template
  const [key, setKey] = useState("")
  const [name, setName] = useState<LocalizedString>({ en: "", tr: "" })
  const [description, setDescription] = useState<LocalizedString>({ en: "", tr: "" })
  const [category, setCategory] = useState<Category>("transactional")
  const [subject, setSubject] = useState<LocalizedString>({ en: "", tr: "" })
  const [htmlBody, setHtmlBody] = useState<LocalizedString>({ en: "", tr: "" })
  // Üst-seviye locale tab — name/description/subject/htmlBody hepsi bu
  // dile göre input render eder. Per-field tab'a göre çok daha temiz UX.
  const [activeLang, setActiveLang] = useState<string>(routing.defaultLocale)
  const [isPublic, setIsPublic] = useState(true)
  const [order, setOrder] = useState(0)
  const [collectionId, setCollectionId] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const backfillAttemptedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (open) {
      setKey(template?.key ?? "")
      setName(template?.name ?? { en: "", tr: "" })
      setDescription(template?.description ?? { en: "", tr: "" })
      setCategory(template?.category ?? "transactional")
      setSubject(template?.subject ?? { en: "", tr: "" })
      const initialBody: LocalizedString = {}
      for (const l of routing.locales) {
        initialBody[l] = template?.htmlBody?.[l] ?? ""
      }
      setHtmlBody(initialBody)
      setActiveLang(routing.defaultLocale)
      setIsPublic(template?.isPublic ?? true)
      setOrder(template?.order ?? 0)
      setCollectionId(template?.collectionId ?? "")
    }
  }, [open, template])

  // Subject + body içindeki {var}/{{var}} placeholder'larından otomatik
  // türetilir — admin'in elle CSV girmesine gerek yok, mail editöründeki
  // pattern ile aynı.
  const variables = useMemo(() => {
    const all = new Set<string>()
    for (const v of Object.values(subject)) {
      extractVariableNames(v || "").forEach((n) => all.add(n))
    }
    for (const v of Object.values(htmlBody)) {
      extractVariableNames(v || "").forEach((n) => all.add(n))
    }
    return Array.from(all)
  }, [subject, htmlBody])

  // Hidden iframe — html-to-image snapshot bunun içinden alınır.
  const previewFrameRef = useRef<HTMLIFrameElement>(null)

  /**
   * Hidden iframe'e htmlBody'i basıp PNG snapshot al, thumbnail endpoint'ine
   * POST et. Yeni create için handleSave sonrası, edit için open-time backfill
   * tarafından çağrılır. Cosmetic — fail save UX'ini etkilemez.
   *
   * Image yüklemeyi beklemek kritik: doc.write sync ama içerideki <img>'ler
   * async. Bekle yoksa yarım/boş canvas elde ederiz (özellikle yeni create'de
   * cache-cold image'larla).
   */
  async function captureAndUploadThumbnail(templateId: string) {
    const iframe = previewFrameRef.current
    if (!iframe) {
      console.warn("[template-library] iframe ref missing — skipping snapshot")
      toast.warning("Thumbnail capture: iframe ref missing")
      return
    }
    const doc = iframe.contentDocument
    if (!doc) {
      console.warn("[template-library] iframe contentDocument missing")
      toast.warning("Thumbnail capture: iframe document missing")
      return
    }

    const html =
      htmlBody[routing.defaultLocale]?.trim() ||
      Object.values(htmlBody).find((v) => v?.trim())?.trim() ||
      ""
    if (!html) {
      console.warn("[template-library] empty html — skipping snapshot")
      return
    }

    // Kullanıcının girdiği HTML zaten komple bir document ise nested wrap'leme
    // (outer body height 0 oluyordu, snapshot boş çıkıyordu). Fragment ise
    // sarmala — yazı tipi/arka plan default'ları tutarlı kalsın.
    // Sanitize: <script>, <iframe>, <object>, <embed>, on*= ve javascript:
    // schemeleri strip — iframe sandbox altında zaten çalışmazlar; nested
    // iframe Hugerte'nin sandbox_iframes default'u nedeniyle "Blocked
    // script execution" hatası üretiyordu.
    const sanitized = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
      .replace(/<iframe\b[^>]*\/?>/gi, "")
      .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
      .replace(/<embed\b[^>]*\/?>/gi, "")
      .replace(/<frame\b[^>]*\/?>/gi, "")
      .replace(/<frameset\b[^<]*(?:(?!<\/frameset>)<[^<]*)*<\/frameset>/gi, "")
      .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
      .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
      .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
      .replace(/javascript:/gi, "")
    const isFullDoc =
      /<\s*html[\s>]/i.test(sanitized) || /<!doctype/i.test(sanitized)
    const docHtml = isFullDoc
      ? sanitized
      : `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"></head><body style="margin:0;background:#fff;color:#111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${sanitized}</body></html>`
    doc.open()
    doc.write(docHtml)
    doc.close()

    // Image'ların yüklenmesini bekle — load veya error, hangisi önce gelirse.
    // 3s'lik per-image timeout fallback'i ile asılı kalmamayı garanti et.
    const imgs = Array.from(doc.images || [])
    await Promise.all(
      imgs.map((img) =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              const done = () => resolve()
              img.addEventListener("load", done, { once: true })
              img.addEventListener("error", done, { once: true })
              setTimeout(done, 3000)
            }),
      ),
    )

    // Layout settle — fonts/inline-style'ların oturması için kısa delay.
    await new Promise((r) => setTimeout(r, 200))

    // Body collapsed (height 0) ise capture anlamsız — boş PNG yüklemekten
    // kaçınalım, eski thumbnail (varsa) korunur.
    const bodyHeight = doc.body.scrollHeight
    const bodyWidth = doc.body.scrollWidth
    if (bodyHeight < 8) {
      console.warn(
        "[template-library] empty body — skipping snapshot",
        { bodyHeight, bodyWidth },
      )
      toast.warning("Thumbnail capture: body height = 0")
      return
    }

    // html-to-image, external resource'ları (Google Fonts, CSS link'ler,
    // CORS-tainted image'lar) inline etmeye çalışırken sık fail eder.
    // skipFonts + filter ile problematic node'ları atla; image fail'leri
    // için placeholder. Hala patlarsa SVG-based fallback kart üret.
    const PLACEHOLDER_IMG =
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj48cmVjdCB3aWR0aD0iODAiIGhlaWdodD0iODAiIGZpbGw9IiNmM2YzZjMiLz48dGV4dCB4PSI0MCIgeT0iNDQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtc2l6ZT0iMTAiIGZpbGw9IiM5OTkiPmltZzwvdGV4dD48L3N2Zz4="

    const captureFilter = (node: Node): boolean => {
      if (!(node instanceof Element)) return true
      const tag = node.tagName.toLowerCase()
      // External CSS link'ler — Google Fonts vs cors fail kaynağı
      if (tag === "link") {
        const rel = (node as HTMLLinkElement).rel?.toLowerCase()
        if (rel === "stylesheet" || rel === "preload") return false
      }
      if (tag === "script") return false
      return true
    }

    let blob: Blob | null = null
    let primaryErr: unknown = null
    try {
      blob = await htmlToImage.toBlob(doc.body, {
        backgroundColor: "#ffffff",
        pixelRatio: 1.5,
        cacheBust: true,
        width: bodyWidth || 600,
        height: bodyHeight,
        skipFonts: true,
        imagePlaceholder: PLACEHOLDER_IMG,
        filter: captureFilter,
      })
    } catch (err) {
      primaryErr = err
      console.warn("[template-library] htmlToImage primary failed:", err)
    }

    // Primary fail veya boş çıktı — basit SVG kart fallback'i. Kullanıcı
    // hiç değilse template adı/kategori ile bir görsel görsün, eski boş
    // kart yerine.
    if (!blob || blob.size < 256) {
      console.warn("[template-library] primary capture insufficient, falling back", {
        blobSize: blob?.size,
        primaryErr: primaryErr instanceof Error ? primaryErr.message : null,
      })
      blob = await buildPlaceholderThumbnailBlob({
        title:
          name[routing.defaultLocale] ||
          Object.values(name).find((v) => v?.trim()) ||
          key ||
          "Template",
        category,
      }).catch(() => null)
    }

    if (!blob || blob.size < 256) {
      toast.warning(
        `Thumbnail capture failed${
          primaryErr instanceof Error ? `: ${primaryErr.message}` : ""
        }`,
      )
      return
    }

    console.info("[template-library] uploading thumbnail", {
      templateId,
      blobSize: blob.size,
      bodyHeight,
      bodyWidth,
    })

    const form = new FormData()
    form.append("file", blob, `${templateId}.png`)
    try {
      const res = await fetch(
        `/api/admin/template-library/${templateId}/thumbnail`,
        { method: "POST", body: form },
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.warn("[template-library] thumbnail upload failed:", res.status, json)
        toast.warning(
          `Thumbnail upload failed (${res.status}): ${json?.error ?? "unknown"}`,
        )
        return
      }
      console.info("[template-library] thumbnail uploaded:", json?.data?.thumbnailUrl)
    } catch (err) {
      console.warn("[template-library] thumbnail upload network error:", err)
      toast.warning(
        `Thumbnail upload error: ${err instanceof Error ? err.message : "network"}`,
      )
    }
  }

  // Edit dialog açıldığında — eski/migrated template'lerde thumbnail eksikse
  // (save sırasında oluşturulamamış olanlar) açılış anında bir kez backfill
  // çağır. Sadece edit modunda anlamlı; create modunda template id yok.
  useEffect(() => {
    if (!open || !template) return
    if (template.thumbnailUrl) return
    if (backfillAttemptedRef.current.has(template.id)) return
    const hasBody =
      htmlBody[routing.defaultLocale]?.trim() ||
      Object.values(htmlBody).some((v) => v?.trim())
    if (!hasBody) return
    backfillAttemptedRef.current.add(template.id)
    const timer = setTimeout(() => {
      captureAndUploadThumbnail(template.id)
        .catch(() => {})
        .finally(() => onSaved())
    }, 500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template, htmlBody])

  async function handleSave() {
    if (!key.trim()) return toast.error(t("keyRequired"))
    if (!htmlBody[routing.defaultLocale]?.trim()) {
      return toast.error(t("htmlRequired"))
    }
    setSaving(true)
    try {
      // Boş locale'leri payload'dan at — en az bir dolu olduğunu yukarıda
      // garanti ettik.
      const cleanedBody: LocalizedString = {}
      for (const [l, v] of Object.entries(htmlBody)) {
        if (v?.trim()) cleanedBody[l] = v
      }
      const body = {
        key: key.trim(),
        name,
        description,
        category,
        subject,
        htmlBody: cleanedBody,
        variables,
        isPublic,
        order,
        collectionId: collectionId || null,
      }
      const res = await fetch(
        isEdit
          ? `/api/admin/template-library/${template!.id}`
          : "/api/admin/template-library",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      toast.success(isEdit ? t("updated") : t("created"))

      // Thumbnail snapshot — fire-and-forget, save success'inden sonra arka
      // planda çalışır. Refresh için onSaved iki kez tetiklenebilir
      // (kayıt geldikten sonra + thumbnail upload sonrası), basit tutmak
      // için tek refresh yeterli.
      const savedId = (json.data?.id as string | undefined) ?? template?.id
      if (savedId) {
        captureAndUploadThumbnail(savedId)
          .catch(() => {})
          .finally(() => onSaved())
      } else {
        onSaved()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Full-screen — şablon editörü ekranı tam kullanmalı; küçük modal'da
          rich-text editor + locale tab + variables paneli ezilmiş görünüyordu.
          Center positioning override edilir, rounded ve padding sıfırlanır. */}
      <DialogContent className="!max-w-none !w-screen !h-screen !top-0 !start-0 !translate-x-0 !translate-y-0 !rounded-none overflow-hidden p-0 gap-0 flex flex-col">
        <DialogHeader className="flex-row items-start justify-between gap-3 space-y-0 border-b px-6 py-4">
          <div className="flex flex-col gap-1">
            <DialogTitle>
              {isEdit ? t("editTitle") : t("newTemplate")}
            </DialogTitle>
            <DialogDescription>{t("dialogDesc")}</DialogDescription>
          </div>
          {/* AI generate — yalnızca create akışında gösterilir; edit'te
              kullanıcı zaten içerik üzerinde çalışıyor, AI üzerine yazmasın. */}
          {!isEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAiOpen(true)}
              disabled={saving}
              className={"mr-6"}
            >
              <HugeiconsIcon
                icon={AiBrain01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {t("aiGenerate")}
            </Button>
          )}
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("key")}</Label>
              <Input
                value={key}
                onChange={(e) => setKey((e.target as HTMLInputElement).value)}
                disabled={saving || isEdit}
                placeholder="otp-verification"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("category")}</Label>
              <Select
                value={category}
                onValueChange={(v) => v && setCategory(v as Category)}
                disabled={saving}
              >
                <SelectTrigger>
                  <span className="truncate capitalize">
                    {t(`categories.${category}`)}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`categories.${c}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("order")}</Label>
              <Input
                type="number"
                value={order}
                onChange={(e) => setOrder(Number((e.target as HTMLInputElement).value) || 0)}
                disabled={saving}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("collectionLabel")}</Label>
            <Select
              value={collectionId || "none"}
              onValueChange={(v) => setCollectionId(!v || v === "none" ? "" : v)}
              disabled={saving}
            >
              <SelectTrigger>
                <span className="truncate">
                  {collectionId
                    ? collections.find((c) => c.id === collectionId)?.name.en ||
                      collections.find((c) => c.id === collectionId)?.key ||
                      collectionId
                    : t("noCollection")}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("noCollection")}</SelectItem>
                {collections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name.en || c.key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Multi-item LocalizedField — tek tab strip, dört alanı (name,
              description, subject, htmlBody) aynı dil context'inde gösterir.
              Önceki sürümde manuel tab + 4 ayrı Input vardı; her dil
              değişiminde flat state'i map'lemek zorundaydık. Multi-item
              mode bunu LocalizedField içine kapsar, body için custom render
              ile HugerteEditor inject ederiz. */}
          <LocalizedField<"name" | "description" | "subject" | "htmlBody">
            value={{
              name: name as LocalizedValue,
              description: description as LocalizedValue,
              subject: subject as LocalizedValue,
              htmlBody: htmlBody as LocalizedValue,
            }}
            onChange={(
              next: Record<
                "name" | "description" | "subject" | "htmlBody",
                LocalizedValue
              >,
            ) => {
              setName(next.name as LocalizedString)
              setDescription(next.description as LocalizedString)
              setSubject(next.subject as LocalizedString)
              setHtmlBody(next.htmlBody as LocalizedString)
            }}
            defaultLocale={activeLang}
            onActiveChange={setActiveLang}
            disabled={saving}
            fields={[
              { name: "name", label: t("name") },
              { name: "description", label: t("formDescription") },
              { name: "subject", label: t("subject") },
              {
                name: "htmlBody",
                label: t("htmlBody"),
                render: ({ lang, value, onChange, disabled }) => (
                  <HugerteEditor
                    key={`hugerte-${lang}`}
                    initialValue={value}
                    onEditorChange={onChange}
                    height={400}
                    disabled={disabled}
                    showHtmlToggle
                  />
                ),
              },
            ]}
          />

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("variables")}</Label>
            {variables.length === 0 ? (
              <p className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                {t("variablesEmpty")}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {variables.map((v) => (
                  <code
                    key={v}
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]"
                  >
                    {`{${v}}`}
                  </code>
                ))}
              </div>
            )}
            <span className="text-[10px] text-muted-foreground">{t("variablesAutoHint")}</span>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label className="text-sm">{t("isPublic")}</Label>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && (
              <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" data-icon="inline-start" />
            )}
            {t("save")}
          </Button>
        </DialogFooter>

        {/* html-to-image snapshot için off-screen iframe — width sabit ki
            preview crop'u tutarlı olsun, hidden olmamalı (display:none
            html-to-image render'ı bozar), absolute pozisyonlu offscreen. */}
        <iframe
          ref={previewFrameRef}
          title="thumbnail-source"
          aria-hidden="true"
          tabIndex={-1}
          style={{
            position: "fixed",
            top: 0,
            left: -9999,
            width: 600,
            height: 800,
            border: 0,
            pointerEvents: "none",
          }}
        />
      </DialogContent>

      <AdminAiComposeDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        onApply={({ name: aiName, subject: aiSubject, body: aiBody }) => {
          // AI çıktısını editor state'ine merge et — kullanıcı sonradan
          // değiştirebilir; AI yalnızca dolduğu locale'leri ezer.
          setName((prev) => ({ ...prev, ...aiName }))
          setSubject((prev) => ({ ...prev, ...aiSubject }))
          setHtmlBody((prev) => ({ ...prev, ...aiBody }))
          const firstLocale = Object.keys(aiBody)[0]
          if (firstLocale) setActiveLang(firstLocale)
        }}
      />
    </Dialog>
  )
}

// ── Collection edit dialog ──────────────────────────────────────────────

function CollectionEditDialog({
  open,
  onOpenChange,
  collection,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  collection: TemplateCollection | null
  onSaved: () => void
}) {
  const t = useTranslations("templateLibrary")
  const isEdit = !!collection
  const [key, setKey] = useState("")
  const [name, setName] = useState<LocalizedString>({ en: "", tr: "" })
  const [description, setDescription] = useState<LocalizedString>({ en: "", tr: "" })
  const [coverUrl, setCoverUrl] = useState("")
  const [isPublic, setIsPublic] = useState(true)
  const [order, setOrder] = useState(0)
  const [activeLang, setActiveLang] = useState<string>(routing.defaultLocale)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setKey(collection?.key ?? "")
      setName(collection?.name ?? { en: "", tr: "" })
      setDescription(collection?.description ?? { en: "", tr: "" })
      setCoverUrl(collection?.coverUrl ?? "")
      setIsPublic(collection?.isPublic ?? true)
      setOrder(collection?.order ?? 0)
      setActiveLang(routing.defaultLocale)
    }
  }, [open, collection])

  async function handleSave() {
    if (!key.trim()) return toast.error(t("keyRequired"))
    setSaving(true)
    try {
      const body = {
        key: key.trim(),
        name,
        description,
        coverUrl: coverUrl.trim() || null,
        isPublic,
        order,
      }
      const res = await fetch(
        isEdit
          ? `/api/admin/template-collections/${collection!.id}`
          : "/api/admin/template-collections",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      toast.success(isEdit ? t("collectionUpdated") : t("collectionCreated"))
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("editCollection") : t("newCollection")}
          </DialogTitle>
          <DialogDescription>{t("collectionDialogDesc")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("key")}</Label>
              <Input
                value={key}
                onChange={(e) => setKey((e.target as HTMLInputElement).value)}
                disabled={saving || isEdit}
                placeholder="onboarding-suite"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("order")}</Label>
              <Input
                type="number"
                value={order}
                onChange={(e) => setOrder(Number((e.target as HTMLInputElement).value) || 0)}
                disabled={saving}
              />
            </div>
          </div>

          {/* Aynı locale tab pattern'i (template editor gibi) */}
          <div className="flex w-fit items-center gap-1 rounded-lg border bg-muted/30 p-1">
            {routing.locales.map((l) => {
              const filled = !!(name[l]?.trim() || description[l]?.trim())
              const isActive = activeLang === l
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => setActiveLang(l)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="uppercase">{l}</span>
                  {filled && <span className="size-1.5 rounded-full bg-emerald-500" />}
                </button>
              )
            })}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("name")}</Label>
            <Input
              value={name[activeLang] ?? ""}
              onChange={(e) =>
                setName({ ...name, [activeLang]: (e.target as HTMLInputElement).value })
              }
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("formDescription")}</Label>
            <Input
              value={description[activeLang] ?? ""}
              onChange={(e) =>
                setDescription({
                  ...description,
                  [activeLang]: (e.target as HTMLInputElement).value,
                })
              }
              disabled={saving}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("coverUrl")}</Label>
            <Input
              value={coverUrl}
              onChange={(e) => setCoverUrl((e.target as HTMLInputElement).value)}
              disabled={saving}
              placeholder="https://…"
            />
            <span className="text-[10px] text-muted-foreground">
              {t("coverUrlHint")}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label className="text-sm">{t("isPublic")}</Label>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && (
              <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" data-icon="inline-start" />
            )}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
