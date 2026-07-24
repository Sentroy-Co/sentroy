"use client"

import { useEffect, useState, type RefObject } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { Mail01Icon, Loading03Icon, ShieldKeyIcon } from "@hugeicons/core-free-icons"
import { TurnstileWidget, isTurnstileEnabled } from "@workspace/auth/components/turnstile-widget"

type Stage = "idle" | "challenge" | "verifying" | "done" | "error"

/**
 * Statik sayfa içeriğindeki korumalı e-postaları (`.sp-email` placeholder span'leri)
 * Cloudflare Turnstile geçilince açığa çıkarır. Adresler public GET yanıtında
 * YOK — buton → Turnstile → POST /api/pages/:slug/reveal-emails → sunucu doğrular,
 * adresleri döner; span'ler `mailto:` linkiyle DOM'da doldurulur (React içeriğe
 * dokunmaz, dangerouslySetInnerHTML). [containerRef] içerik div'ini işaret eder.
 */
export function ProtectedEmailsGate({
  slug,
  lang,
  containerRef,
}: {
  slug: string
  lang: string
  containerRef: RefObject<HTMLElement | null>
}) {
  const t = useTranslations("contact")
  const [count, setCount] = useState(0)
  const [stage, setStage] = useState<Stage>("idle")

  useEffect(() => {
    // İçerik render edildikten sonra korumalı e-posta sayısı.
    const spans = containerRef.current?.querySelectorAll(".sp-email")
    setCount(spans?.length ?? 0)
  }, [containerRef])

  function fill(emails: string[]) {
    const spans = containerRef.current?.querySelectorAll<HTMLElement>(".sp-email")
    spans?.forEach((span) => {
      const idx = Number(span.getAttribute("data-sp-idx"))
      const email = emails[idx]
      if (!email) return
      // DOM API (createElement/textContent) → XSS yok; e-posta zaten sunucudan.
      const a = document.createElement("a")
      a.href = `mailto:${email}`
      a.textContent = email
      a.className = "font-medium underline underline-offset-2"
      span.replaceWith(a)
    })
  }

  async function submit(token: string | null) {
    setStage("verifying")
    try {
      const res = await fetch(`/api/pages/${slug}/reveal-emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, lang }),
      })
      const json = (await res.json()) as { data?: { emails?: string[] } }
      if (!res.ok) {
        setStage("error")
        return
      }
      fill(json.data?.emails ?? [])
      setStage("done")
    } catch {
      setStage("error")
    }
  }

  function begin() {
    if (!isTurnstileEnabled()) {
      void submit(null)
      return
    }
    setStage("challenge")
  }

  if (count === 0 || stage === "done") return null

  return (
    <div className="mt-8 rounded-xl border border-border bg-muted/30 p-4">
      {stage === "challenge" ? (
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <HugeiconsIcon icon={ShieldKeyIcon} className="size-3.5" strokeWidth={2} />
            {t("reveal.humanCheck")}
          </div>
          <div className="w-full max-w-[320px]">
            <TurnstileWidget theme="auto" onToken={(tok) => void submit(tok)} />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {count === 1 ? t("reveal.protectedOne") : t("reveal.protectedMany", { count })}
          </p>
          <button
            type="button"
            onClick={begin}
            disabled={stage === "verifying"}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-70"
          >
            <HugeiconsIcon
              icon={stage === "verifying" ? Loading03Icon : Mail01Icon}
              className={stage === "verifying" ? "size-4 animate-spin" : "size-4"}
              strokeWidth={2}
            />
            {stage === "verifying" ? t("reveal.verifying") : t("reveal.button")}
          </button>
        </div>
      )}
      {stage === "error" ? (
        <p className="mt-2 text-xs text-red-500">{t("reveal.error")}</p>
      ) : null}
    </div>
  )
}
