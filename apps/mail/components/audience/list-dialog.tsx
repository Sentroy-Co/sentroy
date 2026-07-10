"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { Label } from "@workspace/ui/components/label"

interface ListDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: { name: string; description?: string }) => Promise<void>
}

export function ListDialog({ open, onOpenChange, onSave }: ListDialogProps) {
  const t = useTranslations("audience")
  const ct = useTranslations("common")

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName("")
      setDescription("")
    }
  }, [open])

  async function handleSubmit() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createList")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>{t("listName")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Newsletter subscribers"
              disabled={saving}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit()
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t("listDescription")}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Contacts who opted in to receive newsletters"
              rows={3}
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
            {ct("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !name.trim()}>
            {saving && (
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="animate-spin"
                data-icon="inline-start"
              />
            )}
            {ct("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
