"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"

const WEBHOOK_EVENTS = [
  "sent",
  "bounced",
  "failed",
  "opened",
  "clicked",
  "unsubscribed",
] as const

type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

const SAMPLE_PAYLOADS: Record<WebhookEvent, Record<string, unknown>> = {
  sent: {
    mailLogId: "ml_abc",
    messageId: "<sample@mail.example.com>",
    to: "user@example.com",
    from: "info@example.com",
    subject: "Welcome",
  },
  bounced: {
    mailLogId: "ml_abc",
    to: "user@example.com",
    bounceType: "hard",
    bounceReason: "5.1.1 user unknown",
  },
  failed: {
    mailLogId: "ml_abc",
    to: "user@example.com",
    error: "Template render failure",
  },
  opened: {
    mailLogId: "ml_abc",
    to: "user@example.com",
    openedAt: new Date().toISOString(),
    userAgent: "Mozilla/5.0",
  },
  clicked: {
    mailLogId: "ml_abc",
    to: "user@example.com",
    url: "https://example.com/landing",
    clickedAt: new Date().toISOString(),
  },
  unsubscribed: {
    mailLogId: "ml_abc",
    email: "user@example.com",
    unsubscribedAt: new Date().toISOString(),
  },
}

type Delivery = {
  id: string
  webhookId: string
  kind: "test" | "replay"
  event: string
  url: string
  responseStatus: number
  responseBody: string
  durationMs: number
  status: "success" | "failed" | "pending"
  error?: string
  replayOf?: string
  triggeredBy: string
  payload: Record<string, unknown>
  createdAt: string
}

type DispatchResult = {
  deliveryId: string
  responseStatus: number
  durationMs: number
  status: "success" | "failed"
  error?: string
}

const STATUS_TONE: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  failed: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
}

export type WebhookTestDialogTarget = {
  id: string
  url: string
}

