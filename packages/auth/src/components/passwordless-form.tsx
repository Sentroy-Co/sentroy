"use client"

import { useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import { useRouter } from "@workspace/auth/i18n/routing"
import { authClient, emailOtp } from "@workspace/auth/client/auth-client"
import { Link } from "@workspace/auth/i18n/routing"
import { cn } from "@workspace/ui/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Loading03Icon,
  CheckmarkCircle02Icon,
  Mail01Icon,
  KeyIcon,
  ArrowLeft01Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { toast } from "sonner"

export function PasswordlessForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const t = useTranslations("auth")
  const router = useRouter()
  const locale = useLocale()

  // ── Magic link state ────────────────────────────────────────────────────
  const [linkLoading, setLinkLoading] = useState(false)
  const [linkSent, setLinkSent] = useState(false)

  // ── OTP state ───────────────────────────────────────────────────────────
  const [otpEmail, setOtpEmail] = useState("")
  const [otpCode, setOtpCode] = useState("")
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpStage, setOtpStage] = useState<"request" | "verify">("request")

  const callbackURL =
    typeof window !== "undefined"
      ? `${window.location.origin}/${locale}/d`
      : `/${locale}/d`

  // ── Handlers: magic link ────────────────────────────────────────────────

  async function handleMagicLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLinkLoading(true)
    const formData = new FormData(e.currentTarget)
    const email = (formData.get("email") as string).trim()
    try {
      const { error } = await authClient.signIn.magicLink({
        email,
        callbackURL,
      })
      if (error) throw new Error(error.message || t("passwordlessError"))
      setLinkSent(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("passwordlessError"))
    } finally {
      setLinkLoading(false)
    }
  }

  // ── Handlers: OTP ───────────────────────────────────────────────────────

  async function handleOtpRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setOtpLoading(true)
    try {
      const { error } = await emailOtp.sendVerificationOtp({
        email: otpEmail.trim(),
        type: "sign-in",
      })
      if (error) throw new Error(error.message || t("passwordlessError"))
      setOtpStage("verify")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("passwordlessError"))
    } finally {
      setOtpLoading(false)
    }
  }

  async function handleOtpVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setOtpLoading(true)
    try {
      const { error } = await authClient.signIn.emailOtp({
        email: otpEmail.trim(),
        otp: otpCode.trim(),
      })
      if (error) throw new Error(error.message || t("otpInvalid"))
      router.push("/d")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("otpInvalid"))
    } finally {
      setOtpLoading(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-bold">{t("passwordlessTitle")}</h1>
        <p className="text-sm text-balance text-muted-foreground">
          {t("passwordlessDescription")}
        </p>
      </div>

      <Tabs defaultValue="link">
        <TabsList className="self-center">
          <TabsTrigger value="link">
            <HugeiconsIcon
              icon={Mail01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("passwordlessTabLink")}
          </TabsTrigger>
          <TabsTrigger value="otp">
            <HugeiconsIcon
              icon={KeyIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("passwordlessTabOtp")}
          </TabsTrigger>
        </TabsList>

        {/* ── Magic link ────────────────────────────────────────────────── */}
        <TabsContent value="link" className="pt-2">
          {linkSent ? (
            <SuccessNote
              title={t("linkSentTitle")}
              body={t("linkSentDesc")}
            />
          ) : (
            <form onSubmit={handleMagicLink}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="link-email">{t("email")}</FieldLabel>
                  <Input
                    id="link-email"
                    name="email"
                    type="email"
                    placeholder="m@example.com"
                    required
                    autoComplete="email"
                    disabled={linkLoading}
                  />
                  <FieldDescription>{t("linkHint")}</FieldDescription>
                </Field>
                <Field>
                  <Button type="submit" disabled={linkLoading}>
                    {linkLoading && (
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        strokeWidth={2}
                        className="animate-spin"
                        data-icon="inline-start"
                      />
                    )}
                    {t("sendMagicLink")}
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          )}
        </TabsContent>

        {/* ── OTP ───────────────────────────────────────────────────────── */}
        <TabsContent value="otp" className="pt-2">
          {otpStage === "request" ? (
            <form onSubmit={handleOtpRequest}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="otp-email">{t("email")}</FieldLabel>
                  <Input
                    id="otp-email"
                    name="email"
                    type="email"
                    placeholder="m@example.com"
                    value={otpEmail}
                    onChange={(e) =>
                      setOtpEmail((e.target as HTMLInputElement).value)
                    }
                    required
                    autoComplete="email"
                    disabled={otpLoading}
                  />
                  <FieldDescription>{t("otpHint")}</FieldDescription>
                </Field>
                <Field>
                  <Button
                    type="submit"
                    disabled={otpLoading || !otpEmail.trim()}
                  >
                    {otpLoading && (
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        strokeWidth={2}
                        className="animate-spin"
                        data-icon="inline-start"
                      />
                    )}
                    {t("sendOtpCode")}
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          ) : (
            <form onSubmit={handleOtpVerify}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="otp-code">{t("otpCode")}</FieldLabel>
                  <Input
                    id="otp-code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    value={otpCode}
                    onChange={(e) =>
                      setOtpCode(
                        (e.target as HTMLInputElement).value.replace(
                          /\D/g,
                          "",
                        ),
                      )
                    }
                    required
                    disabled={otpLoading}
                    className="text-center font-mono text-lg tracking-[0.4em]"
                  />
                  <FieldDescription>
                    {t("otpVerifyHint", { email: otpEmail })}
                  </FieldDescription>
                </Field>
                <Field>
                  <Button
                    type="submit"
                    disabled={otpLoading || otpCode.length < 6}
                  >
                    {otpLoading && (
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        strokeWidth={2}
                        className="animate-spin"
                        data-icon="inline-start"
                      />
                    )}
                    {t("verifyAndSignIn")}
                  </Button>
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setOtpStage("request")
                    setOtpCode("")
                  }}
                  disabled={otpLoading}
                >
                  <HugeiconsIcon
                    icon={ArrowLeft01Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  {t("otpUseDifferentEmail")}
                </Button>
              </FieldGroup>
            </form>
          )}
        </TabsContent>
      </Tabs>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="underline underline-offset-4">
          {t("backToPassword")}
        </Link>
      </p>
    </div>
  )
}

function SuccessNote({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-5 text-center">
      <HugeiconsIcon
        icon={CheckmarkCircle02Icon}
        strokeWidth={2}
        className="size-6 text-emerald-600 dark:text-emerald-400"
      />
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{body}</span>
    </div>
  )
}
