"use client"

import { useState, useEffect, useCallback } from "react"
import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  PlusSignIcon,
  Edit02Icon,
  Delete02Icon,
  Loading03Icon,
  ViewIcon,
  ViewOffIcon,
} from "@hugeicons/core-free-icons"
import { routing } from "@workspace/auth/i18n/routing"

import { PageTransition, EmptyState, LocalizedField } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import { Badge } from "@workspace/ui/components/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@workspace/ui/components/table"

const HugerteEditor = dynamic(() => import("@workspace/ui/components/hugerte-editor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-xl border bg-muted/30">
      <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-5 animate-spin text-muted-foreground" />
    </div>
  ),
})

type LocalizedMap = Record<string, string>

interface StaticPage {
  id: string
  title: LocalizedMap | string
  slug: string
  content: LocalizedMap | string
  published: boolean
  order: number
  updatedAt: string
}

function toMap(val: LocalizedMap | string | undefined): LocalizedMap {
  if (!val) return {}
  if (typeof val === "string") return val ? { en: val } : {}
  return { ...val }
}

function resolveDisplay(val: LocalizedMap | string | undefined): string {
  if (!val) return ""
  if (typeof val === "string") return val
  return val.en || Object.values(val)[0] || ""
}

function slugifyTitle(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
}

export function PagesContent() {
  const t = useTranslations("admin")

  const [pages, setPages] = useState<StaticPage[]>([])
  const [loading, setLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPage, setEditingPage] = useState<StaticPage | null>(null)
  const [slug, setSlug] = useState("")
  const [slugTouched, setSlugTouched] = useState(false)
  const [published, setPublished] = useState(true)
  const [saving, setSaving] = useState(false)

  const [titles, setTitles] = useState<LocalizedMap>({})
  const [contents, setContents] = useState<LocalizedMap>({})

  const fetchPages = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/pages")
      const json = await res.json()
      if (res.ok) setPages(json.data || [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPages()
  }, [fetchPages])

  function openCreate() {
    setEditingPage(null)
    setSlug("")
    setSlugTouched(false)
    setPublished(true)
    setTitles({})
    setContents({})
    setDialogOpen(true)
  }

  function openEdit(page: StaticPage) {
    setEditingPage(page)
    setSlug(page.slug)
    setSlugTouched(true)
    setPublished(page.published)
    setTitles(toMap(page.title))
    setContents(toMap(page.content))
    setDialogOpen(true)
  }

  function handleTitlesChange(next: LocalizedMap) {
    setTitles(next)
    // Yeni sayfa olusturuluyorsa ve kullanici slug'i manuel degistirmediyse,
    // varsayilan dildeki baslikta slug'i otomatik turet.
    if (!editingPage && !slugTouched) {
      const defaultTitle = next[routing.defaultLocale]
      if (defaultTitle !== undefined) {
        setSlug(slugifyTitle(defaultTitle))
      }
    }
  }

  function hasContent(): boolean {
    return Object.keys(titles).some(
      (l) => titles[l]?.trim() && contents[l]?.trim(),
    )
  }

  async function handleSave() {
    if (!slug.trim() || !hasContent()) return
    setSaving(true)
    try {
      const isEdit = !!editingPage
      const url = isEdit ? `/api/pages/${editingPage!.slug}` : "/api/pages"
      const method = isEdit ? "PATCH" : "POST"

      const cleanTitles: LocalizedMap = {}
      const cleanContents: LocalizedMap = {}
      for (const l of routing.locales) {
        if (titles[l]?.trim()) cleanTitles[l] = titles[l].trim()
        if (contents[l]?.trim()) cleanContents[l] = contents[l]
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: cleanTitles,
          slug: slug.trim(),
          content: cleanContents,
          published,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to save")

      toast.success(isEdit ? "Page updated" : "Page created")
      setDialogOpen(false)
      fetchPages()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(page: StaticPage) {
    if (!confirm(`Delete "${resolveDisplay(page.title)}"?`)) return
    try {
      const res = await fetch(`/api/pages/${page.slug}`, { method: "DELETE" })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || "Failed to delete")
      }
      toast.success("Page deleted")
      fetchPages()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete"
      toast.error(message)
    }
  }

  async function handleTogglePublish(page: StaticPage) {
    try {
      const res = await fetch(`/api/pages/${page.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !page.published }),
      })
      if (!res.ok) throw new Error("Failed to update")
      fetchPages()
    } catch {
      toast.error("Failed to update")
    }
  }

  return (
    <PageTransition className="flex flex-1 flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("staticPages")}</h1>
        <Button onClick={openCreate}>
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} data-icon="inline-start" />
          New Page
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : pages.length === 0 ? (
        <EmptyState
          icon={<HugeiconsIcon icon={Edit02Icon} strokeWidth={1.5} />}
          title="No pages yet"
          description="Create static pages like Privacy Policy, Terms of Service, etc."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Languages</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pages.map((page) => {
              const titleMap = toMap(page.title)
              const langs = Object.keys(titleMap)
              return (
                <TableRow key={page.id}>
                  <TableCell className="font-medium">{resolveDisplay(page.title)}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    /p/{page.slug}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {langs.map((l) => (
                        <Badge key={l} variant="outline" className="text-[10px] uppercase">
                          {l}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={page.published ? "default" : "outline"}>
                      {page.published ? "Published" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(page.updatedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleTogglePublish(page)}>
                        <HugeiconsIcon icon={page.published ? ViewOffIcon : ViewIcon} strokeWidth={2} className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(page)}>
                        <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(page)}>
                        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPage ? "Edit Page" : "New Page"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-5">
            {/* Slug + Published */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label>Slug</Label>
                <Input
                  value={slug}
                  onChange={(e) => {
                    setSlug((e.target as HTMLInputElement).value)
                    setSlugTouched(true)
                  }}
                  placeholder="privacy-policy"
                  disabled={saving || !!editingPage}
                />
              </div>
              <div className="flex items-end gap-3 pb-1">
                <Switch checked={published} onCheckedChange={setPublished} />
                <Label>Published</Label>
              </div>
            </div>

            <LocalizedField
              label="Title"
              value={titles}
              onChange={handleTitlesChange}
              disabled={saving}
              placeholder="Page title"
            />

            <LocalizedField
              label="Content"
              value={contents}
              onChange={setContents}
              disabled={saving}
              render={({ lang, value, onChange, disabled }) => (
                <HugerteEditor
                  key={lang}
                  initialValue={value}
                  onEditorChange={onChange}
                  height={400}
                  disabled={disabled}
                  showHtmlToggle
                  placeholder="Write content..."
                />
              )}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !slug.trim() || !hasContent()}>
              {saving && (
                <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" data-icon="inline-start" />
              )}
              {editingPage ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  )
}
