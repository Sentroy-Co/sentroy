"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useCompanyDataStore } from "@workspace/console/stores/company-data"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Notification01Icon,
  PlusSignIcon,
  Delete02Icon,
  Loading03Icon,
  PlayIcon,
} from "@hugeicons/core-free-icons"
import { WebhookTestDialog, type WebhookTestDialogTarget } from "./webhook-test-dialog"

import { PageTransition, EmptyState } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Switch } from "@workspace/ui/components/switch"
import { Input } from "@workspace/ui/components/input"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"

interface Webhook {
  id: string
  url: string
  events: string[]
  active: boolean
  domainId?: string
  domain?: string
}

const WEBHOOK_EVENTS = [
  "sent",
  "bounced",
  "failed",
  "opened",
  "clicked",
  "unsubscribed",
] as const

function mapSdkWebhook(raw: Record<string, unknown>): Webhook {
  return {
    id: raw.id as string,
    url: (raw.url ?? "") as string,
    events: (raw.events as string[]) ?? [],
    active: (raw.active as boolean) ?? true,
    domainId: raw.domainId as string | undefined,
    domain: raw.domain as string | undefined,
  }
}

export function WebhooksContent() {
  const t = useTranslations("webhooks")
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]

  const { domains } = useCompanyDataStore()

  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [testTarget, setTestTarget] = useState<WebhookTestDialogTarget | null>(null)

  // Create form state
  const [newUrl, setNewUrl] = useState("")
  const [newEvents, setNewEvents] = useState<string[]>([])
  const [newDomainId, setNewDomainId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const apiBase = `/api/companies/${slug}/webhooks`

  const fetchWebhooks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(apiBase)
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to load webhooks")
      }
      const list = (json.data as Record<string, unknown>[]) ?? []
      setWebhooks(list.map(mapSdkWebhook))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load webhooks"
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    if (domains.length > 0 && !newDomainId) {
      setNewDomainId(domains[0].id)
    }
  }, [domains, newDomainId])

  useEffect(() => {
    fetchWebhooks()
  }, [fetchWebhooks])

  async function handleCreate() {
    if (!newUrl.trim() || newEvents.length === 0 || !newDomainId) return
    setCreating(true)
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: newUrl.trim(),
          events: newEvents,
          domainId: newDomainId,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to create webhook")
      }
      const created = mapSdkWebhook(json.data as Record<string, unknown>)
      setWebhooks((prev) => [...prev, created])
      setNewUrl("")
      setNewEvents([])
      setShowCreateDialog(false)
      toast.success(t("webhookCreated"))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to create webhook"
      toast.error(message)
    } finally {
      setCreating(false)
    }
  }

  async function handleToggleActive(webhook: Webhook) {
    setTogglingId(webhook.id)
    try {
      const res = await fetch(`${apiBase}/${webhook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !webhook.active }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to update webhook")
      }
      setWebhooks((prev) =>
        prev.map((w) =>
          w.id === webhook.id ? { ...w, active: !webhook.active } : w
        )
      )
      toast.success(t("webhookUpdated"))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to update webhook"
      toast.error(message)
    } finally {
      setTogglingId(null)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`${apiBase}/${id}`, {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to delete webhook")
      }
      setWebhooks((prev) => prev.filter((w) => w.id !== id))
      setDeleteConfirmId(null)
      toast.success(t("webhookDeleted"))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to delete webhook"
      toast.error(message)
    } finally {
      setDeletingId(null)
    }
  }

  function toggleEvent(event: string) {
    setNewEvents((prev) =>
      prev.includes(event)
        ? prev.filter((e) => e !== event)
        : [...prev, event]
    )
  }

  function getDomainName(webhook: Webhook) {
    if (webhook.domain) return webhook.domain
    const found = domains.find((d) => d.id === webhook.domainId)
    return found?.name ?? webhook.domainId ?? "-"
  }

  if (loading) {
    return (
      <PageTransition className="flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="rounded-xl border">
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Button onClick={() => setShowCreateDialog(true)}>
          <HugeiconsIcon
            icon={PlusSignIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {t("createWebhook")}
        </Button>
      </div>

      {webhooks.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed">
          <EmptyState
            icon={<HugeiconsIcon icon={Notification01Icon} strokeWidth={1.5} />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              <Button onClick={() => setShowCreateDialog(true)}>
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("createWebhook")}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("url")}</TableHead>
                <TableHead>{t("events")}</TableHead>
                <TableHead>{t("domain")}</TableHead>
                <TableHead>{t("active")}</TableHead>
                <TableHead className="text-end">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {webhooks.map((webhook) => (
                <TableRow key={webhook.id}>
                  <TableCell className="max-w-[250px] truncate font-medium">
                    {webhook.url}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {webhook.events.map((event) => (
                        <Badge key={event} variant="secondary" className="text-xs">
                          {event}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{getDomainName(webhook)}</TableCell>
                  <TableCell>
                    <Switch
                      checked={webhook.active}
                      onCheckedChange={() => handleToggleActive(webhook)}
                      disabled={togglingId === webhook.id}
                      size="sm"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() =>
                          setTestTarget({ id: webhook.id, url: webhook.url })
                        }
                        title={t("test")}
                      >
                        <HugeiconsIcon icon={PlayIcon} strokeWidth={2} />
                        <span className="sr-only">{t("test")}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={deletingId === webhook.id}
                        onClick={() => setDeleteConfirmId(webhook.id)}
                      >
                        <HugeiconsIcon
                          icon={
                            deletingId === webhook.id
                              ? Loading03Icon
                              : Delete02Icon
                          }
                          strokeWidth={2}
                          className={
                            deletingId === webhook.id
                              ? "animate-spin"
                              : undefined
                          }
                        />
                        <span className="sr-only">{t("delete")}</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Webhook Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("createWebhook")}</DialogTitle>
            <DialogDescription>{t("createDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <Field>
              <FieldLabel>{t("url")}</FieldLabel>
              <Input
                placeholder="https://example.com/webhook"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                disabled={creating}
              />
            </Field>

            <Field>
              <FieldLabel>{t("domain")}</FieldLabel>
              <Select
                value={newDomainId ?? undefined}
                onValueChange={setNewDomainId}
              >
                <SelectTrigger>
                  <span className="truncate">{domains.find(d => d.id === newDomainId)?.name || t("selectDomain")}</span>
                </SelectTrigger>
                <SelectContent>
                  {domains.map((d) => (
                    <SelectItem key={d.id} value={d.id} label={d.name}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel>{t("events")}</FieldLabel>
              <div className="flex flex-col gap-2">
                {WEBHOOK_EVENTS.map((event) => (
                  <label
                    key={event}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={newEvents.includes(event)}
                      onCheckedChange={() => toggleEvent(event)}
                      disabled={creating}
                    />
                    {t(`event_${event}`)}
                  </label>
                ))}
              </div>
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              disabled={creating}
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                creating ||
                !newUrl.trim() ||
                newEvents.length === 0 ||
                !newDomainId
              }
            >
              {creating && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {t("createWebhook")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test + Deliveries Dialog */}
      <WebhookTestDialog
        slug={slug}
        webhook={testTarget}
        open={testTarget !== null}
        onOpenChange={(v) => {
          if (!v) setTestTarget(null)
        }}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmId(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteWebhook")}</DialogTitle>
            <DialogDescription>
              {webhooks.find((w) => w.id === deleteConfirmId)?.url}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("deleteConfirm")}
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmId(null)}
              disabled={deletingId !== null}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirmId) handleDelete(deleteConfirmId)
              }}
              disabled={deletingId !== null}
            >
              {deletingId && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {t("deleteWebhook")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  )
}
