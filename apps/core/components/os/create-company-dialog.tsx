"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { useCompanyStore } from "@workspace/console/stores/company"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Button } from "@workspace/ui/components/button"

/**
 * OS içi "yeni şirket" akışı — company switcher'dan açılır. POST /api/companies
 * sonrası şirket listesini force-refetch eder ve yeni slug'a geçiş yapar
 * (CompanySelection'daki create deseninin SPA karşılığı).
 */
export function CreateCompanyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (slug: string) => void
}) {
  const t = useTranslations("os")
  const [name, setName] = useState("")
  const [creating, setCreating] = useState(false)

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || creating) return
    setCreating(true)
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || t("createCompanyDialog.failed"))
        setCreating(false)
        return
      }
      toast.success(t("createCompanyDialog.created"))
      await useCompanyStore.getState().fetchCompanies(true)
      setName("")
      setCreating(false)
      onOpenChange(false)
      onCreated(json.data.slug as string)
    } catch {
      toast.error(t("common.somethingWrong"))
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/15 bg-card/90 backdrop-blur-2xl backdrop-saturate-150 sm:max-w-md dark:border-white/10">
        <DialogHeader>
          <DialogTitle>{t("createCompanyDialog.title")}</DialogTitle>
          <DialogDescription>{t("createCompanyDialog.desc")}</DialogDescription>
        </DialogHeader>
        <form id="os-create-company" onSubmit={handleCreate} className="space-y-2">
          <Label htmlFor="os-company-name">{t("createCompanyDialog.nameLabel")}</Label>
          <Input
            id="os-company-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("createCompanyDialog.namePlaceholder")}
            autoFocus
            maxLength={80}
          />
        </form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={creating}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="os-create-company" disabled={creating || !name.trim()}>
            {creating ? t("createCompanyDialog.creating") : t("createCompanyDialog.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
