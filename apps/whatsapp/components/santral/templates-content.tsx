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
  TextCreationIcon,
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

interface Template {
  id: string
  name: string
  body: string
  variables: string[]
  createdAt: string
}

/** UI-side variable preview ({{x}}). Server re-extracts authoritatively. */
function extractVars(body: string): string[] {
  const out = new Set<string>()
  const re = /\{\{\s*([\w.]+)\s*\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) out.add(m[1]!)
  return [...out]
}

export function TemplatesContent() {
  const t = useTranslations("santral")
  const params = useParams()
  const slug = params["company-slug"] as string
  const api = `/api/companies/${slug}/templates`

  const [items, setItems] = useState<Template[]>([])
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [body, setBody] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<Template | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(api)
      const json = await res.json()
      setItems((json?.data as Template[]) ?? [])
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
    setBody("")
    setOpen(true)
  }
  function openEdit(tpl: Template) {
    setEditing(tpl)
    setName(tpl.name)
    setBody(tpl.body)
    setOpen(true)
  }

  async function save() {
    if (!name.trim() || !body.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch(editing ? `${api}/${editing.id}` : api, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), body }),
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

  const previewVars = extractVars(body)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("templatesTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("templatesSubtitle")}</p>
        </div>
        <Button onClick={openNew} className="gap-1.5">
          <HugeiconsIcon icon={Add01Icon} className="size-4" strokeWidth={2} />
          {t("newTemplate")}
        </Button>
      </div>

      {loaded && items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-14 text-center">
          <HugeiconsIcon icon={TextCreationIcon} className="size-8 text-muted-foreground/50" strokeWidth={1.6} />
          <p className="text-sm text-muted-foreground">{t("noTemplates")}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((tpl) => (
            <div key={tpl.id} className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium">{tpl.name}</h3>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(tpl)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <HugeiconsIcon icon={PencilEdit02Icon} className="size-4" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(tpl)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="size-4" strokeWidth={2} />
                  </button>
                </div>
              </div>
              <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                {tpl.body}
              </p>
              {tpl.variables.length > 0 ? (
                <div className="flex flex-wrap gap-1 pt-1">
                  {tpl.variables.map((v) => (
                    <span key={v} className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary">
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t("editTemplate") : t("newTemplate")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wa-tpl-name">{t("name")}</Label>
              <Input
                id="wa-tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("templateNamePlaceholder")}
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-tpl-body">{t("body")}</Label>
              <Textarea
                id="wa-tpl-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("templateBodyPlaceholder")}
                rows={5}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">{t("templateBodyHint")}</p>
            </div>
            {previewVars.length > 0 ? (
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{t("variables")}</span>
                <div className="flex flex-wrap gap-1">
                  {previewVars.map((v) => (
                    <span key={v} className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary">
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={save} disabled={saving || !name.trim() || !body.trim()}>
              {saving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
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
