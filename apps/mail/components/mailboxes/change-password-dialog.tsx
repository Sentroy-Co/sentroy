"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Field, FieldLabel, FieldError } from "@workspace/ui/components/field"

interface ChangePasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  email: string
  onChanged: () => void
}

export function ChangePasswordDialog({
  open,
  onOpenChange,
  email,
  onChanged,
}: ChangePasswordDialogProps) {
  const t = useTranslations("mailboxes")
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]

  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<{
    newPassword?: string
    confirmPassword?: string
  }>({})

  function resetForm() {
    setNewPassword("")
    setConfirmPassword("")
    setErrors({})
  }

  function handleOpenChange(value: boolean) {
    if (!value) resetForm()
    onOpenChange(value)
  }

  function validate() {
    const newErrors: typeof errors = {}
    if (!newPassword || newPassword.length < 8) {
      newErrors.newPassword = t("newPassword") + " min 8 chars"
    }
    if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = t("confirmPassword") + " does not match"
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSubmitting(true)
    try {
      const encodedEmail = encodeURIComponent(email)
      const res = await fetch(
        `/api/companies/${slug}/mailboxes/${encodedEmail}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: newPassword }),
        }
      )
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to change password")
      }
      toast.success(t("passwordChanged"))
      handleOpenChange(false)
      onChanged()
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to change password"
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("changePassword")}</DialogTitle>
          <DialogDescription>{email}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel>{t("newPassword")}</FieldLabel>
            <Input
              type="password"
              placeholder="********"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={submitting}
            />
            {errors.newPassword && (
              <FieldError>{errors.newPassword}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel>{t("confirmPassword")}</FieldLabel>
            <Input
              type="password"
              placeholder="********"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={submitting}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit()
              }}
            />
            {errors.confirmPassword && (
              <FieldError>{errors.confirmPassword}</FieldError>
            )}
          </Field>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            {t("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && (
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="animate-spin"
                data-icon="inline-start"
              />
            )}
            {t("changePassword")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
