"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useRouter, usePathname } from "@workspace/auth/i18n/routing"
import { useSession } from "@workspace/auth/client/auth-client"
import { motion } from "framer-motion"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, Tick02Icon, SentIcon, Loading03Icon } from "@hugeicons/core-free-icons"
import { TurnstileWidget, isTurnstileEnabled } from "@workspace/auth/components/turnstile-widget"
import { Logo } from "@workspace/console/components/shared/logo"
import { LanguageCombobox } from "@workspace/console/components/shared/language-combobox"
import { ParallaxWallpaper } from "../landing/v2/primitives/parallax-wallpaper"
import { GlassPanel } from "../landing/v2/primitives/glass-panel"
import { Magnetic } from "../landing/v2/primitives/magnetic"
import { RevealEmail } from "./reveal-email"
import { CONTACT_CATEGORIES } from "@/lib/contact"

const LOCALES = ["en", "tr"] as const
const EASE = [0.21, 0.47, 0.32, 0.98] as const
const inputCls =
  "w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none transition-colors focus:border-white/35"

/**
 * /[lang]/contact — profesyonel iletişim sayfası. Sorun yaşayan / soru soran
 * kullanıcılar için Turnstile-korumalı form (POST /api/contact/messages →
 * admin gelen-kutusu). Yatırımcılar/basın için Turnstile-gated e-posta seçeneği
 * (RevealEmail). Login'liyse ad/e-posta otomatik dolar. Landing dark-aurora dili.
 */
export function ContactPageContent({ lang }: { lang: string }) {
  const t = useTranslations("contact")
  const router = useRouter()
  const pathname = usePathname()
  const { data: session } = useSession()

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [category, setCategory] = useState<string>("general")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Turnstile başarısız gönderimde tek kullanımlık token yanar → widget'ı
  // remount ederek (key) yeni token aldır, aksi halde form kilitlenir.
  const [captchaKey, setCaptchaKey] = useState(0)

  // Login'liyse ad + e-postayı otomatik doldur (bir kez).
  useEffect(() => {
    const u = session?.user
    if (!u) return
    setName((v) => v || u.name || "")
    setEmail((v) => v || u.email || "")
  }, [session])

  const needsToken = isTurnstileEnabled()
  const canSubmit = name.trim() && message.trim().length >= 2 && (!needsToken || token) && !busy

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/contact/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, category, subject, message, token, locale: lang }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || t("form.error"))
      setSent(true)
    } catch (e) {
      // Hata göster + Turnstile'ı sıfırla (yanmış token) → kullanıcı tekrar dener
      setBusy(false)
      setToken(null)
      setError(e instanceof Error ? e.message : t("form.error"))
      setCaptchaKey((k) => k + 1)
    }
  }

  return (
    <div className="lv2-root dark relative min-h-screen bg-[#0A0A0A] text-white antialiased">
      <style>{`.lv2-root ::selection{background:rgba(255,23,68,0.85);color:#fff;-webkit-text-fill-color:#fff;}`}</style>
      <ParallaxWallpaper />

      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0A0A0A]/75 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-6">
          <Link href={`/${lang}`} className="flex items-center gap-2"><Logo size="md" /></Link>
          <div className="ml-auto flex items-center gap-2">
            <LanguageCombobox
              current={lang}
              locales={LOCALES}
              onSelect={(l) => router.replace(pathname, { locale: l as (typeof LOCALES)[number] })}
              className="border-white/15 bg-white/[0.04] text-white/80 hover:bg-white/[0.08]"
            />
            <Link href={`/${lang}`} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-1.5 text-sm text-white/80 transition-colors hover:border-white/30 hover:text-white">
              <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" strokeWidth={2} />
              {t("back")}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-24">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{t("form.title")}</h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-white/55">{t("form.subtitle")}</p>
        </motion.div>

        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
          {/* Form */}
          <GlassPanel className="p-6 sm:p-8">
            {sent ? (
              <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                  <HugeiconsIcon icon={Tick02Icon} className="size-7" strokeWidth={2.5} />
                </span>
                <h2 className="text-xl font-semibold">{t("form.sentTitle")}</h2>
                <p className="max-w-sm text-sm text-white/55">{t("form.sentBody")}</p>
              </div>
            ) : (
              <form
                onSubmit={(e) => { e.preventDefault(); void submit() }}
                className="flex flex-col gap-4"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={t("form.name")}>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("form.namePh")} className={inputCls} maxLength={120} required />
                  </Field>
                  <Field label={t("form.email")} hint={t("form.emailOptional")}>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("form.emailPh")} className={inputCls} maxLength={200} />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={t("form.category")}>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className={inputCls + " appearance-none"}
                    >
                      {CONTACT_CATEGORIES.map((c) => (
                        <option key={c} value={c} className="bg-[#0A0A0A] text-white">{t(`categories.${c}`)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("form.subject")}>
                    <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("form.subjectPh")} className={inputCls} maxLength={200} />
                  </Field>
                </div>
                <Field label={t("form.message")}>
                  <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("form.messagePh")} rows={6} className={inputCls + " resize-none"} maxLength={5000} required />
                </Field>

                {needsToken ? (
                  <div className="w-full max-w-[320px]">
                    <TurnstileWidget key={captchaKey} theme="dark" onToken={setToken} onClear={() => setToken(null)} />
                  </div>
                ) : null}

                {error ? (
                  <p className="text-sm text-rose-400" role="alert">{error}</p>
                ) : null}

                <div className="flex justify-end">
                  <Magnetic>
                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-black shadow-[0_8px_40px_-10px_rgba(255,255,255,0.4)] transition-shadow hover:shadow-[0_10px_48px_-8px_rgba(255,255,255,0.55)] active:scale-[0.97] disabled:opacity-50"
                    >
                      <HugeiconsIcon icon={busy ? Loading03Icon : SentIcon} className={"size-4" + (busy ? " animate-spin" : "")} strokeWidth={2} />
                      {busy ? t("form.sending") : t("form.submit")}
                    </button>
                  </Magnetic>
                </div>
              </form>
            )}
          </GlassPanel>

          {/* Yatırımcılar / basın — e-posta seçeneği */}
          <div className="flex flex-col gap-6">
            <GlassPanel className="p-6 sm:p-8">
              <h3 className="text-lg font-semibold">{t("investors.title")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/55">{t("investors.body")}</p>
              <div className="mt-5">
                <RevealEmail tone="dark" />
              </div>
            </GlassPanel>
          </div>
        </div>
      </main>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-white/50">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-white/35">{hint}</span> : null}
    </label>
  )
}
