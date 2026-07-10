"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"

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

interface SetPasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

/**
 * OAuth-only kullanicilarin hesabina email/sifre methodu eklemesi icin dialog.
 * Mevcut sifre sorulmaz — better-auth setPassword yalnizca newPassword alir.
 */
export function SetPasswordDialog({
  open,
  onOpenChange,
  onSuccess,
}: SetPasswordDialogProps) {
  const t = useTranslations("profile")
  const tCommon = useTranslations("common")

  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [busy, setBusy] = useState(false)

  function reset() {
    setNewPassword("")
    setConfirmPassword("")
  }

  async function handleSubmit() {
    if (newPassword.length < 8) {
      toast.error(t("passwordMinLength"))
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error(t("passwordMismatch"))
      return
    }
    setBusy(true)
    try {
      const res = await fetch("/api/user/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      toast.success(t("passwordSet"))
      onSuccess?.()
      onOpenChange(false)
      setTimeout(reset, 200)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onOpenChange(false)
          setTimeout(reset, 200)
        } else {
          onOpenChange(true)
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("setPassword")}</DialogTitle>
          <DialogDescription>{t("setPasswordDesc")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>{t("newPassword")}</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={busy}
              autoFocus
              autoComplete="new-password"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t("confirmPassword")}</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={busy}
              autoComplete="new-password"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={busy || !newPassword || !confirmPassword}
          >
            {busy && (
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="animate-spin"
                data-icon="inline-start"
              />
            )}
            {t("setPassword")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
