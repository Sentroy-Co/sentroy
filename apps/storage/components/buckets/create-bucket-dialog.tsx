"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { Switch } from "@workspace/ui/components/switch"

interface CreateBucketDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
  companySlug: string
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function CreateBucketDialog({
  open,
  onOpenChange,
  onCreated,
  companySlug,
}: CreateBucketDialogProps) {
  const t = useTranslations("buckets.create")
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugTouched, setSlugTouched] = useState(false)
  const [description, setDescription] = useState("")
  const [isPublic, setIsPublic] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name))
  }, [name, slugTouched])

  useEffect(() => {
    if (!open) {
      setName("")
      setSlug("")
      setSlugTouched(false)
      setDescription("")
      setIsPublic(false)
      setSubmitting(false)
    }
  }, [open])

  const canSubmit = name.trim().length > 0 && slug.trim().length > 0 && !submitting

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/companies/${companySlug}/buckets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim() || undefined,
          isPublic,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || "Failed to create bucket")
        return
      }
      toast.success("Bucket created")
      onOpenChange(false)
      onCreated()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bucket-name">{t("nameLabel")}</Label>
            <Input
              id="bucket-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bucket-slug">{t("slugLabel")}</Label>
            <Input
              id="bucket-slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value)
                setSlugTouched(true)
              }}
            />
            <p className="text-xs text-muted-foreground">{t("slugHelp")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bucket-description">{t("descriptionLabel")}</Label>
            <Textarea
              id="bucket-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div className="space-y-1">
              <Label htmlFor="bucket-public">{t("publicLabel")}</Label>
              <DialogDescription className="text-xs">
                {t("publicHelp")}
              </DialogDescription>
            </div>
            <Switch
              id="bucket-public"
              checked={isPublic}
              onCheckedChange={setIsPublic}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
