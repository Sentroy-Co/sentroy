"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { formatDistanceToNow } from "date-fns"
import { Mail01Icon } from "@hugeicons/core-free-icons"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import {
  WidgetChooseState,
  WidgetErrorState,
  WidgetHeader,
  WidgetSpinner,
} from "./widget-ui"

const POLL_MS = 90_000
const MAIL_COLOR = "#3b82f6"

/**
 * Mail "Recent inbox" widget'ı — config'de seçilen mailbox'ın SON 5 maili
 * (from + subject + göreli zaman; okunmamış vurgulu). Veri kaynağı mevcut
 * mail app endpoint'i (core rewrite):
 *   GET /api/mail/companies/[slug]/inbox?mailbox=<email>&limit=5
 *   → { data: MessageSummary[] } (uid, subject, from{name,address}, date, seen)
 * Satır tıklaması → openApp("mail"). Mailbox seçilmemişse "Choose a mailbox"
 * boş durumu (⚙ config popover'ını açar).
 */

interface MessageRow {
  uid: number
  subject: string
  from?: { name?: string | null; address?: string | null } | null
  date: string
  seen: boolean
}

export function MailInboxWidgetContent({
  slug,
  config,
  refreshKey = 0,
  onOpenApp,
  onConfigure,
}: {
  slug: string
  config?: Record<string, unknown>
  /** Sağ-tık "Refresh widgets" sayacı — değişince yeniden fetch. */
  refreshKey?: number
  onOpenApp: (appId: string) => void
  onConfigure: () => void
}) {
  const t = useTranslations("os")
  const mailbox = typeof config?.mailbox === "string" ? config.mailbox : ""
  const [rows, setRows] = useState<MessageRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!mailbox) return
    let cancelled = false
    setRows(null)
    setFailed(false)
    const load = async () => {
      try {
        const res = await fetch(
          `/api/mail/companies/${slug}/inbox?mailbox=${encodeURIComponent(mailbox)}&limit=5&page=1`,
        )
        if (!res.ok) throw new Error(String(res.status))
        const json = (await res.json()) as { data?: unknown }
        if (cancelled) return
        setRows(Array.isArray(json.data) ? (json.data as MessageRow[]).slice(0, 5) : [])
        setFailed(false)
      } catch {
        if (!cancelled) setFailed(true)
      }
    }
    void load()
    const id = setInterval(() => void load(), POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [slug, mailbox, nonce, refreshKey])

  if (!mailbox) {
    return (
      <WidgetChooseState
        icon={Mail01Icon}
        color={MAIL_COLOR}
        label={t("widgetsHub.mail.chooseMailbox")}
        onConfigure={onConfigure}
      />
    )
  }

  return (
    <div className="p-3">
      <WidgetHeader icon={Mail01Icon} color={MAIL_COLOR} title={mailbox} />
      <div className="mt-2">
        {failed ? (
          <WidgetErrorState onRetry={() => setNonce((n) => n + 1)} />
        ) : !rows ? (
          <WidgetSpinner />
        ) : rows.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            {t("widgetsHub.mail.empty")}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {rows.map((m) => {
              let time = ""
              try {
                time = formatDistanceToNow(new Date(m.date), { addSuffix: true })
              } catch {
                /* geçersiz tarih — boş bırak */
              }
              const sender = m.from?.name || m.from?.address || "—"
              return (
                <li key={m.uid}>
                  <button
                    type="button"
                    onClick={() => onOpenApp("mail")}
                    className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-foreground/5"
                  >
                    <span
                      aria-label={m.seen ? undefined : t("widgetsHub.mail.unread")}
                      className={
                        "mt-1.5 size-1.5 shrink-0 rounded-full " +
                        (m.seen ? "bg-transparent" : "bg-primary")
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          className={
                            "truncate text-xs " +
                            (m.seen ? "font-normal text-foreground/80" : "font-semibold text-foreground")
                          }
                        >
                          {sender}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground/70">{time}</span>
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {m.subject || "—"}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

/**
 * Config formu — mailbox seçimi. Liste mevcut mail endpoint'inden:
 * GET /api/mail/companies/[slug]/mailboxes → { data: [{ email, ... }] }.
 * SelectValue KULLANILMAZ (repo kuralı) — trigger'da manuel render.
 */
export function MailInboxConfig({
  slug,
  config,
  onChange,
}: {
  slug: string
  config?: Record<string, unknown>
  onChange: (patch: Record<string, unknown>) => void
}) {
  const t = useTranslations("os")
  const selected = typeof config?.mailbox === "string" ? config.mailbox : ""
  const [options, setOptions] = useState<string[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const res = await fetch(`/api/mail/companies/${slug}/mailboxes`)
      if (!res.ok) throw new Error(String(res.status))
      const json = (await res.json()) as { data?: unknown }
      const list = Array.isArray(json.data) ? (json.data as { email?: string }[]) : []
      setOptions(list.map((m) => m.email).filter((e): e is string => Boolean(e)))
    } catch {
      setFailed(true)
    }
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  if (failed) return <WidgetErrorState onRetry={() => void load()} />
  if (!options) return <WidgetSpinner />

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {t("widgetsHub.mail.mailbox")}
      </label>
      <Select value={selected || undefined} onValueChange={(v) => onChange({ mailbox: v })}>
        <SelectTrigger className="w-full">
          {selected ? (
            <span className="truncate">{selected}</span>
          ) : (
            <span className="text-muted-foreground">{t("widgetsHub.mail.chooseMailbox")}</span>
          )}
        </SelectTrigger>
        <SelectContent>
          {options.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              {t("widgetsHub.mail.empty")}
            </div>
          ) : (
            options.map((email) => (
              <SelectItem key={email} value={email}>
                {email}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  )
}
