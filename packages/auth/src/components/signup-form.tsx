"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations, useLocale } from "next-intl"
import { signUp, authClient } from "@workspace/auth/client/auth-client"
import { cn } from "@workspace/ui/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"
import { SocialProviderIcon } from "@workspace/auth/components/social-provider-icon"
import { SOCIAL_PROVIDERS } from "@workspace/auth/lib/social-providers"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Link } from "@workspace/auth/i18n/routing"
import { toast } from "sonner"
import { PasswordInput } from "@workspace/auth/components/password-input"
import { Honeypot, isHoneypotFilled } from "@workspace/auth/components/honeypot"
import {
  TurnstileWidget,
  isTurnstileEnabled,
} from "@workspace/auth/components/turnstile-widget"

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const t = useTranslations("auth")
  const router = useRouter()
  const locale = useLocale()
  const [loading, setLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstileRequired = isTurnstileEnabled()

  // Verification email link tıklandığında nereye yönlenmesi gerektiğini
  // better-auth'a iletiriz; oturum verify sonrası açılır ve kullanıcı dashboard'a düşer.
  const verifyCallbackURL =
    typeof window !== "undefined"
      ? `${window.location.origin}/${locale}/d`
      : `/${locale}/d`

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    // Honeypot — bot tuzağı; gerçek kullanıcı görünmez alana yazamaz.
    if (isHoneypotFilled(formData)) {
      await new Promise((r) => setTimeout(r, 250 + Math.random() * 1250))
      setLoading(false)
      return
    }
    const name = formData.get("name") as string
    const email = formData.get("email") as string
    const password = formData.get("password") as string
    const confirmPassword = formData.get("confirm-password") as string

    if (password !== confirmPassword) {
      toast.error(t("passwordMismatch"))
      setLoading(false)
      return
    }

    if (password.length < 8) {
      toast.error(t("passwordMinLength"))
      setLoading(false)
      return
    }

    if (turnstileRequired && !turnstileToken) {
      toast.error(t("captchaRequired"))
      setLoading(false)
      return
    }

    const { data, error } = await signUp.email({
      name,
      email,
      password,
      callbackURL: verifyCallbackURL,
      ...(turnstileToken ? { cfTurnstileToken: turnstileToken } : {}),
    } as Parameters<typeof signUp.email>[0])

    if (error) {
      toast.error(error.message || t("signupError"))
      if (turnstileRequired) {
        setTurnstileToken(null)
        if (typeof window !== "undefined" && window.turnstile) {
          try {
            window.turnstile.reset()
          } catch {
            // ignore
          }
        }
      }
      setLoading(false)
      return
    }

    // M2: verification KAPALIYSA (self-host REQUIRE_EMAIL_VERIFICATION=false)
    // better-auth signup ANINDA session token döner → doğrudan dashboard.
    // Yeni NEXT_PUBLIC_* flag'i YOK — client sunucunun gerçek davranışından
    // kendini ayarlar (client/server desync sınıfı ortadan kalkar).
    const sessionToken = (data as { token?: string | null } | null)?.token
    if (sessionToken) {
      router.push(`/${locale}/d`)
      return
    }

    // requireEmailVerification:true → signup session AÇMAZ. Kullanıcıyı
    // pending page'e gönder; orada resend ve durum bilgisi var.
    // Verify maili sendOnSignUp tarafından zaten yola çıktı.
    toast.success(t("signupVerificationSent"))
    router.push(
      `/${locale}/verify-email-pending?email=${encodeURIComponent(email)}`,
    )
  }

  async function handleSocialSignUp(provider: string) {
    setSocialLoading(provider)
    try {
      await authClient.signIn.social({
        provider: provider as "google" | "github",
        callbackURL: "/",
      })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("signupError"))
      setSocialLoading(null)
    }
  }

  const anyLoading = loading || socialLoading !== null
  const submitBlocked = turnstileRequired && !turnstileToken

  return (
    <form
      className={cn("flex flex-col gap-6", className)}
      onSubmit={handleSubmit}
      {...props}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">{t("signupTitle")}</h1>
          <p className="text-sm text-balance text-muted-foreground">
            {t("signupDescription")}
          </p>
        </div>

        {/* Social OAuth — env'de yapilandirilmis provider'lar icin iterasyon */}
        {SOCIAL_PROVIDERS.map((p) => {
          const isLoading = socialLoading === p.id
          return (
            <Field key={p.id}>
              <Button
                variant="outline"
                type="button"
                onClick={() => handleSocialSignUp(p.id)}
                disabled={anyLoading}
              >
                {isLoading ? (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    strokeWidth={2}
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                ) : (
                  <SocialProviderIcon
                    provider={p.id}
                    className="size-4 shrink-0"
                  />
                )}
                {t("continueWithProvider", { provider: p.label })}
              </Button>
            </Field>
          )
        })}

        <FieldSeparator>{t("orContinueWith")}</FieldSeparator>

        <Field>
          <FieldLabel htmlFor="name">{t("fullName")}</FieldLabel>
          <Input
            id="name"
            name="name"
            type="text"
            placeholder="John Doe"
            required
            disabled={anyLoading}
            autoComplete="name"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="m@example.com"
            required
            disabled={anyLoading}
            autoComplete="email"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
          <PasswordInput
            id="password"
            name="password"
            required
            disabled={anyLoading}
            autoComplete="new-password"
            showLabel={t("showPassword")}
            hideLabel={t("hidePassword")}
          />
          <FieldDescription>{t("passwordHint")}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="confirm-password">
            {t("confirmPassword")}
          </FieldLabel>
          <PasswordInput
            id="confirm-password"
            name="confirm-password"
            required
            disabled={anyLoading}
            autoComplete="new-password"
            showLabel={t("showPassword")}
            hideLabel={t("hidePassword")}
          />
        </Field>
        {turnstileRequired ? (
          <Field>
            <TurnstileWidget
              onToken={setTurnstileToken}
              onClear={() => setTurnstileToken(null)}
            />
          </Field>
        ) : null}
        <Honeypot />
        <Field>
          <Button type="submit" disabled={anyLoading || submitBlocked}>
            {loading && (
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="animate-spin"
                data-icon="inline-start"
              />
            )}
            {t("signup")}
          </Button>
          <FieldDescription className="px-6 text-center">
            {t("hasAccount")}{" "}
            <Link href="/login" className="underline underline-offset-4">
              {t("login")}
            </Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  )
}
