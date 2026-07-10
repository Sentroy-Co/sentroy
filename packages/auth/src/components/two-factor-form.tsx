"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon, Shield01Icon } from "@hugeicons/core-free-icons"

import { authClient } from "@workspace/auth/client/auth-client"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Checkbox } from "@workspace/ui/components/checkbox"

export function TwoFactorForm() {
  const t = useTranslations("auth")
  const router = useRouter()

  const [mode, setMode] = useState<"totp" | "backup">("totp")
  const [code, setCode] = useState("")
  const [trust, setTrust] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!code.trim()) return

    setLoading(true)
    try {
      const { error } =
        mode === "totp"
          ? await authClient.twoFactor.verifyTotp({
              code: code.trim(),
              trustDevice: trust,
            })
          : await authClient.twoFactor.verifyBackupCode({
              code: code.trim(),
              trustDevice: trust,
            })

      if (error) throw new Error(error.message || t("twoFactorInvalid"))

      router.push("/")
      router.refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("twoFactorInvalid"))
      setLoading(false)
    }
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <FieldGroup>
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <HugeiconsIcon icon={Shield01Icon} strokeWidth={2} />
          </div>
          <h1 className="text-2xl font-bold">{t("twoFactorTitle")}</h1>
          <p className="text-sm text-balance text-muted-foreground">
            {mode === "totp"
              ? t("twoFactorDescription")
              : t("twoFactorUseBackup")}
          </p>
        </div>

        <Field>
          <FieldLabel htmlFor="code">
            {mode === "totp" ? t("twoFactorCode") : t("twoFactorBackupCode")}
          </FieldLabel>
          <Input
            id="code"
            name="code"
            type="text"
            inputMode={mode === "totp" ? "numeric" : "text"}
            autoComplete="one-time-code"
            required
            autoFocus
            disabled={loading}
            placeholder={mode === "totp" ? "123456" : "xxxxx-xxxxx"}
            maxLength={mode === "totp" ? 6 : 16}
            value={code}
            onChange={(e) =>
              setCode(
                mode === "totp"
                  ? e.target.value.replace(/\D/g, "")
                  : e.target.value,
              )
            }
            className="text-center font-mono text-lg tracking-widest"
          />
        </Field>

        <Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={trust}
              onCheckedChange={(v) => setTrust(Boolean(v))}
            />
            {t("twoFactorTrust")}
          </label>
        </Field>

        <Field>
          <Button type="submit" disabled={loading || !code.trim()}>
            {loading && (
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="animate-spin"
                data-icon="inline-start"
              />
            )}
            {t("twoFactorSubmit")}
          </Button>
          <FieldDescription className="text-center">
            <button
              type="button"
              className="underline underline-offset-4 hover:text-foreground"
              onClick={() => {
                setMode((m) => (m === "totp" ? "backup" : "totp"))
                setCode("")
              }}
            >
              {mode === "totp" ? t("twoFactorUseBackup") : t("twoFactorUseTotp")}
            </button>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  )
}
