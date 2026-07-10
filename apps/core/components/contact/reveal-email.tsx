"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { Mail01Icon, Loading03Icon, ShieldKeyIcon } from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"
import { TurnstileWidget, isTurnstileEnabled } from "@workspace/auth/components/turnstile-widget"

type Stage = "idle" | "challenge" | "verifying" | "done" | "error"

/**
 * İletişim e-postasını YALNIZ Cloudflare Turnstile doğrulamasından sonra açığa
 * çıkarır. E-posta hiçbir zaman HTML/client bundle'ında bulunmaz — buton →
 * Turnstile → POST /api/contact/email → sunucu doğrular ve e-postayı döndürür.
 * Bot scraper'lar sayfadan e-posta toplayamaz. Turnstile widget'ı + doğrulama
 * login ile aynı altyapıyı kullanır (@workspace/auth).
 *
 * `tone`: "dark" (aurora/landing sayfaları) veya "light" (varsayılan).
 */
export function RevealEmail({
  tone = "light",
  className,
}: {
  tone?: "dark" | "light"
  className?: string
}) {
  const t = useTranslations("contact")
  const [stage, setStage] = useState<Stage>("idle")
  const [email, setEmail] = useState<string | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  async function submit(token: string | null) {
    setStage("verifying")
    setErrMsg(null)
    try {
      const res = await fetch("/api/contact/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
      const json = await res.json()
      if (!res.ok) {
        setErrMsg(res.status === 503 ? t("reveal.unavailable") : t("reveal.error"))
        setStage("error")
        return
      }
      setEmail((json as { data?: { email?: string } }).data?.email ?? null)
      setStage("done")
    } catch {
      setErrMsg(t("reveal.error"))
      setStage("error")
    }
  }

  function begin() {
    // Turnstile devre dışı (yerel dev / site key yok) → doğrudan sunucuya sor
    // (sunucu tarafı da devre dışıysa e-postayı döndürür; yine HTML'de değil).
    if (!isTurnstileEnabled()) {
      void submit(null)
      return
    }
    setStage("challenge")
  }

  const btnCls =
    tone === "dark"
      ? "inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black shadow-[0_8px_40px_-10px_rgba(255,255,255,0.4)] transition-shadow hover:shadow-[0_10px_48px_-8px_rgba(255,255,255,0.55)] active:scale-[0.97] disabled:opacity-70"
      : "inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 active:scale-[0.97] disabled:opacity-70"
  const emailCls =
    tone === "dark"
      ? "inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:border-white/40"
      : "inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-foreground/40"
  const hintCls = tone === "dark" ? "text-white/50" : "text-muted-foreground"
  const errCls = tone === "dark" ? "text-red-300" : "text-red-500"

  if (stage === "done" && email) {
    return (
      <a href={`mailto:${email}`} className={cn(emailCls, className)}>
        <HugeiconsIcon icon={Mail01Icon} className="size-4" strokeWidth={2} />
        {email}
      </a>
    )
  }

  if (stage === "challenge") {
    return (
      <div className={cn("flex flex-col items-center gap-3", className)}>
        <div className={cn("flex items-center gap-2 text-xs", hintCls)}>
          <HugeiconsIcon icon={ShieldKeyIcon} className="size-3.5" strokeWidth={2} />
          {t("reveal.humanCheck")}
        </div>
        <div className="w-full max-w-[320px]">
          <TurnstileWidget
            theme={tone === "dark" ? "dark" : "auto"}
            onToken={(tok) => void submit(tok)}
            onClear={() => setErrMsg(null)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <button type="button" onClick={begin} disabled={stage === "verifying"} className={btnCls}>
        <HugeiconsIcon
          icon={stage === "verifying" ? Loading03Icon : Mail01Icon}
          className={cn("size-4", stage === "verifying" && "animate-spin")}
          strokeWidth={2}
        />
        {stage === "verifying" ? t("reveal.verifying") : t("reveal.button")}
      </button>
      {stage === "error" && errMsg ? <p className={cn("text-xs", errCls)}>{errMsg}</p> : null}
    </div>
  )
}
