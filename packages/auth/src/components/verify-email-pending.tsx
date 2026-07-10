"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { useSearchParams } from "next/navigation"
import { Link } from "@workspace/auth/i18n/routing"
import { authClient } from "@workspace/auth/client/auth-client"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Loading03Icon,
  Mail01Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { toast } from "sonner"

const RESEND_COOLDOWN_SECONDS = 60

export function VerifyEmailPending() {
  const t = useTranslations("auth")
  const params = useSearchParams()
  const [email, setEmail] = useState(params.get("email") ?? "")
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  // Cooldown — kullanıcı spam edemez; 60 sn bekle. Email zaten URL'den
  // geliyorsa otomatik bir kez gönderilebilir, ama otomatik göndermiyoruz
  // çünkü signup zaten tetikledi.
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function handleResend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (cooldown > 0) return
    setLoading(true)
    try {
      const { error } = await authClient.sendVerificationEmail({
        email: email.trim(),
        callbackURL:
          typeof window !== "undefined"
            ? window.location.origin
            : undefined,
      })
      if (error) throw new Error(error.message)
      toast.success(t("verifyResendOk"))
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("verifyResendFail"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <HugeiconsIcon
            icon={Mail01Icon}
            strokeWidth={1.8}
            className="size-6"
          />
        </div>
        <h1 className="text-2xl font-bold">{t("verifyPendingTitle")}</h1>
        <p className="text-sm text-balance text-muted-foreground">
          {email
            ? t("verifyPendingDescWithEmail", { email })
            : t("verifyPendingDesc")}
        </p>
      </div>

      <form onSubmit={handleResend}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) =>
                setEmail((e.target as HTMLInputElement).value)
              }
              placeholder="m@example.com"
              disabled={loading}
              autoComplete="email"
            />
          </Field>
          <Field>
            <Button
              type="submit"
              disabled={loading || cooldown > 0 || !email.trim()}
            >
              {loading && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {cooldown > 0
                ? t("verifyResendCooldown", { seconds: cooldown })
                : t("verifyResend")}
            </Button>
          </Field>
        </FieldGroup>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="underline underline-offset-4">
          {t("forgotBackToLogin")}
        </Link>
      </p>
    </div>
  )
}
