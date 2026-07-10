"use client"

import { useEffect, useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import { useSearchParams } from "next/navigation"
import { Link } from "@workspace/auth/i18n/routing"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Loading03Icon,
  CheckmarkCircle02Icon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons"

type Status = "verifying" | "success" | "expired" | "missing"

export function VerifyEmailLanding() {
  const t = useTranslations("auth")
  const locale = useLocale()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  const [status, setStatus] = useState<Status>(token ? "verifying" : "missing")

  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        // Better-auth'un GET endpoint'i — callbackURL geçmediğimiz için
        // 302 yerine JSON döner; 200 = doğrulandı + (autoSignIn aktifse)
        // Set-Cookie ile session başladı.
        const res = await fetch(
          `/api/auth/verify-email?token=${encodeURIComponent(token)}`,
          { credentials: "include" },
        )
        if (cancelled) return
        if (res.ok) {
          setStatus("success")
          // Session cookie set edildi — 2 sn sonra dashboard'a gönder.
          setTimeout(() => {
            window.location.href = `/${locale}/d`
          }, 1800)
        } else {
          setStatus("expired")
        }
      } catch {
        if (!cancelled) setStatus("expired")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, locale])

  if (status === "verifying") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted/20 p-6 text-center">
        <HugeiconsIcon
          icon={Loading03Icon}
          strokeWidth={2}
          className="size-6 animate-spin text-muted-foreground"
        />
        <span className="text-sm font-medium">{t("verifyEmailVerifying")}</span>
      </div>
    )
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          strokeWidth={2}
          className="size-7 text-emerald-600 dark:text-emerald-400"
        />
        <span className="text-base font-semibold">
          {t("verifyEmailSuccessTitle")}
        </span>
        <span className="text-sm text-muted-foreground">
          {t("verifyEmailSuccessDesc")}
        </span>
      </div>
    )
  }

  // missing | expired
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-6 text-center">
      <HugeiconsIcon
        icon={AlertCircleIcon}
        strokeWidth={2}
        className="size-7 text-red-600 dark:text-red-400"
      />
      <span className="text-base font-semibold">
        {status === "missing"
          ? t("verifyEmailMissingTitle")
          : t("verifyEmailExpiredTitle")}
      </span>
      <span className="text-sm text-muted-foreground">
        {status === "missing"
          ? t("verifyEmailMissingDesc")
          : t("verifyEmailExpiredDesc")}
      </span>
      <Link
        href="/verify-email-pending"
        className="mt-2 text-sm font-medium underline underline-offset-4"
      >
        {t("verifyEmailResend")}
      </Link>
    </div>
  )
}
