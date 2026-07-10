"use client"

import { useCallback, useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Search01Icon,
  Copy01Icon,
  Calendar03Icon,
  Clock01Icon,
  Shield01Icon,
  GlobalIcon,
  ServerStack01Icon,
  Building02Icon,
  LinkSquare02Icon,
  CheckmarkCircle02Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons"

/**
 * WHOIS / domain sorgu aracı. RDAP (server route /api/whois) üzerinden kayıt
 * verisi çeker (WHOIS/RDAP CORS'suz) ve şık bir kartta gösterir: registrar,
 * tarihler (bitişe kalan gün + renk), EPP status, nameserver, DNSSEC, abuse.
 */

interface WhoisResult {
  domain: string
  ldhName: string
  registrar: { name: string | null; ianaId: string | null; url: string | null; abuseEmail: string | null; abusePhone: string | null } | null
  events: { registration: string | null; expiration: string | null; lastChanged: string | null; transfer: string | null }
  status: string[]
  nameservers: string[]
  dnssec: boolean | null
  registrantOrg: string | null
}

const EXAMPLES = ["google.com", "github.com", "vercel.com"]

export function WhoisTool() {
  const t = useTranslations("d")
  const locale = useLocale()
  const [domain, setDomain] = useState("")
  const [result, setResult] = useState<WhoisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const fmtDate = (iso: string | null) => {
    if (!iso) return "—"
    try {
      return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(new Date(iso))
    } catch {
      return iso
    }
  }

  const expiryInfo = (iso: string | null): { label: string; tone: "ok" | "warn" | "bad" } | null => {
    if (!iso) return null
    const ms = new Date(iso).getTime() - Date.now()
    const days = Math.round(ms / 86400000)
    if (days < 0) return { label: t("whoisExpired"), tone: "bad" }
    return { label: t("whoisDaysLeft", { n: days }), tone: days < 30 ? "bad" : days < 90 ? "warn" : "ok" }
  }

  const lookup = useCallback(async () => {
    const name = domain.trim()
    if (!name) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`/api/whois?domain=${encodeURIComponent(name)}`)
      const json = await res.json()
      if (!res.ok) {
        setError(
          json?.error === "invalid_domain"
            ? t("whoisInvalid")
            : json?.error === "not_found"
              ? t("whoisNotFound")
              : json?.error === "timeout"
                ? t("whoisTimeout")
                : t("whoisError"),
        )
        return
      }
      setResult(json as WhoisResult)
    } catch {
      setError(t("whoisError"))
    } finally {
      setLoading(false)
    }
  }, [domain, t])

  const copy = (text: string | null) => {
    if (!text) return
    void navigator.clipboard.writeText(text).then(() => toast.success(t("whoisCopied")))
  }

  const exp = result ? expiryInfo(result.events.expiration) : null

  return (
    <div className="mx-auto mt-8 flex max-w-4xl flex-col gap-5">
      {/* Sorgu çubuğu */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <HugeiconsIcon
              icon={GlobalIcon}
              strokeWidth={2}
              className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookup()}
              placeholder="example.com"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="h-12 w-full rounded-xl border bg-card pl-11 pr-4 font-mono text-sm outline-none transition-colors focus:border-primary"
            />
          </div>
          <button
            onClick={lookup}
            disabled={loading || !domain.trim()}
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-5" />
            {t("whoisLookup")}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("whoisExample")}</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => {
                setDomain(ex)
                setTimeout(lookup, 0)
              }}
              className="rounded-full border bg-card px-3 py-1 font-mono text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center gap-3 rounded-2xl border bg-card py-16 text-sm text-muted-foreground">
          <Spinner />
          {t("whoisLooking")}
        </div>
      ) : null}

      {/* Error */}
      <AnimatePresence>
        {error && !loading ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm text-destructive"
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-5 shrink-0" />
            {error}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Sonuç */}
      <AnimatePresence>
        {result && !loading ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            {/* Üst kart: domain + registrar + DNSSEC */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <HugeiconsIcon icon={GlobalIcon} strokeWidth={2} className="size-6" />
                </span>
                <div className="flex flex-col">
                  <span className="font-mono text-lg font-semibold lowercase">{result.ldhName}</span>
                  {result.registrar?.name ? (
                    <span className="text-sm text-muted-foreground">{result.registrar.name}</span>
                  ) : null}
                </div>
              </div>
              <span
                className={
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium " +
                  (result.dnssec ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground")
                }
              >
                <HugeiconsIcon icon={Shield01Icon} strokeWidth={2} className="size-4" />
                DNSSEC · {result.dnssec ? t("whoisDnssecOn") : t("whoisDnssecOff")}
              </span>
            </div>

            {/* Tarih kutucukları */}
            <div className="grid gap-3 sm:grid-cols-3">
              <DateTile icon={Calendar03Icon} label={t("whoisRegistered")} value={fmtDate(result.events.registration)} />
              <DateTile icon={Clock01Icon} label={t("whoisUpdated")} value={fmtDate(result.events.lastChanged)} />
              <DateTile
                icon={Calendar03Icon}
                label={t("whoisExpires")}
                value={fmtDate(result.events.expiration)}
                badge={exp ? { text: exp.label, tone: exp.tone } : undefined}
              />
            </div>

            {/* Registrar detay */}
            {result.registrar ? (
              <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("whoisRegistrar")}</span>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  {result.registrar.url ? (
                    <a
                      href={result.registrar.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                    >
                      {result.registrar.name ?? result.registrar.url}
                      <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={2} className="size-3.5" />
                    </a>
                  ) : (
                    <span className="font-medium">{result.registrar.name}</span>
                  )}
                  {result.registrar.ianaId ? (
                    <span className="text-muted-foreground">
                      {t("whoisIana")}: <span className="font-mono text-foreground">{result.registrar.ianaId}</span>
                    </span>
                  ) : null}
                </div>
                {result.registrar.abuseEmail || result.registrar.abusePhone ? (
                  <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
                    <span>{t("whoisAbuse")}:</span>
                    {result.registrar.abuseEmail ? (
                      <CopyChip text={result.registrar.abuseEmail} onCopy={copy} />
                    ) : null}
                    {result.registrar.abusePhone ? (
                      <CopyChip text={result.registrar.abusePhone} onCopy={copy} />
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* İki kolon: nameservers + status */}
            <div className="grid gap-4 md:grid-cols-2">
              {result.nameservers.length > 0 ? (
                <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
                  <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <HugeiconsIcon icon={ServerStack01Icon} strokeWidth={2} className="size-4" />
                    {t("whoisNameservers")}
                  </span>
                  <ul className="flex flex-col gap-1.5">
                    {result.nameservers.map((ns) => (
                      <li key={ns} className="flex items-center justify-between gap-2 font-mono text-sm">
                        <span className="truncate">{ns}</span>
                        <button onClick={() => copy(ns)} className="shrink-0 text-muted-foreground transition-colors hover:text-foreground">
                          <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {result.status.length > 0 ? (
                <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
                  <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="size-4" />
                    {t("whoisStatus")}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {result.status.map((s) => (
                      <span key={s} className="rounded-full bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Registrant org */}
            {result.registrantOrg ? (
              <div className="flex items-center gap-3 rounded-2xl border bg-card p-5">
                <HugeiconsIcon icon={Building02Icon} strokeWidth={2} className="size-5 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("whoisRegistrant")}</span>
                  <span className="text-sm font-medium">{result.registrantOrg}</span>
                </div>
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function DateTile({
  icon,
  label,
  value,
  badge,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any
  label: string
  value: string
  badge?: { text: string; tone: "ok" | "warn" | "bad" }
}) {
  const toneCls =
    badge?.tone === "bad"
      ? "bg-destructive/10 text-destructive"
      : badge?.tone === "warn"
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border bg-card p-4">
      <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <HugeiconsIcon icon={icon} strokeWidth={2} className="size-3.5" />
        {label}
      </span>
      <span className="text-base font-semibold">{value}</span>
      {badge ? <span className={"mt-0.5 w-fit rounded-full px-2 py-0.5 text-xs font-medium " + toneCls}>{badge.text}</span> : null}
    </div>
  )
}

function CopyChip({ text, onCopy }: { text: string; onCopy: (t: string) => void }) {
  return (
    <button
      onClick={() => onCopy(text)}
      className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 font-mono text-foreground transition-colors hover:bg-muted/70"
    >
      {text}
      <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} className="size-3" />
    </button>
  )
}

function Spinner() {
  return (
    <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, ease: "linear", duration: 0.8 }} className="inline-block size-5">
      <svg viewBox="0 0 24 24" fill="none" className="size-full">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </motion.span>
  )
}
