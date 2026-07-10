"use client"

import { useState, useEffect, useCallback } from "react"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  PlusSignIcon,
  Delete02Icon,
  PencilEdit01Icon,
  Loading03Icon,
  CameraAutomaticallyIcon,
  ArchiveIcon,
  Download04Icon,
  DragDropVerticalIcon,
} from "@hugeicons/core-free-icons"

import {
  PageTransition,
  LocalizedField,
} from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import { confirm } from "@workspace/console/stores/confirm"
import {
  APP_ICON_KEYS,
  SDK_EXAMPLE_KEYS,
} from "@/components/landing/landing-page"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import {
  type LandingSectionId,
  LANDING_SECTION_LABELS,
  normalizeLandingSectionOrder,
} from "@/lib/landing-sections"

// ── Types ─────────────────────────────────────────────────────────────────

interface Logo {
  id: string
  name: string
  imageUrl: string
  url: string | null
  order: number
}

type LocalizedString = Record<string, string>

interface Testimonial {
  id: string
  quote: LocalizedString
  name: string
  title: LocalizedString
  photoUrl: string | null
  rating: number | null
  order: number
}

interface Settings {
  trustMessage: LocalizedString
  pricingTitle: LocalizedString
  pricingSubtitle: LocalizedString
  showPricing: boolean
  showTestimonials: boolean
  showLogos: boolean
  showZSections: boolean
  showApps: boolean
  showMetrics: boolean
  sectionOrder: LandingSectionId[]
}

type SettingsToggleKey = Extract<keyof Settings, `show${string}`>

interface LandingApp {
  id: string
  key: string
  name: LocalizedString
  tagline: LocalizedString
  description: LocalizedString
  iconKey: string
  features: LocalizedString[]
  ctaUrl: string
  ctaLabel: LocalizedString
  sdkExampleKey: string | null
  order: number
  enabled: boolean
}

interface ZSection {
  id: string
  title: LocalizedString
  problem: LocalizedString
  solution: LocalizedString
  result: LocalizedString
  visual: string | null
  order: number
}

// ── Main ──────────────────────────────────────────────────────────────────

export function LandingAdminContent() {
  const t = useTranslations("admin")
  return (
    <PageTransition className="flex flex-1 flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("landing")}</h1>
      <Tabs defaultValue="settings" className="flex flex-col gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="apps">Apps</TabsTrigger>
          <TabsTrigger value="logos">Logos</TabsTrigger>
          <TabsTrigger value="zsections">Z-Sections</TabsTrigger>
          <TabsTrigger value="testimonials">Testimonials</TabsTrigger>
          <TabsTrigger value="presets">Presets</TabsTrigger>
        </TabsList>
        <TabsContent value="settings">
          <SettingsPanel />
        </TabsContent>
        <TabsContent value="apps">
          <AppsPanel />
        </TabsContent>
        <TabsContent value="logos">
          <LogosPanel />
        </TabsContent>
        <TabsContent value="zsections">
          <ZSectionsPanel />
        </TabsContent>
        <TabsContent value="testimonials">
          <TestimonialsPanel />
        </TabsContent>
        <TabsContent value="presets">
          <PresetsPanel />
        </TabsContent>
      </Tabs>
    </PageTransition>
  )
}

// ── Settings ──────────────────────────────────────────────────────────────

function SettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/landing/settings")
      const json = await res.json()
      if (res.ok) {
        setSettings({
          ...json.data,
          sectionOrder: normalizeLandingSectionOrder(json.data?.sectionOrder),
        })
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  async function save(patch: Partial<Settings>) {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/landing/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      setSettings({
        ...json.data,
        sectionOrder: normalizeLandingSectionOrder(json.data?.sectionOrder),
      })
      toast.success("Saved")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setSaving(false)
    }
  }

  function updateSectionOrder(next: LandingSectionId[]) {
    if (!settings) return
    setSettings({ ...settings, sectionOrder: next })
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!settings || !event.over) return

    const activeId = event.active.id.toString()
    const overId = event.over.id.toString()
    if (activeId === overId) return

    const current = normalizeLandingSectionOrder(settings.sectionOrder)
    const oldIndex = current.findIndex((id) => id === activeId)
    const newIndex = current.findIndex((id) => id === overId)
    if (oldIndex < 0 || newIndex < 0) return

    updateSectionOrder(arrayMove(current, oldIndex, newIndex))
  }

  function setToggle(key: SettingsToggleKey, value: boolean) {
    if (!settings) return
    setSettings({ ...settings, [key]: value })
  }

  if (loading || !settings) {
    return <Skeleton className="h-64 w-full rounded-xl" />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Landing Settings</CardTitle>
        <CardDescription>
          Control which sections appear on the public landing page.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <LocalizedField
          label="Localized landing copy"
          value={{
            trustMessage: settings.trustMessage || {},
            pricingTitle: settings.pricingTitle || {},
            pricingSubtitle: settings.pricingSubtitle || {},
          }}
          onChange={(
            v: Record<
              "trustMessage" | "pricingTitle" | "pricingSubtitle",
              LocalizedString
            >
          ) =>
            setSettings({
              ...settings,
              trustMessage: v.trustMessage,
              pricingTitle: v.pricingTitle,
              pricingSubtitle: v.pricingSubtitle,
            })
          }
          fields={[
            { name: "trustMessage", label: "Trust message (above logos)" },
            { name: "pricingTitle", label: "Pricing section title" },
            {
              name: "pricingSubtitle",
              label: "Pricing subtitle",
              multiline: true,
              rows: 2,
            },
          ]}
          disabled={saving}
        />

        <div className="flex flex-col gap-3">
          <div>
            <Label>Section order & visibility</Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Drag landing sections to change their public order.
            </p>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={normalizeLandingSectionOrder(settings.sectionOrder)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-2">
                {normalizeLandingSectionOrder(settings.sectionOrder).map(
                  (id) => {
                    const meta = LANDING_SECTION_LABELS[id]
                    const toggleKey = meta.toggleKey as
                      | SettingsToggleKey
                      | undefined
                    return (
                      <SectionOrderRow
                        key={id}
                        id={id}
                        label={meta.label}
                        description={meta.description}
                        checked={
                          toggleKey ? settings[toggleKey] !== false : true
                        }
                        canToggle={!!toggleKey}
                        disabled={saving}
                        onToggle={(checked) => {
                          if (toggleKey) setToggle(toggleKey, checked)
                        }}
                      />
                    )
                  }
                )}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => save(settings)} disabled={saving}>
            {saving && (
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="animate-spin"
                data-icon="inline-start"
              />
            )}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function SectionOrderRow({
  id,
  label,
  description,
  checked,
  canToggle,
  disabled,
  onToggle,
}: {
  id: LandingSectionId
  label: string
  description: string
  checked: boolean
  canToggle: boolean
  disabled?: boolean
  onToggle: (v: boolean) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-background p-3",
        isDragging && "relative z-20 shadow-lg"
      )}
    >
      <button
        type="button"
        aria-label={`Reorder ${label}`}
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          disabled && "cursor-not-allowed opacity-50",
          !disabled && (isDragging ? "cursor-grabbing" : "cursor-grab")
        )}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <HugeiconsIcon
          icon={DragDropVerticalIcon}
          strokeWidth={2}
          className="size-4"
        />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{description}</p>
      </div>
      {canToggle ? (
        <Switch
          checked={checked}
          onCheckedChange={onToggle}
          disabled={disabled}
        />
      ) : (
        <span className="shrink-0 rounded-md border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
          Always on
        </span>
      )}
    </div>
  )
}

// ── Logos ─────────────────────────────────────────────────────────────────

