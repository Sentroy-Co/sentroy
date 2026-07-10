"use client"

import { useState } from "react"
import { TurnstileWidget } from "./turnstile-widget"

type Channel = "email" | "telegram" | "webhook"

const TOPIC_GROUPS: Record<string, string[]> = {
  incidents: ["incident.opened", "incident.updated", "incident.resolved"],
  maintenance: [
    "maintenance.scheduled",
    "maintenance.reminder",
    "maintenance.started",
    "maintenance.completed",
  ],
}

interface Props {
  pageSlug: string
  accent: string
  components: Array<{ id: string; name: string }>
  turnstileSiteKey?: string | null
  strings: {
    triggerLabel: string
    title: string
    description: string
    closeLabel: string
    submit: string
    submitting: string
    successTitle: string
    successEmail: string
    successTelegram: string
    successWebhook: string
    alreadyBody: string
    errorPrefix: string
    channelEmail: string
    channelTelegram: string
    channelWebhook: string
    emailLabel: string
    emailPlaceholder: string
    telegramChatIdLabel: string
    telegramChatIdHint: string
    telegramBotTokenLabel: string
    telegramBotTokenHint: string
    telegramBotTokenPlaceholder: string
    webhookUrlLabel: string
    webhookUrlPlaceholder: string
    webhookSecretShown: string
    topicSectionTitle: string
    topicAll: string
    topicIncidentsOnly: string
    topicMaintenanceOnly: string
    componentSectionTitle: string
    componentSectionHint: string
  }
}

