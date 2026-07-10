"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { useCompanyStore } from "@workspace/console/stores/company"

/**
 * Yeni şirket oluşturma diyaloğu — TeamSwitcher'daki + butonundan ve
 * CompanySelection'dan ortak kullanılır. Başarı sonrası store cache'i
 * invalidate edilir, kullanıcı yeni şirketin dashboard'una yönlendirilir.
 */
export function CreateCompanyDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("companySelection")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const params = useParams()
  const lang = (params?.lang as string) || "en"
  const [creating, setCreating] = useState(false)

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setCreating(true)
    const formData = new FormData(e.currentTarget)
    const name = formData.get("name") as string

    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || t("createFailed"))
        setCreating(false)
        return
      }

      toast.success(t("companyCreated"))
      useCompanyStore.getState().invalidateCompanies()
      onOpenChange(false)
      router.push(`/${lang}/d/${json.data.slug}`)
    } catch {
      toast.error(t("genericError"))
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createDialogTitle")}</DialogTitle>
          <DialogDescription>{t("createDialogDesc")}</DialogDescription>
        </DialogHeader>
        <form
          id="create-company-form"
          onSubmit={handleCreate}
          className="flex flex-col gap-4"
        >
          <Field>
            <FieldLabel htmlFor="name">{t("companyName")}</FieldLabel>
            <Input
              id="name"
              name="name"
              placeholder={t("companyNamePlaceholder")}
              required
              autoFocus
              disabled={creating}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            {tCommon("cancel")}
          </Button>
          <Button type="submit" form="create-company-form" disabled={creating}>
            {creating && (
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="animate-spin"
                data-icon="inline-start"
              />
            )}
            {creating ? t("creating") : t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