function LogosPanel() {
  const [logos, setLogos] = useState<Logo[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<Logo | null>(null)

  const fetchLogos = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/landing/logos")
      const json = await res.json()
      if (res.ok) setLogos(json.data || [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLogos()
  }, [fetchLogos])

  async function handleDelete(logo: Logo) {
    const ok = await confirm({
      title: "Delete logo?",
      description: logo.name,
      confirmText: "Delete",
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/admin/landing/logos/${logo.id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error()
      setLogos((prev) => prev.filter((l) => l.id !== logo.id))
      toast.success("Deleted")
    } catch {
      toast.error("Failed")
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Customer Logos</CardTitle>
          <CardDescription>
            Logos shown below the hero. Keep SVG or PNG with transparent
            background.
          </CardDescription>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setEditOpen(true)
          }}
        >
          <HugeiconsIcon
            icon={PlusSignIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Add
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : logos.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No logos yet.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {logos.map((logo) => (
              <div
                key={logo.id}
                className="group relative flex items-center gap-3 rounded-lg border bg-muted/20 p-3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logo.imageUrl}
                  alt={logo.name}
                  className="size-12 shrink-0 rounded bg-background object-contain p-1"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{logo.name}</p>
                  {logo.url && (
                    <p className="truncate text-xs text-muted-foreground">
                      {logo.url}
                    </p>
                  )}
                </div>
                <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      setEditing(logo)
                      setEditOpen(true)
                    }}
                  >
                    <HugeiconsIcon icon={PencilEdit01Icon} strokeWidth={2} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDelete(logo)}
                  >
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <LogoEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        logo={editing}
        onSaved={() => fetchLogos()}
      />
    </Card>
  )
}

function LogoEditDialog({
  open,
  onOpenChange,
  logo,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  logo: Logo | null
  onSaved: () => void
}) {
  const [name, setName] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [url, setUrl] = useState("")
  const [order, setOrder] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(logo?.name || "")
      setImageUrl(logo?.imageUrl || "")
      setUrl(logo?.url || "")
      setOrder(logo?.order ?? 0)
    }
  }, [open, logo])

  async function handleSave() {
    if (!name.trim() || !imageUrl.trim()) return
    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        imageUrl: imageUrl.trim(),
        url: url.trim() || null,
        order,
      }
      const res = await fetch(
        logo
          ? `/api/admin/landing/logos/${logo.id}`
          : "/api/admin/landing/logos",
        {
          method: logo ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      )
      if (!res.ok) throw new Error()
      toast.success("Saved")
      onSaved()
      onOpenChange(false)
    } catch {
      toast.error("Failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{logo ? "Edit logo" : "Add logo"}</DialogTitle>
          <DialogDescription>
            Customer/partner logo shown in the social proof bar.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName((e.target as HTMLInputElement).value)}
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Image URL (SVG or transparent PNG)</Label>
            <Input
              value={imageUrl}
              onChange={(e) =>
                setImageUrl((e.target as HTMLInputElement).value)
              }
              disabled={saving}
              placeholder="https://..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Link URL (optional)</Label>
            <Input
              value={url}
              onChange={(e) => setUrl((e.target as HTMLInputElement).value)}
              disabled={saving}
              placeholder="https://..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Sort order</Label>
            <Input
              type="number"
              value={order}
              onChange={(e) =>
                setOrder(Number((e.target as HTMLInputElement).value) || 0)
              }
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
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim() || !imageUrl.trim()}
          >
            {saving && (
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="animate-spin"
                data-icon="inline-start"
              />
            )}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Testimonials ──────────────────────────────────────────────────────────

function TestimonialsPanel() {
  const [items, setItems] = useState<Testimonial[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<Testimonial | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/landing/testimonials")
      const json = await res.json()
      if (res.ok) setItems(json.data || [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  async function handleDelete(item: Testimonial) {
    const ok = await confirm({
      title: "Delete testimonial?",
      description: item.name,
      confirmText: "Delete",
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/admin/landing/testimonials/${item.id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error()
      setItems((prev) => prev.filter((t) => t.id !== item.id))
      toast.success("Deleted")
    } catch {
      toast.error("Failed")
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Testimonials</CardTitle>
          <CardDescription>
            Customer quotes rendered in the social section.
          </CardDescription>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setEditOpen(true)
          }}
        >
          <HugeiconsIcon
            icon={PlusSignIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Add
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No testimonials yet.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <div key={item.id} className="group rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  {item.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.photoUrl}
                      alt={item.name}
                      className="size-10 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {item.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.title.en || Object.values(item.title)[0] || ""}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      &ldquo;
                      {item.quote.en || Object.values(item.quote)[0] || ""}
                      &rdquo;
                    </p>
                  </div>
                  <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setEditing(item)
                        setEditOpen(true)
                      }}
                    >
                      <HugeiconsIcon icon={PencilEdit01Icon} strokeWidth={2} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(item)}
                    >
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <TestimonialEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        item={editing}
        onSaved={() => fetchItems()}
      />
    </Card>
  )
}

function TestimonialEditDialog({
  open,
  onOpenChange,
  item,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  item: Testimonial | null
  onSaved: () => void
}) {
  const [name, setName] = useState("")
  const [photoUrl, setPhotoUrl] = useState("")
  const [rating, setRating] = useState<number | null>(null)
  const [order, setOrder] = useState(0)
  const [quote, setQuote] = useState<LocalizedString>({})
  const [title, setTitle] = useState<LocalizedString>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(item?.name || "")
      setPhotoUrl(item?.photoUrl || "")
      setRating(item?.rating ?? null)
      setOrder(item?.order ?? 0)
      setQuote(item?.quote || {})
      setTitle(item?.title || {})
    }
  }, [open, item])

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        quote,
        title,
        photoUrl: photoUrl.trim() || null,
        rating,
        order,
      }
      const res = await fetch(
        item
          ? `/api/admin/landing/testimonials/${item.id}`
          : "/api/admin/landing/testimonials",
        {
          method: item ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      )
      if (!res.ok) throw new Error()
      toast.success("Saved")
      onSaved()
      onOpenChange(false)
    } catch {
      toast.error("Failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {item ? "Edit testimonial" : "Add testimonial"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName((e.target as HTMLInputElement).value)}
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Photo URL (optional)</Label>
            <Input
              value={photoUrl}
              onChange={(e) =>
                setPhotoUrl((e.target as HTMLInputElement).value)
              }
              disabled={saving}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Rating (1-5)</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={rating ?? ""}
                onChange={(e) =>
                  setRating(
                    e.target.value
                      ? Number((e.target as HTMLInputElement).value)
                      : null
                  )
                }
                disabled={saving}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Sort order</Label>
              <Input
                type="number"
                value={order}
                onChange={(e) =>
                  setOrder(Number((e.target as HTMLInputElement).value) || 0)
                }
                disabled={saving}
              />
            </div>
          </div>
          <LocalizedField
            label="Localized testimonial copy"
            value={{ title, quote }}
            onChange={(v: Record<"title" | "quote", LocalizedString>) => {
              setTitle(v.title)
              setQuote(v.quote)
            }}
            fields={[
              { name: "title", label: "Title / Role" },
              { name: "quote", label: "Quote", multiline: true, rows: 3 },
            ]}
            disabled={saving}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && (
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="animate-spin"
                data-icon="inline-start"
              />
            )}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Z-Sections ────────────────────────────────────────────────────────────

function ZSectionsPanel() {
  const [items, setItems] = useState<ZSection[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<ZSection | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/landing/zsections")
      const json = await res.json()
      if (res.ok) setItems(json.data || [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  async function handleDelete(item: ZSection) {
    const ok = await confirm({
      title: "Delete section?",
      description: item.title.en || Object.values(item.title)[0] || "",
      confirmText: "Delete",
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/admin/landing/zsections/${item.id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error()
      setItems((prev) => prev.filter((z) => z.id !== item.id))
      toast.success("Deleted")
    } catch {
      toast.error("Failed")
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Z-Sections</CardTitle>
          <CardDescription>
            Problem &rarr; Solution &rarr; Result blocks rendered in alternating
            layout.
          </CardDescription>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setEditOpen(true)
          }}
        >
          <HugeiconsIcon
            icon={PlusSignIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Add
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No sections yet. Add the first problem/solution/result block.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item, idx) => (
              <div key={item.id} className="group rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                    {idx + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {item.title.en ||
                        Object.values(item.title)[0] ||
                        "(untitled)"}
                    </p>
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      <span className="text-red-500">P:</span>{" "}
                      {item.problem.en || Object.values(item.problem)[0] || ""}
                    </p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      <span className="text-blue-500">S:</span>{" "}
                      {item.solution.en ||
                        Object.values(item.solution)[0] ||
                        ""}
                    </p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      <span className="text-emerald-500">R:</span>{" "}
                      {item.result.en || Object.values(item.result)[0] || ""}
                    </p>
                  </div>
                  <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setEditing(item)
                        setEditOpen(true)
                      }}
                    >
                      <HugeiconsIcon icon={PencilEdit01Icon} strokeWidth={2} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(item)}
                    >
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <ZSectionEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        item={editing}
        onSaved={() => fetchItems()}
      />
    </Card>
  )
}

function ZSectionEditDialog({
  open,
  onOpenChange,
  item,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  item: ZSection | null
  onSaved: () => void
}) {
  const [title, setTitle] = useState<LocalizedString>({})
  const [problem, setProblem] = useState<LocalizedString>({})
  const [solution, setSolution] = useState<LocalizedString>({})
  const [resultField, setResultField] = useState<LocalizedString>({})
  const [visual, setVisual] = useState("")
  const [order, setOrder] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle(item?.title || {})
      setProblem(item?.problem || {})
      setSolution(item?.solution || {})
      setResultField(item?.result || {})
      setVisual(item?.visual || "")
      setOrder(item?.order ?? 0)
    }
  }, [open, item])

  async function handleSave() {
    setSaving(true)
    try {
      const body = {
        title,
        problem,
        solution,
        result: resultField,
        visual: visual.trim() || null,
        order,
      }
      const res = await fetch(
        item
          ? `/api/admin/landing/zsections/${item.id}`
          : "/api/admin/landing/zsections",
        {
          method: item ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      )
      if (!res.ok) throw new Error()
      toast.success("Saved")
      onSaved()
      onOpenChange(false)
    } catch {
      toast.error("Failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{item ? "Edit section" : "Add section"}</DialogTitle>
          <DialogDescription>
            Problem &rarr; Solution &rarr; Result block rendered with
            alternating layout on the landing page.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <LocalizedField
            label="Localized section copy"
            value={{ title, problem, solution, result: resultField }}
            onChange={(
              v: Record<
                "title" | "problem" | "solution" | "result",
                LocalizedString
              >
            ) => {
              setTitle(v.title)
              setProblem(v.problem)
              setSolution(v.solution)
              setResultField(v.result)
            }}
            fields={[
              { name: "title", label: "Title" },
              { name: "problem", label: "Problem", multiline: true, rows: 2 },
              { name: "solution", label: "Solution", multiline: true, rows: 2 },
              { name: "result", label: "Result", multiline: true, rows: 2 },
            ]}
            disabled={saving}
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>
                Visual URL{" "}
                <span className="ml-1 text-xs text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Input
                value={visual}
                onChange={(e) =>
                  setVisual((e.target as HTMLInputElement).value)
                }
                disabled={saving}
                placeholder="https://..."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Sort order</Label>
              <Input
                type="number"
                value={order}
                onChange={(e) =>
                  setOrder(Number((e.target as HTMLInputElement).value) || 0)
                }
                disabled={saving}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
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
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Apps ──────────────────────────────────────────────────────────────────

function AppsPanel() {
  const [items, setItems] = useState<LandingApp[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<LandingApp | null>(null)
  const [creating, setCreating] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/landing/apps")
      const json = await res.json()
      if (res.ok) setItems(json.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function remove(item: LandingApp) {
    const ok = await confirm({
      title: "Delete app?",
      description: `"${item.key}" landing'den kaldırılır. Tek dokunuşla geri eklenebilir.`,
      confirmText: "Delete",
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/admin/landing/apps/${item.id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error()
      toast.success("App deleted")
      refresh()
    } catch {
      toast.error("Delete failed")
    }
  }

  async function toggleEnabled(item: LandingApp) {
    try {
      const res = await fetch(`/api/admin/landing/apps/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !item.enabled }),
      })
      if (!res.ok) throw new Error()
      refresh()
    } catch {
      toast.error("Update failed")
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Apps</CardTitle>
          <CardDescription>
            Landing'de "Apps" bölümünde gösterilen platform ürünleri. Her app
            kendi subdomain'ine link verir, opsiyonel SDK örneği ile birlikte
            gelir.
          </CardDescription>
        </div>
        <Button onClick={() => setCreating(true)}>
          <HugeiconsIcon
            icon={PlusSignIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          New app
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No apps yet. Add the first one to populate the landing's Apps
            section.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                    {item.key}
                  </code>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">
                      {item.name.en || item.key}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {item.tagline.en}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    order {item.order}
                  </span>
                  <Switch
                    checked={item.enabled}
                    onCheckedChange={() => toggleEnabled(item)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
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
                    size="sm"
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
            ))}
          </div>
        )}
      </CardContent>

      <AppEditDialog
        open={creating || !!editing}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false)
            setEditing(null)
          }
        }}
        app={editing}
        onSaved={() => {
          setCreating(false)
          setEditing(null)
          refresh()
        }}
      />
    </Card>
  )
}

function AppEditDialog({
  open,
  onOpenChange,
  app,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  app: LandingApp | null
  onSaved: () => void
}) {
  const isEdit = !!app
  const [key, setKey] = useState("")
  const [name, setName] = useState<LocalizedString>({ en: "", tr: "" })
  const [tagline, setTagline] = useState<LocalizedString>({ en: "", tr: "" })
  const [description, setDescription] = useState<LocalizedString>({
    en: "",
    tr: "",
  })
  const [iconKey, setIconKey] = useState(APP_ICON_KEYS[0])
  const [features, setFeatures] = useState<LocalizedString[]>([])
  const [ctaUrl, setCtaUrl] = useState("")
  const [ctaLabel, setCtaLabel] = useState<LocalizedString>({ en: "", tr: "" })
  const [sdkExampleKey, setSdkExampleKey] = useState<string>("")
  const [order, setOrder] = useState(0)
  const [enabled, setEnabled] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setKey(app?.key ?? "")
      setName(app?.name ?? { en: "", tr: "" })
      setTagline(app?.tagline ?? { en: "", tr: "" })
      setDescription(app?.description ?? { en: "", tr: "" })
      setIconKey(app?.iconKey ?? APP_ICON_KEYS[0])
      setFeatures(app?.features ?? [])
      setCtaUrl(app?.ctaUrl ?? "")
      setCtaLabel(app?.ctaLabel ?? { en: "Open", tr: "Aç" })
      setSdkExampleKey(app?.sdkExampleKey ?? "")
      setOrder(app?.order ?? 0)
      setEnabled(app?.enabled ?? true)
    }
  }, [open, app])

  async function handleSave() {
    if (!key.trim()) return toast.error("Key is required")
    if (!ctaUrl.trim()) return toast.error("CTA URL is required")
    setSaving(true)
    try {
      const body = {
        key: key.trim(),
        name,
        tagline,
        description,
        iconKey,
        features,
        ctaUrl: ctaUrl.trim(),
        ctaLabel,
        sdkExampleKey: sdkExampleKey || null,
        order,
        enabled,
      }
      const res = await fetch(
        isEdit
          ? `/api/admin/landing/apps/${app!.id}`
          : "/api/admin/landing/apps",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      toast.success(isEdit ? "App updated" : "App created")
      onSaved()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setSaving(false)
    }
  }

  function updateFeature(idx: number, val: LocalizedString) {
    setFeatures(features.map((f, i) => (i === idx ? val : f)))
  }
  function removeFeature(idx: number) {
    setFeatures(features.filter((_, i) => i !== idx))
  }
  function addFeature() {
    setFeatures([...features, { en: "", tr: "" }])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit app" : "New app"}</DialogTitle>
          <DialogDescription>
            Public landing'in Apps bölümünde gösterilecek ürün kartı.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Key (slug)</Label>
              <Input
                value={key}
                onChange={(e) => setKey((e.target as HTMLInputElement).value)}
                disabled={saving || isEdit}
                placeholder="mail"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Sort order</Label>
              <Input
                type="number"
                value={order}
                onChange={(e) =>
                  setOrder(Number((e.target as HTMLInputElement).value) || 0)
                }
                disabled={saving}
              />
            </div>
          </div>

          <LocalizedField
            label="Localized app copy"
            value={{ name, tagline, description, ctaLabel }}
            onChange={(
              v: Record<
                "name" | "tagline" | "description" | "ctaLabel",
                LocalizedString
              >
            ) => {
              setName(v.name)
              setTagline(v.tagline)
              setDescription(v.description)
              setCtaLabel(v.ctaLabel)
            }}
            fields={[
              { name: "name", label: "Name" },
              { name: "tagline", label: "Tagline" },
              {
                name: "description",
                label: "Description",
                multiline: true,
                rows: 3,
              },
              { name: "ctaLabel", label: "CTA Label" },
            ]}
            disabled={saving}
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Icon</Label>
              <Select
                value={iconKey}
                onValueChange={(v) => v && setIconKey(v)}
                disabled={saving}
              >
                <SelectTrigger>
                  <span className="truncate">{iconKey}</span>
                </SelectTrigger>
                <SelectContent>
                  {APP_ICON_KEYS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>SDK example</Label>
              <Select
                value={sdkExampleKey || "none"}
                onValueChange={(v) =>
                  setSdkExampleKey(!v || v === "none" ? "" : v)
                }
                disabled={saving}
              >
                <SelectTrigger>
                  <span className="truncate">{sdkExampleKey || "None"}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {SDK_EXAMPLE_KEYS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>CTA URL</Label>
            <Input
              value={ctaUrl}
              onChange={(e) => setCtaUrl((e.target as HTMLInputElement).value)}
              disabled={saving}
              placeholder="https://mail.sentroy.com"
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Features</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={addFeature}
                disabled={saving}
              >
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  strokeWidth={2}
                  className="size-3.5"
                />
                Add
              </Button>
            </div>
            {features.length === 0 && (
              <p className="text-xs text-muted-foreground">No features yet.</p>
            )}
            {features.map((f, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 rounded-lg border p-3"
              >
                <div className="flex-1">
                  <LocalizedField
                    label={`#${idx + 1}`}
                    value={f}
                    onChange={(v) => updateFeature(idx, v)}
                    disabled={saving}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFeature(idx)}
                  disabled={saving}
                >
                  <HugeiconsIcon
                    icon={Delete02Icon}
                    strokeWidth={2}
                    className="size-4"
                  />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label>Enabled (visible on landing)</Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
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
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Presets ───────────────────────────────────────────────────────────────

interface LandingPreset {
  id: string
  name: string
  description: string | null
  isAutoBackup: boolean
  createdAt: string
}

function PresetsPanel() {
  const [items, setItems] = useState<LandingPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [showAuto, setShowAuto] = useState(false)
  const [savingDialog, setSavingDialog] = useState(false)
  const [applyingId, setApplyingId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/admin/landing/presets${showAuto ? "?include_auto=1" : ""}`
      )
      const json = await res.json()
      if (res.ok) setItems(json.data)
    } finally {
      setLoading(false)
    }
  }, [showAuto])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function apply(item: LandingPreset) {
    const ok = await confirm({
      title: `Apply "${item.name}"?`,
      description:
        "Bu preset'in snapshot'u tüm landing içeriğini (settings, apps, " +
        "z-sections, logos, testimonials) tamamen değiştirir. Mevcut state " +
        "auto-backup olarak saklanır, geri dönebilirsin.",
      confirmText: "Apply",
      destructive: true,
    })
    if (!ok) return

    setApplyingId(item.id)
    try {
      const res = await fetch(`/api/admin/landing/presets/${item.id}/apply`, {
        method: "POST",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Apply failed")
      toast.success(`Applied "${item.name}". Auto-backup saved.`)
      refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Apply failed")
    } finally {
      setApplyingId(null)
    }
  }

  async function remove(item: LandingPreset) {
    const ok = await confirm({
      title: "Delete preset?",
      description: `"${item.name}" snapshot kalıcı olarak silinir.`,
      confirmText: "Delete",
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/admin/landing/presets/${item.id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error()
      toast.success("Preset deleted")
      refresh()
    } catch {
      toast.error("Delete failed")
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Presets</CardTitle>
          <CardDescription>
            Mevcut landing yapısının snapshot'u. "Save current" ile bugünkü
            tasarımı dondur, sonra istediğin zaman "Apply" ile geri dön. Apply
            öncesi mevcut state otomatik auto-backup olur.
          </CardDescription>
        </div>
        <Button onClick={() => setSavingDialog(true)}>
          <HugeiconsIcon
            icon={CameraAutomaticallyIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Save current as preset
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-sm">
            <HugeiconsIcon
              icon={ArchiveIcon}
              strokeWidth={2}
              className="size-4"
            />
            <span>Show auto-backups</span>
            <span className="text-xs text-muted-foreground">
              (apply öncesi otomatik snapshot'lar)
            </span>
          </div>
          <Switch checked={showAuto} onCheckedChange={setShowAuto} />
        </div>

        {loading ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No presets yet. "Save current as preset" ile bugünkü landing'i
            dondur.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item) => {
              const created = new Date(item.createdAt)
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {item.name}
                      </span>
                      {item.isAutoBackup && (
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wider text-amber-700 uppercase dark:text-amber-400">
                          auto
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <span className="truncate text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {created.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => apply(item)}
                      disabled={applyingId !== null}
                    >
                      {applyingId === item.id ? (
                        <HugeiconsIcon
                          icon={Loading03Icon}
                          strokeWidth={2}
                          className="size-3.5 animate-spin"
                          data-icon="inline-start"
                        />
                      ) : (
                        <HugeiconsIcon
                          icon={Download04Icon}
                          strokeWidth={2}
                          className="size-3.5"
                          data-icon="inline-start"
                        />
                      )}
                      Apply
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
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
              )
            })}
          </div>
        )}
      </CardContent>

      <SavePresetDialog
        open={savingDialog}
        onOpenChange={setSavingDialog}
        onSaved={() => {
          setSavingDialog(false)
          refresh()
        }}
      />
    </Card>
  )
}

function SavePresetDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(`Snapshot ${new Date().toLocaleDateString()}`)
      setDescription("")
    }
  }, [open])

  async function handleSave() {
    if (!name.trim()) return toast.error("Name is required")
    setSaving(true)
    try {
      const res = await fetch("/api/admin/landing/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      toast.success("Preset saved")
      onSaved()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save current landing as preset</DialogTitle>
          <DialogDescription>
            Şu anki settings + apps + z-sections + logos + testimonials
            içeriklerinin tam snapshot'u alınır. Sonradan tek tıkla bu duruma
            geri dönebilirsin.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName((e.target as HTMLInputElement).value)}
              disabled={saving}
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Description (optional)</Label>
            <Input
              value={description}
              onChange={(e) =>
                setDescription((e.target as HTMLInputElement).value)
              }
              disabled={saving}
              placeholder="Q4 2026 launch design"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
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
            Save snapshot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