export function WebhookTestDialog({
  slug,
  webhook,
  open,
  onOpenChange,
}: {
  slug: string
  webhook: WebhookTestDialogTarget | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const t = useTranslations("webhooks")

  const [tab, setTab] = useState<"test" | "deliveries">("test")
  const [event, setEvent] = useState<WebhookEvent>("sent")
  const [payloadText, setPayloadText] = useState<string>(() =>
    JSON.stringify(SAMPLE_PAYLOADS.sent, null, 2),
  )
  const [sending, setSending] = useState(false)
  const [lastResult, setLastResult] = useState<DispatchResult | null>(null)
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [deliveriesLoading, setDeliveriesLoading] = useState(false)
  const [openDeliveryId, setOpenDeliveryId] = useState<string | null>(null)
  const [openDelivery, setOpenDelivery] = useState<Delivery | null>(null)
  const [replaying, setReplaying] = useState<string | null>(null)

  // Reset state whenever the dialog target changes
  useEffect(() => {
    if (!webhook) return
    setTab("test")
    setEvent("sent")
    setPayloadText(JSON.stringify(SAMPLE_PAYLOADS.sent, null, 2))
    setLastResult(null)
    setOpenDeliveryId(null)
    setOpenDelivery(null)
  }, [webhook?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Repopulate sample payload when the user picks a new event — but
  // only if the textarea still contains the *previous* sample (i.e. the
  // user hasn't started editing). Avoids clobbering hand-edited JSON.
  useEffect(() => {
    setPayloadText((prev) => {
      const stillSample = WEBHOOK_EVENTS.some(
        (e) => prev.trim() === JSON.stringify(SAMPLE_PAYLOADS[e], null, 2),
      )
      if (!stillSample) return prev
      return JSON.stringify(SAMPLE_PAYLOADS[event], null, 2)
    })
  }, [event])

  const apiBase = useMemo(
    () => (webhook ? `/api/companies/${slug}/webhooks/${webhook.id}` : ""),
    [slug, webhook],
  )

  const loadDeliveries = useCallback(async () => {
    if (!apiBase) return
    setDeliveriesLoading(true)
    try {
      const res = await fetch(`${apiBase}/deliveries?limit=50`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load")
      const data = json.data as { items?: Delivery[] }
      setDeliveries(data.items ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load deliveries")
    } finally {
      setDeliveriesLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    if (open && tab === "deliveries") void loadDeliveries()
  }, [open, tab, loadDeliveries])

  const sendTest = useCallback(async () => {
    if (!apiBase) return
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(payloadText)
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("not object")
      }
    } catch {
      toast.error(t("invalidJson"))
      return
    }
    setSending(true)
    setLastResult(null)
    try {
      const res = await fetch(`${apiBase}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, payload: parsed }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to send")
      const result = json.data as DispatchResult
      setLastResult(result)
      // Refresh deliveries silently so the new row is ready when user switches tab
      void loadDeliveries()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send test")
    } finally {
      setSending(false)
    }
  }, [apiBase, event, payloadText, loadDeliveries, t])

  const openDeliveryDetail = useCallback(
    async (id: string) => {
      if (!apiBase) return
      setOpenDeliveryId(id)
      setOpenDelivery(null)
      try {
        const res = await fetch(`${apiBase}/deliveries/${id}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Failed to load")
        setOpenDelivery(json.data as Delivery)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load delivery")
        setOpenDeliveryId(null)
      }
    },
    [apiBase],
  )

  const replayDelivery = useCallback(
    async (id: string) => {
      if (!apiBase) return
      setReplaying(id)
      try {
        const res = await fetch(`${apiBase}/deliveries/${id}/replay`, {
          method: "POST",
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Failed to replay")
        toast.success(t("replayed"))
        await loadDeliveries()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to replay")
      } finally {
        setReplaying(null)
      }
    },
    [apiBase, loadDeliveries, t],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("testWebhook")}</DialogTitle>
          <DialogDescription className="truncate font-mono text-[12.5px]">
            {webhook?.url ?? ""}
          </DialogDescription>
        </DialogHeader>

        {/* Tab strip */}
        <div className="flex items-center gap-1 border-b border-border">
          {(["test", "deliveries"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "relative px-3 py-2 text-sm font-medium transition",
                tab === key
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {key === "test" ? t("test") : t("deliveries")}
              {tab === key ? (
                <span className="absolute bottom-0 left-0 right-0 h-px bg-foreground" />
              ) : null}
            </button>
          ))}
        </div>

        {/* Test tab */}
        {tab === "test" ? (
          <div className="space-y-4">
            <p className="text-[13px] text-muted-foreground">
              {t("testDescription")}
            </p>

            <div>
              <label className="mb-1.5 block font-mono text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("event")}
              </label>
              <Select
                value={event}
                onValueChange={(v) => v && setEvent(v as WebhookEvent)}
              >
                <SelectTrigger className="w-full">
                  <span className="font-mono text-[12.5px]">{event}</span>
                </SelectTrigger>
                <SelectContent>
                  {WEBHOOK_EVENTS.map((e) => (
                    <SelectItem key={e} value={e}>
                      <span className="font-mono">{e}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block font-mono text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("payload")}
              </label>
              <textarea
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
                spellCheck={false}
                rows={Math.max(8, payloadText.split("\n").length + 1)}
                className="w-full rounded-md border border-border bg-muted/40 p-3 font-mono text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={sendTest} disabled={sending}>
                {sending ? (
                  <>
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      strokeWidth={2}
                      className="animate-spin"
                      data-icon="inline-start"
                    />
                    {t("sending")}
                  </>
                ) : (
                  t("send")
                )}
              </Button>
            </div>

            {lastResult ? (
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("result")}
                  </span>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "font-mono text-[10.5px]",
                      STATUS_TONE[lastResult.status],
                    )}
                  >
                    {lastResult.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono text-[12px]">
                  <div className="text-muted-foreground">{t("responseStatus")}</div>
                  <div className="text-foreground">{lastResult.responseStatus}</div>
                  <div className="text-muted-foreground">{t("duration")}</div>
                  <div className="text-foreground">{lastResult.durationMs}ms</div>
                </div>
                {lastResult.error ? (
                  <div className="mt-2 text-[12.5px] text-rose-600 dark:text-rose-400">
                    {lastResult.error}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Deliveries tab */}
        {tab === "deliveries" ? (
          <div className="space-y-3">
            {deliveriesLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : deliveries.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-[13.5px] text-muted-foreground">
                {t("noDeliveries")}
              </div>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {deliveries.map((d) => (
                  <li key={d.id} className="px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="secondary"
                        className={cn(
                          "font-mono text-[10px]",
                          STATUS_TONE[d.status],
                        )}
                      >
                        {d.status}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="font-mono text-[10px] text-muted-foreground"
                      >
                        {d.kind === "replay" ? t("kindReplay") : t("kindTest")}
                      </Badge>
                      <span className="flex-1 truncate font-mono text-[12px] text-foreground">
                        {d.event}
                      </span>
                      <span className="hidden font-mono text-[11px] text-muted-foreground sm:block">
                        {d.responseStatus} · {d.durationMs}ms
                      </span>
                      <span className="hidden text-[11px] text-muted-foreground sm:block">
                        {formatDistanceToNow(new Date(d.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDeliveryDetail(d.id)}
                          className="h-7 px-2 text-[12px]"
                        >
                          {t("viewDelivery")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={replaying === d.id}
                          onClick={() => replayDelivery(d.id)}
                          className="h-7 px-2 text-[12px]"
                        >
                          {replaying === d.id ? (
                            <HugeiconsIcon
                              icon={Loading03Icon}
                              strokeWidth={2}
                              className="size-3 animate-spin"
                            />
                          ) : (
                            t("replay")
                          )}
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {/* Inline detail dialog */}
        <Dialog
          open={openDeliveryId !== null}
          onOpenChange={(v) => {
            if (!v) {
              setOpenDeliveryId(null)
              setOpenDelivery(null)
            }
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("deliveryDetail")}</DialogTitle>
            </DialogHeader>
            {openDelivery ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-y-2 font-mono text-[12px]">
                  <span className="text-muted-foreground">{t("event")}</span>
                  <span className="text-foreground">{openDelivery.event}</span>
                  <span className="text-muted-foreground">{t("responseStatus")}</span>
                  <span className="text-foreground">
                    {openDelivery.responseStatus}
                  </span>
                  <span className="text-muted-foreground">{t("duration")}</span>
                  <span className="text-foreground">
                    {openDelivery.durationMs}ms
                  </span>
                  <span className="text-muted-foreground">{t("triggeredBy")}</span>
                  <span className="text-foreground">{openDelivery.triggeredBy}</span>
                </div>

                <div>
                  <div className="mb-1 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("request")}
                  </div>
                  <pre className="max-h-[200px] overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-[11.5px]">
                    {JSON.stringify(openDelivery.payload, null, 2)}
                  </pre>
                </div>

                <div>
                  <div className="mb-1 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("response")}
                  </div>
                  <pre className="max-h-[200px] overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-[11.5px]">
                    {openDelivery.responseBody || t("noResponse")}
                  </pre>
                </div>

                {openDelivery.error ? (
                  <div className="text-[12.5px] text-rose-600 dark:text-rose-400">
                    {openDelivery.error}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            )}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}
