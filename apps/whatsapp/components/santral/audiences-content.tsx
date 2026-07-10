"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  PencilEdit02Icon,
  Delete02Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { Label } from "@workspace/ui/components/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@workspace/ui/components/dialog"

interface AudienceEntry {
  phone: string
  variables?: Record<string, string>
}
interface Audience {
  id: string
  name: string
  description: string | null
  entries: AudienceEntry[]
  entryCount: number
}

export function AudiencesContent() {
  const t = useTranslations("santral")
  const params = useParams()
  const slug = params["company-slug"] as string
  const api = `/api/companies/${slug}/audiences`

  const [items, setItems] = useState<Audience[]>([])
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState<Audience | null>(null)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [phones, setPhones] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<Audience | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(api)
      const json = await res.json()
      setItems((json?.data as Audience[]) ?? [])
    } catch {
      setItems([])
    }
    setLoaded(true)
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  function openNew() {
    setEditing(null)
    setName("")
    setPhones("")
    setOpen(true)
  }
  function openEdit(a: Audience) {
    setEditing(a)
    setName(a.name)
    setPhones(a.entries.map((e) => e.phone).join("\n"))
    setOpen(true)
  }

  async function save() {
    const entries = phones
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean)
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch(editing ? `${api}/${editing.id}` : api, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), entries }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || t("somethingWrong"))
      toast.success(editing ? t("updated") : t("created"))
      setOpen(false)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("somethingWrong"))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    const id = deleting.id
    setDeleting(null)
    try {
      const res = await fetch(`${api}/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success(t("deleted"))
      await load()
    } catch {
      toast.error(t("somethingWrong"))
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("audiencesTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("audiencesSubtitle")}</p>
        </div>
        <Button onClick={openNew} className="gap-1.5">
          <HugeiconsIcon icon={Add01Icon} className="size-4" strokeWidth={2} />
          {t("newAudience")}
        </Button>
      </div>

      {loaded && items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-14 text-center">
          <HugeiconsIcon icon={UserGroupIcon} className="size-8 text-muted-foreground/50" strokeWidth={1.6} />
          <p className="text-sm text-muted-foreground">{t("noAudiences")}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-2 rounded-2xl border bg-card p-4">
              <div className="min-w-0">
                <h3 className="truncate font-medium">{a.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {a.entryCount} {t("recipients")}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => openEdit(a)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <HugeiconsIcon icon={PencilEdit02Icon} className="size-4" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(a)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                >
                  <HugeiconsIcon icon={Delete02Icon} className="size-4" strokeWidth={2} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t("editAudience") : t("newAudience")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wa-aud-name">{t("name")}</Label>
              <Input
                id="wa-aud-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-aud-phones">{t("phones")}</Label>
              <Textarea
                id="wa-aud-phones"
                value={phones}
                onChange={(e) => setPhones(e.target.value)}
                placeholder={t("phonesPlaceholder")}
                rows={6}
                className="resize-none font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">{t("phonesHint")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={save} disabled={saving || !name.trim()}>
              {saving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("deleteConfirm")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{deleting?.name}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
