"use client"

import { useEffect, useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import { useRouter } from "@workspace/auth/i18n/routing"
import { signIn, authClient } from "@workspace/auth/client/auth-client"
import {
  startAuthentication,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser"
import { cn } from "@workspace/ui/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon, KeyIcon } from "@hugeicons/core-free-icons"
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

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const t = useTranslations("auth")
  const router = useRouter()
  const locale = useLocale()
  // Post-login destination — honours a same-origin `?callbackURL=` (the
  // desktop-app handoff returns to /[lang]/desktop-auth), else the dashboard.
  // Read at click time to avoid a useSearchParams Suspense boundary.
  const dest = () => {
    if (typeof window === "undefined") return `/${locale}/d`
    const raw = new URLSearchParams(window.location.search).get("callbackURL")
    return raw && raw.startsWith("/") && !raw.startsWith("//")
      ? raw
      : `/${locale}/d`
  }
  const [loading, setLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState<string | null>(null)
  const [passkeySupported, setPasskeySupported] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  // Turnstile token — env'de site key set edilmediyse `null` kalır,
  // submit guard'ı isTurnstileEnabled()'a bakar (bkz. canSubmit).
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstileRequired = isTurnstileEnabled()

  useEffect(() => {
    setPasskeySupported(browserSupportsWebAuthn())
  }, [])

  async function handlePasskeySignIn() {
    setPasskeyLoading(true)
    try {
      // Discoverable credential — email vermeden browser kullanıcıya
      // hangi passkey'i kullanacağını sorar.
      const beginRes = await fetch("/api/passkey/authenticate/begin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const beginJson = await beginRes.json()
      if (!beginRes.ok) throw new Error(beginJson.error || "Begin failed")

      const assertion = await startAuthentication({
        optionsJSON: beginJson.data.options,
      })

      const completeRes = await fetch("/api/passkey/authenticate/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flowId: beginJson.data.flowId,
          response: assertion,
        }),
      })
      const completeJson = await completeRes.json()
      if (!completeRes.ok)
        throw new Error(completeJson.error || t("passkeySignInFailed"))

      // Cookie set edildi → hedefe tam refresh ile git (callbackURL varsa oraya).
      window.location.href = dest()
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.name === "NotAllowedError"
          ? t("passkeyCancelled")
          : err instanceof Error
          ? err.message
          : t("passkeySignInFailed")
      toast.error(message)
    } finally {
      setPasskeyLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    // Honeypot — naive form-fill bot'u tüm input'ları doldurur, gerçek
    // kullanıcı görünmez alana yazamaz. Doluysa fake-success davranışı:
    // sessizce dön, hata bile gösterme (bot ne olduğunu anlamasın).
    if (isHoneypotFilled(formData)) {
      // 250-1500ms artificial latency + fake success — gerçek auth'a benzesin
      await new Promise((r) => setTimeout(r, 250 + Math.random() * 1250))
      setLoading(false)
      return
    }
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    // Turnstile zorunluysa token yokken submit'i engelle. UI butonu
    // zaten disabled tutuyor; bu sadece defansif fallback (form keypress
    // ile submit edilirse).
    if (turnstileRequired && !turnstileToken) {
      toast.error(t("captchaRequired"))
      setLoading(false)
      return
    }

    const { data, error } = await signIn.email({
      email,
      password,
      // Turnstile token — server-side `verifyTurnstileToken` siteverify
      // ile doğrular. Site key set değilse field hiç render olmaz; body'de
      // null geçer ve server tarafında no-op (env yoksa).
      ...(turnstileToken ? { cfTurnstileToken: turnstileToken } : {}),
    } as Parameters<typeof signIn.email>[0])

    if (error) {
      // Better-auth `EMAIL_NOT_VERIFIED` error code'unu döner; sendOnSignIn
      // aktif olduğu için doğrulama maili otomatik tekrar gönderildi —
      // kullanıcıyı pending page'e yönlendir, ne yapacağını gösterelim.
      //
      // **Önemli:** Sadece error.code'a bak. Önceki sürümde fallback
      // `/verif/i` regex'i error.message'da "verif" arıyordu — bu regex
      // Turnstile'in "Captcha verification failed" mesajını da yakalayıp
      // kullanıcıyı yanlışlıkla verify-email akışına gönderiyordu (fake
      // EMAIL_NOT_VERIFIED). Code-only kontrol better-auth sözleşmesine
      // güvenilir; better-auth tutarlı olarak `EMAIL_NOT_VERIFIED`
      // code'unu döndürüyor.
      const code = (error as { code?: string }).code
      if (code === "EMAIL_NOT_VERIFIED") {
        toast.message(t("loginUnverifiedNotice"))
        router.push(
          `/verify-email-pending?email=${encodeURIComponent(email)}`,
        )
        return
      }
      toast.error(error.message || t("loginError"))
      // Turnstile token tek kullanımlık — fail sonrası fresh token için
      // sıfırla. Widget kendi callback'iyle yeni token üretir.
      if (turnstileRequired) {
        setTurnstileToken(null)
        if (typeof window !== "undefined" && window.turnstile) {
          try {
            window.turnstile.reset()
          } catch {
            // mount race — ignore
          }
        }
      }
      setLoading(false)
      return
    }

    // 2FA aktifse twoFactorRedirect=true gelir — /two-factor sayfasına yönlendir
    if (
      data &&
      typeof data === "object" &&
      "twoFactorRedirect" in data &&
      (data as { twoFactorRedirect?: boolean }).twoFactorRedirect
    ) {
      router.push("/two-factor")
      return
    }

    // Login sonrası hedefe git. Varsayılan /d için next-intl router locale
    // prefix'i otomatik ekler (kendimiz `/${locale}/...` YAZMAYIN → çift
    // prefix). callbackURL verildiyse (zaten locale-prefix'li) window.location
    // ile git — i18n router çift-prefix'lemesin.
    const d = dest()
    if (d === `/${locale}/d`) {
      router.push("/d")
      router.refresh()
    } else {
      window.location.href = d
    }
  }

  async function handleSocialSignIn(provider: string) {
    setSocialLoading(provider)
    try {
      await authClient.signIn.social({
        provider: provider as "google" | "github",
        // better-auth callbackURL locale-aware değil → manuel prefix. Desktop
        // handoff'ta callbackURL=/[lang]/desktop-auth ile OAuth sonrası oraya döner.
        callbackURL: dest(),
      })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("loginError"))
      setSocialLoading(null)
    }
  }

  const anyLoading = loading || socialLoading !== null || passkeyLoading
  // Turnstile aktif ise token gelmeden submit butonu disabled.
  const submitBlocked = turnstileRequired && !turnstileToken

  return (
    <form
      className={cn("flex flex-col gap-6", className)}
      onSubmit={handleSubmit}
      {...props}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">{t("loginTitle")}</h1>
          <p className="text-sm text-balance text-muted-foreground">
            {t("loginDescription")}
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
                onClick={() => handleSocialSignIn(p.id)}
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

        {passkeySupported && (
          <Field>
            <Button
              variant="outline"
              type="button"
              onClick={handlePasskeySignIn}
              disabled={anyLoading || passkeyLoading}
            >
              {passkeyLoading ? (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <HugeiconsIcon
                  icon={KeyIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
              )}
              {t("passkeySignIn")}
            </Button>
          </Field>
        )}

        <FieldSeparator>{t("orContinueWith")}</FieldSeparator>

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
          <div className="flex items-center">
            <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
            <Link
              href="/forgot-password"
              className="ms-auto text-sm underline-offset-4 hover:underline"
            >
              {t("forgotPassword")}
            </Link>
          </div>
          <PasswordInput
            id="password"
            name="password"
            required
            disabled={anyLoading}
            autoComplete="current-password"
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
            {t("login")}
          </Button>
          <FieldDescription className="text-center">
            <Link
              href="/passwordless"
              className="underline underline-offset-4"
            >
              {t("passwordlessCta")}
            </Link>
          </FieldDescription>
          <FieldDescription className="text-center">
            {t("noAccount")}{" "}
            <Link href="/signup" className="underline underline-offset-4">
              {t("signup")}
            </Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  )
}
