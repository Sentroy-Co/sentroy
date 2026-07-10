"use client"

import { useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import { authClient } from "@workspace/auth/client/auth-client"
import { Link } from "@workspace/auth/i18n/routing"
import { cn } from "@workspace/ui/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Loading03Icon,
  CheckmarkCircle02Icon,
  ArrowLeft01Icon,
  BuildingIcon,
  Mail01Icon,
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
import { Honeypot, isHoneypotFilled } from "@workspace/auth/components/honeypot"
import {
  TurnstileWidget,
  isTurnstileEnabled,
} from "@workspace/auth/components/turnstile-widget"

interface Candidate {
  id: string
  masked: string
  role: "owner" | "member"
}

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const t = useTranslations("auth")
  const locale = useLocale()

  const [emailLoading, setEmailLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [slugLoading, setSlugLoading] = useState(false)
  const [slug, setSlug] = useState("")
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [pickLoading, setPickLoading] = useState<string | null>(null)
  const [pickedSent, setPickedSent] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstileRequired = isTurnstileEnabled()

  /** Tek noktada full reset URL'i — tarayıcı origin'i + locale.
   *  better-auth callback bu URL'e `?token=...` ekler. */
  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/${locale}/reset-password`
      : ""

  // ── Mode 1: Email ────────────────────────────────────────────────────────

  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setEmailLoading(true)
    const formData = new FormData(e.currentTarget)
    if (isHoneypotFilled(formData)) {
      // Bot tuzağı dolu — fake success'i hemen göster (gerçek akışla
      // ayırt edilemez). Hesap leak'i engelleme polikamızla uyumlu:
      // gerçek ya da fake, sonuç hep "email gönderildi" görünür.
      await new Promise((r) => setTimeout(r, 250 + Math.random() * 1250))
      setEmailSent(true)
      setEmailLoading(false)
      return
    }
    if (turnstileRequired && !turnstileToken) {
      toast.error(t("captchaRequired"))
      setEmailLoading(false)
      return
    }
    const email = (formData.get("email") as string).trim()
    try {
      await authClient.requestPasswordReset({
        email,
        redirectTo,
        ...(turnstileToken ? { cfTurnstileToken: turnstileToken } : {}),
      } as Parameters<typeof authClient.requestPasswordReset>[0])
      // Generic onay — hesap olup olmadığını leak etmiyoruz.
      setEmailSent(true)
    } catch (err) {
      // Yine generic — sadece network hatası varsa toast'la.
      toast.error(err instanceof Error ? err.message : t("forgotError"))
    } finally {
      setEmailLoading(false)
    }
  }

  // ── Mode 2: Company slug ─────────────────────────────────────────────────

  async function lookupBySlug(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSlugLoading(true)
    setCandidates(null)
    setPickedSent(false)
    try {
      const res = await fetch("/api/auth/recover-by-slug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      setCandidates((json.data?.candidates ?? []) as Candidate[])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("forgotError"))
    } finally {
      setSlugLoading(false)
    }
  }

  async function pickCandidate(c: Candidate) {
    setPickLoading(c.id)
    try {
      const res = await fetch("/api/auth/recover-by-slug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          candidateId: c.id,
          redirectTo,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || "Failed")
      }
      setPickedSent(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("forgotError"))
    } finally {
      setPickLoading(null)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-bold">{t("forgotTitle")}</h1>
        <p className="text-sm text-balance text-muted-foreground">
          {t("forgotDescription")}
        </p>
      </div>

      <Tabs defaultValue="email">
        <TabsList className="self-center">
          <TabsTrigger value="email">
            <HugeiconsIcon
              icon={Mail01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("forgotByEmail")}
          </TabsTrigger>
          <TabsTrigger value="slug">
            <HugeiconsIcon
              icon={BuildingIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("forgotBySlug")}
          </TabsTrigger>
        </TabsList>

        {/* ── Email ─────────────────────────────────────────────────────── */}
        <TabsContent value="email" className="pt-2">
          {emailSent ? (
            <SuccessNote
              title={t("forgotEmailSentTitle")}
              body={t("forgotEmailSentDesc")}
            />
          ) : (
            <form onSubmit={handleEmailSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="m@example.com"
                    required
                    autoComplete="email"
                    disabled={emailLoading}
                  />
                  <FieldDescription>
                    {t("forgotByEmailHint")}
                  </FieldDescription>
                </Field>
                {turnstileRequired ? (
                  <Field>
                    <TurnstileWidget
                      onToken={setTurnstileToken}
                      onClear={() => setTurnstileToken(null)}
                    />
                  </Field>
                ) : null}
                <Field>
                  <Button
                    type="submit"
                    disabled={
                      emailLoading || (turnstileRequired && !turnstileToken)
                    }
                  >
                    {emailLoading && (
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        strokeWidth={2}
                        className="animate-spin"
                        data-icon="inline-start"
                      />
                    )}
                    {t("sendResetLink")}
                  </Button>
                </Field>
                <Honeypot />
              </FieldGroup>
            </form>
          )}
        </TabsContent>

        {/* ── Slug ──────────────────────────────────────────────────────── */}
        <TabsContent value="slug" className="pt-2">
          {pickedSent ? (
            <SuccessNote
              title={t("forgotEmailSentTitle")}
              body={t("forgotEmailSentDesc")}
            />
          ) : candidates !== null ? (
            <div className="flex flex-col gap-3">
              {candidates.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  {t("forgotSlugNoMatch")}
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {t("forgotSlugPickHint")}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {candidates.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => pickCandidate(c)}
                        disabled={pickLoading !== null}
                        className={cn(
                          "group flex items-center justify-between gap-3 rounded-lg border bg-card p-3 text-start transition-colors",
                          "hover:border-primary/40 hover:bg-muted/40",
                          "disabled:cursor-not-allowed disabled:opacity-60",
                          pickLoading === c.id && "border-primary/60",
                        )}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-sm">
                            {c.masked}
                          </span>
                          <span className="text-[10px] uppercase text-muted-foreground">
                            {c.role === "owner"
                              ? t("forgotRoleOwner")
                              : t("forgotRoleMember")}
                          </span>
                        </div>
                        {pickLoading === c.id ? (
                          <HugeiconsIcon
                            icon={Loading03Icon}
                            strokeWidth={2}
                            className="size-4 animate-spin"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground group-hover:text-foreground">
                            {t("sendResetLink")} →
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCandidates(null)
                  setSlug("")
                }}
                disabled={pickLoading !== null}
              >
                <HugeiconsIcon
                  icon={ArrowLeft01Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("forgotSlugTryAnother")}
              </Button>
            </div>
          ) : (
            <form onSubmit={lookupBySlug}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="slug">{t("forgotSlugLabel")}</FieldLabel>
                  <Input
                    id="slug"
                    name="slug"
                    placeholder="acme"
                    value={slug}
                    onChange={(e) =>
                      setSlug(
                        (e.target as HTMLInputElement).value
                          .trim()
                          .toLowerCase(),
                      )
                    }
                    required
                    disabled={slugLoading}
                    autoComplete="organization"
                  />
                  <FieldDescription>
                    {t("forgotBySlugHint")}
                  </FieldDescription>
                </Field>
                <Field>
                  <Button type="submit" disabled={slugLoading || !slug.trim()}>
                    {slugLoading && (
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        strokeWidth={2}
                        className="animate-spin"
                        data-icon="inline-start"
                      />
                    )}
                    {t("forgotSlugLookup")}
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          )}
        </TabsContent>
      </Tabs>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="underline underline-offset-4">
          {t("forgotBackToLogin")}
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
