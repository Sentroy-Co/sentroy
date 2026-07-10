"use client"

import { useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import { useRouter } from "@workspace/auth/i18n/routing"
import { useSearchParams } from "next/navigation"
import { authClient } from "@workspace/auth/client/auth-client"
import { Link } from "@workspace/auth/i18n/routing"
import { cn } from "@workspace/ui/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Loading03Icon,
  CheckmarkCircle02Icon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { toast } from "sonner"
import { PasswordInput } from "@workspace/auth/components/password-input"

export function ResetPasswordForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const t = useTranslations("auth")
  const router = useRouter()
  const locale = useLocale()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  if (!token) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-5 text-center">
        <HugeiconsIcon
          icon={AlertCircleIcon}
          strokeWidth={2}
          className="size-6 text-red-600 dark:text-red-400"
        />
        <span className="text-sm font-medium">{t("resetTokenMissing")}</span>
        <Link
          href="/forgot-password"
          className="text-xs underline underline-offset-4"
        >
          {t("forgotTitle")}
        </Link>
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-5 text-center">
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          strokeWidth={2}
          className="size-6 text-emerald-600 dark:text-emerald-400"
        />
        <span className="text-sm font-medium">{t("resetDoneTitle")}</span>
        <span className="text-xs text-muted-foreground">
          {t("resetDoneDesc")}
        </span>
        <Link
          href="/login"
          className="mt-2 text-sm font-medium underline underline-offset-4"
        >
          {t("login")}
        </Link>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const newPassword = formData.get("password") as string
    const confirm = formData.get("confirm") as string

    if (newPassword.length < 8) {
      toast.error(t("passwordMinLength"))
      setLoading(false)
      return
    }
    if (newPassword !== confirm) {
      toast.error(t("passwordMismatch"))
      setLoading(false)
      return
    }

    try {
      const { error } = await authClient.resetPassword({
        newPassword,
        token: token!,
      })
      if (error) throw new Error(error.message || t("resetError"))
      setDone(true)
      // 2 saniye sonra otomatik login'e gönder — kullanıcı toast okur, sonra
      // yönlenir. Kendisi tıklamak isterse Link de var.
      setTimeout(() => router.push("/login"), 2000)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("resetError"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      className={cn("flex flex-col gap-6", className)}
      onSubmit={handleSubmit}
      {...props}
    >
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-bold">{t("resetTitle")}</h1>
        <p className="text-sm text-balance text-muted-foreground">
          {t("resetDescription")}
        </p>
      </div>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="password">{t("resetNewPassword")}</FieldLabel>
          <PasswordInput
            id="password"
            name="password"
            required
            autoComplete="new-password"
            disabled={loading}
            minLength={8}
            showLabel={t("showPassword")}
            hideLabel={t("hidePassword")}
          />
          <FieldDescription>{t("passwordHint")}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="confirm">{t("confirmPassword")}</FieldLabel>
          <PasswordInput
            id="confirm"
            name="confirm"
            required
            autoComplete="new-password"
            disabled={loading}
            minLength={8}
            showLabel={t("showPassword")}
            hideLabel={t("hidePassword")}
          />
        </Field>
        <Field>
          <Button type="submit" disabled={loading}>
            {loading && (
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="animate-spin"
                data-icon="inline-start"
              />
            )}
            {t("resetSubmit")}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
