"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { useParams } from "next/navigation"

interface LogRow {
  id: string
  to: string
  status: "queued" | "sent" | "failed"
  templateId: string | null
  error: string | null
  createdAt: string
}

const STATUS_STYLE: Record<string, string> = {
  sent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  failed: "bg-red-500/10 text-red-600 dark:text-red-400",
  queued: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
}

export function LogsContent() {
  const t = useTranslations("santral")
  const params = useParams()
  const slug = params["company-slug"] as string
  const api = `/api/companies/${slug}/logs`

  const [rows, setRows] = useState<LogRow[]>([])
  const [status, setStatus] = useState<string>("")
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    setLoaded(false)
    try {
      const res = await fetch(`${api}${status ? `?status=${status}` : ""}`)
      const json = await res.json()
      setRows((json?.data?.data as LogRow[]) ?? [])
    } catch {
      setRows([])
    }
    setLoaded(true)
  }, [api, status])

  useEffect(() => {
    void load()
  }, [load])

  const filters: Array<[string, string]> = [
    ["", t("all")],
    ["sent", t("statusSent")],
    ["failed", t("statusFailed")],
    ["queued", t("statusQueued")],
  ]
  const statusLabel = (s: string) =>
    s === "sent"
      ? t("statusSent")
      : s === "failed"
        ? t("statusFailed")
        : t("statusQueued")

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("logsTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("logsSubtitle")}</p>
        </div>
        <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
          {filters.map(([value, label]) => (
            <button
              key={value || "all"}
              type="button"
              onClick={() => setStatus(value)}
              className={
                "rounded-md px-3 py-1 text-xs font-medium transition-colors " +
                (status === value
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">{t("to")}</th>
              <th className="px-4 py-2.5 font-medium">{t("status")}</th>
              <th className="px-4 py-2.5 font-medium">{t("error")}</th>
              <th className="px-4 py-2.5 font-medium">{t("when")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {!loaded ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  …
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  {t("noLogs")}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 font-medium">{r.to}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium " +
                        (STATUS_STYLE[r.status] ?? "bg-muted text-muted-foreground")
                      }
                    >
                      {statusLabel(r.status)}
                    </span>
                  </td>
                  <td className="max-w-xs truncate px-4 py-2.5 text-xs text-muted-foreground">
                    {r.error ?? ""}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                    {r.createdAt?.slice(0, 16).replace("T", " ")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
