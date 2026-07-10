"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCompanyDataStore } from "@workspace/console/stores/company-data"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Cancel01Icon,
  PlusSignIcon,
  Delete02Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons"

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
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Input } from "@workspace/ui/components/input"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import { SuppressionReasonBadge } from "@/components/suppressions/suppression-reason-badge"

interface Suppression {
  id: string
  email: string
  reason: "bounce" | "unsubscribe" | "complaint" | "manual"
  domainId?: string
  domain?: string
  date: string
}

function mapSdkSuppression(raw: Record<string, unknown>): Suppression {
  return {
    id: raw.id as string,
    email: (raw.email ?? "") as string,
    reason: (raw.reason ?? "manual") as Suppression["reason"],
    domainId: raw.domainId as string | undefined,
    domain: raw.domain as string | undefined,
    date: (raw.date ?? raw.createdAt ?? raw.created_at ?? "") as string,
  }
}

export function SuppressionsContent() {
  const t = useTranslations("suppressions")
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]

  const { domains } = useCompanyDataStore()

  const [suppressions, setSuppressions] = useState<Suppression[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [reasonFilter, setReasonFilter] = useState<string>("all")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Add form state
  const [newEmail, setNewEmail] = useState("")
  const [newReason, setNewReason] = useState<string>("manual")
  const [newDomainId, setNewDomainId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const apiBase = `/api/companies/${slug}/suppressions`

  const fetchSuppressions = useCallback(async () => {
    setLoading(true)
    try {
      const queryParams = new URLSearchParams()
      if (reasonFilter !== "all") queryParams.set("reason", reasonFilter)

      const qs = queryParams.toString()
      const url = qs ? `${apiBase}?${qs}` : apiBase
      const res = await fetch(url)
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to load suppressions")
      }
      const list = (json.data as Record<string, unknown>[]) ?? []
      setSuppressions(list.map(mapSdkSuppression))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load suppressions"
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [apiBase, reasonFilter])

  useEffect(() => {
    if (domains.length > 0 && !newDomainId) {
      setNewDomainId(domains[0].id)
    }
  }, [domains, newDomainId])

  useEffect(() => {
    fetchSuppressions()
  }, [fetchSuppressions])

  async function handleAdd() {
    if (!newEmail.trim() || !newDomainId) return
    setAdding(true)
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail.trim(),
          reason: newReason,
          domainId: newDomainId,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to add suppression")
      }
      const created = mapSdkSuppression(
        json.data as Record<string, unknown>
      )
      setSuppressions((prev) => [...prev, created])
      setNewEmail("")
      setNewReason("manual")
      setShowAddDialog(false)
      toast.success(t("suppressionAdded"))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to add suppression"
      toast.error(message)
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`${apiBase}/${id}`, {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to remove suppression")
      }
      setSuppressions((prev) => prev.filter((s) => s.id !== id))
      toast.success(t("suppressionRemoved"))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to remove suppression"
      toast.error(message)
    } finally {
      setDeletingId(null)
    }
  }

  function getDomainName(suppression: Suppression) {
    if (suppression.domain) return suppression.domain
    const found = domains.find((d) => d.id === suppression.domainId)
    return found?.name ?? suppression.domainId ?? "-"
  }

  function formatDate(dateStr: string) {
    if (!dateStr) return "-"
    try {
      return new Date(dateStr).toLocaleString()
    } catch {
      return dateStr
    }
  }

  if (loading) {
    return (
      <PageTransition className="flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-36" />
          </div>
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
        <div className="flex items-center gap-2">
          <Select value={reasonFilter} onValueChange={value => setReasonFilter(value || "")}>
            <SelectTrigger className="w-36">
              <span>
                {reasonFilter === "all" && t("allReasons")}
                {reasonFilter === "bounce" && t("reasonBounce")}
                {reasonFilter === "unsubscribe" && t("reasonUnsubscribe")}
                {reasonFilter === "complaint" && t("reasonComplaint")}
                {reasonFilter === "manual" && t("reasonManual")}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allReasons")}</SelectItem>
              <SelectItem value="bounce">{t("reasonBounce")}</SelectItem>
              <SelectItem value="unsubscribe">{t("reasonUnsubscribe")}</SelectItem>
              <SelectItem value="complaint">{t("reasonComplaint")}</SelectItem>
              <SelectItem value="manual">{t("reasonManual")}</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setShowAddDialog(true)}>
            <HugeiconsIcon
              icon={PlusSignIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("addSuppression")}
          </Button>
        </div>
      </div>

      {suppressions.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed">
          <EmptyState
            icon={<HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.5} />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              <Button onClick={() => setShowAddDialog(true)}>
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("addSuppression")}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("email")}</TableHead>
                <TableHead>{t("reason")}</TableHead>
                <TableHead>{t("domain")}</TableHead>
                <TableHead>{t("date")}</TableHead>
                <TableHead className="text-end">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppressions.map((suppression) => (
                <TableRow key={suppression.id}>
                  <TableCell className="font-medium">
                    {suppression.email}
                  </TableCell>
                  <TableCell>
                    <SuppressionReasonBadge reason={suppression.reason} />
                  </TableCell>
                  <TableCell>{getDomainName(suppression)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(suppression.date)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={deletingId === suppression.id}
                        onClick={() => handleRemove(suppression.id)}
                      >
                        <HugeiconsIcon
                          icon={
                            deletingId === suppression.id
                              ? Loading03Icon
                              : Delete02Icon
                          }
                          strokeWidth={2}
                          className={
                            deletingId === suppression.id
                              ? "animate-spin"
                              : undefined
                          }
                        />
                        <span className="sr-only">{t("remove")}</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Suppression Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("addSuppression")}</DialogTitle>
            <DialogDescription>{t("addDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <Field>
              <FieldLabel>{t("email")}</FieldLabel>
              <Input
                type="email"
                placeholder="user@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                disabled={adding}
              />
            </Field>

            <Field>
              <FieldLabel>{t("reason")}</FieldLabel>
              <Select value={newReason} onValueChange={value => setNewReason(value || "")}>
                <SelectTrigger>
                  <span>
                    {newReason === "bounce" && t("reasonBounce")}
                    {newReason === "unsubscribe" && t("reasonUnsubscribe")}
                    {newReason === "complaint" && t("reasonComplaint")}
                    {newReason === "manual" && t("reasonManual")}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bounce">{t("reasonBounce")}</SelectItem>
                  <SelectItem value="unsubscribe">
                    {t("reasonUnsubscribe")}
                  </SelectItem>
                  <SelectItem value="complaint">
                    {t("reasonComplaint")}
                  </SelectItem>
                  <SelectItem value="manual">{t("reasonManual")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel>{t("domain")}</FieldLabel>
              <Select
                value={newDomainId ?? undefined}
                onValueChange={setNewDomainId}
              >
                <SelectTrigger>
                  <span>
                    {newDomainId
                      ? (domains.find((d) => d.id === newDomainId)?.name ?? newDomainId)
                      : t("selectDomain")}
                  </span>
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
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddDialog(false)}
              disabled={adding}
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleAdd}
              disabled={adding || !newEmail.trim() || !newDomainId}
            >
              {adding && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {t("addSuppression")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  )
}
