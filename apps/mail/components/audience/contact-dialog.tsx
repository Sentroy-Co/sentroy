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
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"

interface ContactData {
  id?: string
  email: string
  name?: string
  tags: string[]
  status: string
}

interface ContactDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contact: ContactData | null
  onSave: (data: {
    email: string
    name?: string
    tags: string[]
    status: string
  }) => Promise<void>
}

export function ContactDialog({
  open,
  onOpenChange,
  contact,
  onSave,
}: ContactDialogProps) {
  const t = useTranslations("audience")
  const ct = useTranslations("common")

  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [tags, setTags] = useState("")
  const [status, setStatus] = useState("active")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      if (contact) {
        setEmail(contact.email)
        setName(contact.name ?? "")
        setTags(contact?.tags?.join(", ") ?? "")
        setStatus(contact.status)
      } else {
        setEmail("")
        setName("")
        setTags("")
        setStatus("active")
      }
    }
  }, [open, contact])

  async function handleSubmit() {
    if (!email.trim()) return
    setSaving(true)
    try {
      await onSave({
        email: email.trim(),
        name: name.trim() || undefined,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        status,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  const isEdit = !!contact?.id

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("editContact") : t("addContact")}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>{t("email")}</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@example.com"
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t("name")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t("tags")}</Label>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="newsletter, vip"
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t("status")}</Label>
            <Select value={status} onValueChange={(value) => setStatus(value ?? "active")} disabled={saving}>
              <SelectTrigger>
                <span className="truncate">
                  {{ active: "Active", unsubscribed: "Unsubscribed", bounced: "Bounced" }[status] ?? status}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                <SelectItem value="bounced">Bounced</SelectItem>
              </SelectContent>
            </Select>
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
          <Button onClick={handleSubmit} disabled={saving || !email.trim()}>
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