export function SubscribeDialog({
  pageSlug,
  accent,
  components,
  turnstileSiteKey,
  strings,
}: Props) {
  const [open, setOpen] = useState(false)
  const [channel, setChannel] = useState<Channel>("email")

  // Form state
  const [email, setEmail] = useState("")
  const [telegramChatId, setTelegramChatId] = useState("")
  const [telegramBotToken, setTelegramBotToken] = useState("")
  const [webhookUrl, setWebhookUrl] = useState("")

  const [topicMode, setTopicMode] = useState<"all" | "incidents" | "maintenance">("all")
  const [selectedComponents, setSelectedComponents] = useState<Set<string>>(new Set())

  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<
    | { kind: "success"; message: string; webhookSecret?: string }
    | { kind: "already" }
    | { kind: "error"; message: string }
    | null
  >(null)

  function toggleComponent(id: string) {
    setSelectedComponents((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function resetForm() {
    setChannel("email")
    setEmail("")
    setTelegramChatId("")
    setTelegramBotToken("")
    setWebhookUrl("")
    setTopicMode("all")
    setSelectedComponents(new Set())
    setResult(null)
  }

  function closeDialog() {
    setOpen(false)
    setTimeout(resetForm, 200)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setResult(null)
    try {
      const topicFilter =
        topicMode === "all" ? [] : TOPIC_GROUPS[topicMode] ?? []
      const componentFilter = Array.from(selectedComponents)
      const body: Record<string, unknown> = {
        type: channel,
        componentFilter,
        topicFilter,
      }
      if (channel === "email") body.email = email.trim()
      if (channel === "telegram") {
        body.telegram = {
          chatId: telegramChatId.trim(),
          botToken: telegramBotToken.trim(),
        }
      }
      if (channel === "webhook") body.webhookUrl = webhookUrl.trim()
      if (turnstileToken) body.cfTurnstileToken = turnstileToken

      const res = await fetch(`/api/v1/status/${pageSlug}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = (await res.json().catch(() => ({}))) as {
        message?: string
        error?: string
        webhookSecret?: string
      }
      if (!res.ok) {
        setResult({
          kind: "error",
          message: json.error ?? `HTTP ${res.status}`,
        })
        return
      }
      if (json.message === "already subscribed") {
        setResult({ kind: "already" })
        return
      }
      setResult({
        kind: "success",
        message:
          channel === "email"
            ? strings.successEmail
            : channel === "telegram"
              ? strings.successTelegram
              : strings.successWebhook,
        webhookSecret: json.webhookSecret,
      })
    } catch (err) {
      setResult({
        kind: "error",
        message: err instanceof Error ? err.message : "network error",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center justify-center rounded-md px-3.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        style={{ background: accent }}
      >
        {strings.triggerLabel}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeDialog}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b px-5 py-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">{strings.title}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {strings.description}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                aria-label={strings.closeLabel}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="h-4 w-4"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-5 py-4">
              {result?.kind === "success" ? (
                <div className="space-y-3 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      className="h-6 w-6"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-semibold">{strings.successTitle}</h3>
                  <p className="text-xs text-muted-foreground">{result.message}</p>
                  {result.webhookSecret ? (
                    <div className="rounded-md border bg-muted/40 px-3 py-2 text-start">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {strings.webhookSecretShown}
                      </p>
                      <code className="mt-1 block break-all font-mono text-[11px]">
                        {result.webhookSecret}
                      </code>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={closeDialog}
                    className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-xs hover:bg-muted"
                  >
                    {strings.closeLabel}
                  </button>
                </div>
              ) : result?.kind === "already" ? (
                <div className="space-y-3 text-center">
                  <p className="text-sm">{strings.alreadyBody}</p>
                  <button
                    type="button"
                    onClick={closeDialog}
                    className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-xs hover:bg-muted"
                  >
                    {strings.closeLabel}
                  </button>
                </div>
              ) : (
                <form onSubmit={submit} className="grid gap-3">
                  {/* Channel tabs */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      { key: "email", label: strings.channelEmail },
                      { key: "telegram", label: strings.channelTelegram },
                      { key: "webhook", label: strings.channelWebhook },
                    ] as const).map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setChannel(opt.key)}
                        className={`rounded-md border px-3 py-2 text-xs font-medium transition ${channel === opt.key ? "border-foreground bg-foreground text-background" : "hover:bg-muted"}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Per-channel fields */}
                  {channel === "email" ? (
                    <div className="grid gap-1.5">
                      <label className="text-[11px] font-medium">
                        {strings.emailLabel}
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={strings.emailPlaceholder}
                        required
                        className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/30"
                      />
                    </div>
                  ) : channel === "telegram" ? (
                    <div className="grid gap-2">
                      <div className="grid gap-1.5">
                        <label className="text-[11px] font-medium">
                          {strings.telegramChatIdLabel}
                        </label>
                        <input
                          value={telegramChatId}
                          onChange={(e) => setTelegramChatId(e.target.value)}
                          placeholder="123456789 or -100…"
                          required
                          className="h-9 rounded-md border bg-background px-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring/30"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          {strings.telegramChatIdHint}
                        </p>
                      </div>
                      <div className="grid gap-1.5">
                        <label className="text-[11px] font-medium">
                          {strings.telegramBotTokenLabel}
                        </label>
                        <input
                          value={telegramBotToken}
                          onChange={(e) => setTelegramBotToken(e.target.value)}
                          placeholder={strings.telegramBotTokenPlaceholder}
                          type="password"
                          required
                          className="h-9 rounded-md border bg-background px-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring/30"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          {strings.telegramBotTokenHint}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-1.5">
                      <label className="text-[11px] font-medium">
                        {strings.webhookUrlLabel}
                      </label>
                      <input
                        type="url"
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        placeholder={strings.webhookUrlPlaceholder}
                        required
                        className="h-9 rounded-md border bg-background px-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring/30"
                      />
                    </div>
                  )}

                  {/* Topic filter */}
                  <div className="grid gap-1.5 rounded-md border bg-muted/30 px-3 py-2">
                    <p className="text-[11px] font-medium">
                      {strings.topicSectionTitle}
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([
                        { key: "all", label: strings.topicAll },
                        { key: "incidents", label: strings.topicIncidentsOnly },
                        { key: "maintenance", label: strings.topicMaintenanceOnly },
                      ] as const).map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setTopicMode(opt.key)}
                          className={`rounded-md border px-2.5 py-1.5 text-[11px] transition ${topicMode === opt.key ? "border-foreground bg-foreground text-background" : "hover:bg-muted"}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Component filter */}
                  {components.length > 0 ? (
                    <div className="grid gap-1.5 rounded-md border bg-muted/30 px-3 py-2">
                      <p className="text-[11px] font-medium">
                        {strings.componentSectionTitle}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {strings.componentSectionHint}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {components.map((c) => {
                          const active = selectedComponents.has(c.id)
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => toggleComponent(c.id)}
                              className={`rounded-md border px-2 py-1 text-[11px] transition ${active ? "border-foreground bg-foreground text-background" : "hover:bg-muted"}`}
                            >
                              {c.name}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}

                  {turnstileSiteKey ? (
                    <TurnstileWidget
                      siteKey={turnstileSiteKey}
                      onToken={setTurnstileToken}
                    />
                  ) : null}

                  {result?.kind === "error" ? (
                    <p className="text-[11px] text-red-600 dark:text-red-400">
                      {strings.errorPrefix}: {result.message}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={
                      submitting || (turnstileSiteKey ? !turnstileToken : false)
                    }
                    className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ background: accent }}
                  >
                    {submitting ? strings.submitting : strings.submit}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
