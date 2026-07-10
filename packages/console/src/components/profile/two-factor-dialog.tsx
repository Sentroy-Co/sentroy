"use client"

import { useState, useEffect } from "react"
import { QRCodeSVG } from "qrcode.react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Loading03Icon,
  Copy01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { authClient } from "@workspace/auth/client/auth-client"

interface TwoFactorSetupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Kullanıcının email/password credential account'u var mı. Yoksa şifre adımı atlanır. */
  hasCredential?: boolean
  onEnabled?: () => void
}

type Step = "password" | "verify" | "backup"

/**
 * 2FA kurulum akışı:
 * 1. (Opsiyonel) Kullanıcı şifresini girer — credential account varsa
 * 2. QR kodu authenticator uygulamaya taratılır
 * 3. Uygulamadan 6 haneli kod girilir → verify
 * 4. Backup kodları gösterilir, kullanıcı kaydeder
 */
export function TwoFactorSetupDialog({
  open,
  onOpenChange,
  hasCredential = true,
  onEnabled,
}: TwoFactorSetupDialogProps) {
  const t = useTranslations("profile")
  const tCommon = useTranslations("common")

  const [step, setStep] = useState<Step>(hasCredential ? "password" : "verify")
  const [password, setPassword] = useState("")
  const [totpUri, setTotpUri] = useState("")
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [verifyCode, setVerifyCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  // Credential-less kullanıcılar için dialog açılınca enable'ı otomatik çağır
  const [autoEnableStarted, setAutoEnableStarted] = useState(false)

  useEffect(() => {
    if (open && !hasCredential && !autoEnableStarted && !totpUri) {
      setAutoEnableStarted(true)
      handleEnable()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasCredential])

  function reset() {
    setStep(hasCredential ? "password" : "verify")
    setAutoEnableStarted(false)
    setPassword("")
    setTotpUri("")
    setBackupCodes([])
    setVerifyCode("")
    setCopied(false)
  }

  async function handleEnable() {
    if (hasCredential && !password) return
    setBusy(true)
    try {
      // Credential account yoksa password göndermeyiz (allowPasswordless)
      const { data, error } = await authClient.twoFactor.enable(
        hasCredential ? { password } : ({} as { password?: string }),
      )
      if (error) throw new Error(error.message || "Failed")
      setTotpUri(data?.totpURI ?? "")
      setBackupCodes(data?.backupCodes ?? [])
      setStep("verify")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to enable 2FA")
    } finally {
      setBusy(false)
    }
  }

  async function handleVerify() {
    if (verifyCode.length !== 6) return
    setBusy(true)
    try {
      const { error } = await authClient.twoFactor.verifyTotp({
        code: verifyCode,
      })
      if (error) throw new Error(error.message || "Invalid code")
      setStep("backup")
      toast.success(t("twoFactorEnabled"))
      onEnabled?.()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Invalid code")
    } finally {
      setBusy(false)
    }
  }

  async function copyBackupCodes() {
    await navigator.clipboard.writeText(backupCodes.join("\n"))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function close() {
    onOpenChange(false)
    setTimeout(reset, 200)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close()
        else onOpenChange(true)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === "password" && t("twoFactorSetup")}
            {step === "verify" && t("twoFactorVerify")}
            {step === "backup" && t("twoFactorBackupCodes")}
          </DialogTitle>
          <DialogDescription>
            {step === "password" && t("twoFactorPasswordHint")}
            {step === "verify" && t("twoFactorScanHint")}
            {step === "backup" && t("twoFactorBackupHint")}
          </DialogDescription>
        </DialogHeader>

        {step === "password" && (
          <div className="flex flex-col gap-2">
            <Label>{t("currentPassword")}</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              autoFocus
            />
          </div>
        )}

        {step === "verify" && totpUri && (
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-xl bg-white p-3">
              <QRCodeSVG value={totpUri} size={180} />
            </div>
            <div className="flex flex-col gap-2 w-full">
              <Label>{t("twoFactorCode")}</Label>
              <Input
                inputMode="numeric"
                maxLength={6}
                pattern="[0-9]{6}"
                value={verifyCode}
                onChange={(e) =>
                  setVerifyCode(e.target.value.replace(/\D/g, ""))
                }
                disabled={busy}
                placeholder="123456"
                className="text-center font-mono text-lg tracking-widest"
              />
            </div>
          </div>
        )}

        {step === "backup" && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/30 p-4 font-mono text-sm">
              {backupCodes.map((code) => (
                <div key={code} className="text-center">
                  {code}
                </div>
              ))}
            </div>
            <Button variant="outline" onClick={copyBackupCodes}>
              <HugeiconsIcon
                icon={copied ? Tick02Icon : Copy01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {copied ? tCommon("confirm") : t("twoFactorCopyCodes")}
            </Button>
          </div>
        )}

        <DialogFooter>
          {step === "password" && (
            <>
              <Button variant="outline" onClick={close} disabled={busy}>
                {tCommon("cancel")}
              </Button>
              <Button onClick={handleEnable} disabled={busy || !password}>
                {busy && (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    strokeWidth={2}
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                )}
                {tCommon("next")}
              </Button>
            </>
          )}
          {step === "verify" && (
            <>
              <Button variant="outline" onClick={close} disabled={busy}>
                {tCommon("cancel")}
              </Button>
              <Button
                onClick={handleVerify}
                disabled={busy || verifyCode.length !== 6}
              >
                {busy && (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    strokeWidth={2}
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                )}
                {tCommon("confirm")}
              </Button>
            </>
          )}
          {step === "backup" && <Button onClick={close}>{tCommon("save")}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface TwoFactorDisableDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  hasCredential?: boolean
  onDisabled?: () => void
}

export function TwoFactorDisableDialog({
  open,
  onOpenChange,
  hasCredential = true,
  onDisabled,
}: TwoFactorDisableDialogProps) {
  const t = useTranslations("profile")
  const tCommon = useTranslations("common")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)

  async function handleDisable() {
    if (hasCredential && !password) return
    setBusy(true)
    try {
      const { error } = await authClient.twoFactor.disable(
        hasCredential ? { password } : ({} as { password?: string }),
      )
      if (error) throw new Error(error.message || "Failed")
      toast.success(t("twoFactorDisabled"))
      onDisabled?.()
      onOpenChange(false)
      setPassword("")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to disable 2FA")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("twoFactorDisableTitle")}</DialogTitle>
          <DialogDescription>{t("twoFactorDisableDesc")}</DialogDescription>
        </DialogHeader>
        {hasCredential && (
          <div className="flex flex-col gap-2">
            <Label>{t("currentPassword")}</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              autoFocus
            />
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDisable}
            disabled={busy || (hasCredential && !password)}
          >
            {busy && (
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="animate-spin"
                data-icon="inline-start"
              />
            )}
            {t("twoFactorDisable")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
