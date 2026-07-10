"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"
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

interface TransferTarget {
  id: string
  user: { name: string; email: string }
}

/**
 * Şirket sahipliği devri — 2 adım: (1) onayla + owner e-postasına 6 haneli kod
 * gönder; (2) kodu gir + devri tamamla. Owner-only (parent gate'ler). Devir
 * tamamlanınca owner admin'e düşer, hedef owner olur.
 */
export function TransferOwnershipDialog({
  open,
  onOpenChange,
  slug,
  member,
  onTransferred,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  slug: string
  member: TransferTarget | null
  onTransferred: () => void
}) {
  const t = useTranslations("team")
  const [step, setStep] = useState<"confirm" | "code">("confirm")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setStep("confirm")
      setCode("")
      setBusy(false)
    }
  }, [open, member?.id])

  async function sendCode() {
    if (!member) return
    setBusy(true)
    try {
      const res = await fetch(`/api/companies/${slug}/transfer-ownership`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.id }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || t("transferFailed"))
        setBusy(false)
        return
      }
      if (json.data?.sent === false) {
        toast.warning(t("transferCodeNotSent"))
      } else {
        toast.success(t("codeSent"))
      }
      setStep("code")
    } catch {
      toast.error(t("transferFailed"))
    } finally {
      setBusy(false)
    }
  }

  async function confirmTransfer() {
    const c = code.trim()
    if (!/^\d{6}$/.test(c)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/companies/${slug}/transfer-ownership/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || t("transferFailed"))
        setBusy(false)
        return
      }
      toast.success(t("transferred"))
      onOpenChange(false)
      onTransferred()
    } catch {
      toast.error(t("transferFailed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("transferOwnership")}</DialogTitle>
          <DialogDescription>
            {step === "confirm"
              ? t("transferDesc", { name: member?.user.name ?? "" })
              : t("transferCodeSentDesc")}
          </DialogDescription>
        </DialogHeader>

        {step === "confirm" ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-muted-foreground">
            {t("becomeAdminNote")}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Label>{t("codeLabel")}</Label>
            <Input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              autoFocus
              className="text-center text-lg tracking-[0.5em]"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void confirmTransfer()
                }
              }}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("cancel")}
          </Button>
          {step === "confirm" ? (
            <Button onClick={sendCode} disabled={busy}>
              {busy && (
                <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" data-icon="inline-start" />
              )}
              {t("sendCode")}
            </Button>
          ) : (
            <Button onClick={confirmTransfer} disabled={busy || code.trim().length !== 6}>
              {busy && (
                <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" data-icon="inline-start" />
              )}
              {t("confirmTransfer")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
