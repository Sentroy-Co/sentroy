"use client"

import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Loading03Icon,
  Cancel01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Progress } from "@workspace/ui/components/progress"

interface JobStatus {
  status: string
  total?: number
  sent?: number
  failed?: number
}

export function JobStatusCard({ jobId }: { jobId: string }) {
  const t = useTranslations("send")
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]

  const [status, setStatus] = useState<JobStatus | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const apiBase = `/api/companies/${slug}/send/${jobId}`

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch(apiBase)
        const json = await res.json()
        if (!res.ok) {
          throw new Error(json.error || "Failed to get job status")
        }
        setStatus(json.data as JobStatus)

        const s = (json.data as JobStatus).status
        if (
          s === "completed" ||
          s === "failed" ||
          s === "cancelled"
        ) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
          }
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to get job status"
        toast.error(message)
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    }

    poll()
    intervalRef.current = setInterval(poll, 3000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [apiBase])

  async function handleCancel() {
    setCancelling(true)
    try {
      const res = await fetch(apiBase, { method: "DELETE" })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to cancel job")
      }
      toast.success(t("cancelled"))
      setStatus((prev) => (prev ? { ...prev, status: "cancelled" } : prev))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to cancel job"
      toast.error(message)
    } finally {
      setCancelling(false)
    }
  }

  if (!status) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6">
          <HugeiconsIcon
            icon={Loading03Icon}
            strokeWidth={2}
            className="animate-spin text-muted-foreground"
          />
        </CardContent>
      </Card>
    )
  }

  const total = status.total ?? 0
  const sent = status.sent ?? 0
  const failed = status.failed ?? 0
  const progress = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0
  const isProcessing =
    status.status === "processing" || status.status === "queued"

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{t("jobStatus")}</CardTitle>
          <Badge
            variant="outline"
            className={
              status.status === "completed"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : status.status === "failed" || status.status === "cancelled"
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : ""
            }
          >
            {status.status === "completed" && (
              <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
            )}
            {(status.status === "failed" ||
              status.status === "cancelled") && (
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            )}
            {isProcessing && (
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="animate-spin"
              />
            )}
            {status.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {total > 0 && (
          <>
            <Progress value={progress} />
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Total: {total}</span>
              <span>Sent: {sent}</span>
              <span>Failed: {failed}</span>
            </div>
          </>
        )}
        {isProcessing && (
          <Button
            variant="outline"
            size="sm"
            disabled={cancelling}
            onClick={handleCancel}
          >
            {cancelling && (
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="animate-spin"
                data-icon="inline-start"
              />
            )}
            {t("cancel")}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
