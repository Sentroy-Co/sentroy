"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Note01Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons"

import { useCompanyDataStore } from "@workspace/console/stores/company-data"
import { PageTransition, EmptyState } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import { LogStatusBadge } from "@/components/logs/log-status-badge"
import { cn } from "@workspace/ui/lib/utils"

interface LogEntry {
  id: string
  to: string
  from: string
  subject: string
  status: "queued" | "processing" | "sent" | "bounced" | "failed"
  date: string
  domainId?: string
  domain?: string
  messageId?: string
  error?: string
  headers?: Record<string, string>
  attempts?: number
}

function mapSdkLog(raw: Record<string, unknown>): LogEntry {
  return {
    id: raw.id as string,
    to: (raw.to ?? raw.recipient ?? "") as string,
    from: (raw.from ?? raw.sender ?? "") as string,
    subject: (raw.subject ?? "") as string,
    status: (raw.status ?? "queued") as LogEntry["status"],
    date: (raw.date ?? raw.createdAt ?? raw.created_at ?? "") as string,
    domainId: raw.domainId as string | undefined,
    domain: raw.domain as string | undefined,
    messageId: raw.messageId as string | undefined,
    error: raw.error as string | undefined,
    headers: raw.headers as Record<string, string> | undefined,
    attempts: raw.attempts as number | undefined,
  }
}

export function LogsContent() {
  const t = useTranslations("logs")
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]

  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [domainFilter, setDomainFilter] = useState<string>("all")
  const { domains } = useCompanyDataStore()
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailData, setDetailData] = useState<Record<string, unknown> | null>(
    null
  )

  const apiBase = `/api/companies/${slug}/logs`

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const queryParams = new URLSearchParams()
      if (statusFilter !== "all") queryParams.set("status", statusFilter)
      if (domainFilter !== "all") queryParams.set("domainId", domainFilter)

      const qs = queryParams.toString()
      const url = qs ? `${apiBase}?${qs}` : apiBase
      const res = await fetch(url)
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to load logs")
      }
      const list = (json.data as Record<string, unknown>[]) ?? []
      setLogs(list.map(mapSdkLog))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load logs"
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [apiBase, statusFilter, domainFilter])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  async function handleRowClick(log: LogEntry) {
    setSelectedLog(log)
    setDetailData(null)
    setDetailLoading(true)
    try {
      const res = await fetch(`${apiBase}/${log.id}`)
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to load log details")
      }
      setDetailData(json.data as Record<string, unknown>)
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load log details"
      toast.error(message)
    } finally {
      setDetailLoading(false)
    }
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
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
        <div className="rounded-xl border">
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
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
          <Select value={statusFilter} onValueChange={value => setStatusFilter(value || "")}>
            <SelectTrigger className="w-36">
              <span>
                {statusFilter === "all" && t("allStatuses")}
                {statusFilter === "queued" && t("statusQueued")}
                {statusFilter === "processing" && t("statusProcessing")}
                {statusFilter === "sent" && t("statusSent")}
                {statusFilter === "bounced" && t("statusBounced")}
                {statusFilter === "failed" && t("statusFailed")}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allStatuses")}</SelectItem>
              <SelectItem value="queued">{t("statusQueued")}</SelectItem>
              <SelectItem value="processing">{t("statusProcessing")}</SelectItem>
              <SelectItem value="sent">{t("statusSent")}</SelectItem>
              <SelectItem value="bounced">{t("statusBounced")}</SelectItem>
              <SelectItem value="failed">{t("statusFailed")}</SelectItem>
            </SelectContent>
          </Select>
          {domains.length > 0 && (
            <Select value={domainFilter} onValueChange={value => setDomainFilter(value || "")}>
              <SelectTrigger className="w-40">
                <span>
                  {domainFilter === "all"
                    ? t("allDomains")
                    : domains.find((d) => d.id === domainFilter)?.name ?? domainFilter}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allDomains")}</SelectItem>
                {domains.map((d) => (
                  <SelectItem key={d.id} value={d.id} label={d.name}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed">
          <EmptyState
            icon={<HugeiconsIcon icon={Note01Icon} strokeWidth={1.5} />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("to")}</TableHead>
                <TableHead>{t("from")}</TableHead>
                <TableHead>{t("subject")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>{t("date")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow
                  key={log.id}
                  className="cursor-pointer"
                  onClick={() => handleRowClick(log)}
                >
                  <TableCell className="max-w-[200px] truncate font-medium">
                    {log.to}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {log.from}
                  </TableCell>
                  <TableCell className="max-w-[250px] truncate">
                    {log.subject || "-"}
                  </TableCell>
                  <TableCell>
                    <LogStatusBadge status={log.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(log.date)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Log Detail Dialog */}
      <Dialog
        open={selectedLog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedLog(null)
            setDetailData(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("logDetail")}</DialogTitle>
            <DialogDescription>
              {selectedLog?.subject || selectedLog?.id}
            </DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : detailData ? (
            <div className="flex flex-col gap-3">
              <DetailRow
                label={t("to")}
                value={(detailData.to ?? detailData.recipient ?? "") as string}
              />
              <DetailRow
                label={t("from")}
                value={(detailData.from ?? detailData.sender ?? "") as string}
              />
              <DetailRow
                label={t("subject")}
                value={(detailData.subject ?? "") as string}
              />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {t("status")}
                </span>
                <LogStatusBadge
                  status={
                    (detailData.status as LogEntry["status"]) ?? "queued"
                  }
                />
              </div>
              <DetailRow
                label={t("date")}
                value={formatDate(
                  (detailData.date ??
                    detailData.createdAt ??
                    detailData.created_at ??
                    "") as string
                )}
              />
              {(detailData?.messageId as string) && (
                <DetailRow
                  label={t("messageId")}
                  value={detailData.messageId as string}
                />
              )}
              {(detailData?.error as string) && (
                <DetailRow
                  label={t("error")}
                  value={detailData.error as string}
                  className="text-destructive"
                />
              )}
              {detailData.attempts != null && (
                <DetailRow
                  label={t("attempts")}
                  value={String(detailData.attempts)}
                />
              )}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("emptyDescription")}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </PageTransition>
  )
}

function DetailRow({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "break-all text-end text-sm font-medium",
          className
        )}
      >
        {value || "-"}
      </span>
    </div>
  )
}
