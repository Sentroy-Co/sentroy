"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { useParams, useRouter } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  SmartPhone01Icon,
  TextCreationIcon,
  UserGroupIcon,
  SentIcon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons"

interface NumberRow {
  sessionId: string
  phoneNumber: string | null
  connected: boolean
}
interface LogRow {
  id: string
  to: string
  status: string
  createdAt: string
}

async function getData<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const json = await res.json()
    return (json?.data ?? null) as T | null
  } catch {
    return null
  }
}

export function OverviewContent() {
  const t = useTranslations("santral")
  const params = useParams()
  const router = useRouter()
  const slug = params["company-slug"] as string
  const lang = params.lang as string
  const base = `/${lang}/d/${slug}`
  const api = `/api/companies/${slug}`

  const [numbers, setNumbers] = useState<NumberRow[]>([])
  const [templateCount, setTemplateCount] = useState(0)
  const [audienceCount, setAudienceCount] = useState(0)
  const [sendTotal, setSendTotal] = useState(0)
  const [recent, setRecent] = useState<LogRow[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [nums, tpls, auds, logs] = await Promise.all([
        getData<NumberRow[]>(`${api}/numbers`),
        getData<unknown[]>(`${api}/templates`),
        getData<unknown[]>(`${api}/audiences`),
        getData<{ data: LogRow[]; total: number }>(`${api}/logs?limit=6`),
      ])
      if (cancelled) return
      setNumbers(nums ?? [])
      setTemplateCount((tpls ?? []).length)
      setAudienceCount((auds ?? []).length)
      setSendTotal(logs?.total ?? 0)
      setRecent(logs?.data ?? [])
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [api])

  const connectedCount = numbers.filter((n) => n.connected).length

  const stats = [
    {
      label: t("connectedNumbers"),
      value: `${connectedCount}/${numbers.length}`,
      icon: SmartPhone01Icon,
      color: "#25d366",
      href: `${base}/chats`,
    },
    {
      label: t("templates"),
      value: String(templateCount),
      icon: TextCreationIcon,
      color: "#a855f7",
      href: `${base}/templates`,
    },
    {
      label: t("audiences"),
      value: String(audienceCount),
      icon: UserGroupIcon,
      color: "#ec4899",
      href: `${base}/audiences`,
    },
    {
      label: t("sendsThisMonth"),
      value: String(sendTotal),
      icon: SentIcon,
      color: "#0ea5e9",
      href: `${base}/logs`,
    },
  ]

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("overview")}</h1>
        <p className="text-sm text-muted-foreground">{t("overviewSubtitle")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => router.push(s.href)}
            className="group flex flex-col gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent/40"
          >
            <span
              className="flex size-9 items-center justify-center rounded-xl text-white shadow-sm"
              style={{ background: s.color }}
            >
              <HugeiconsIcon icon={s.icon} className="size-4.5" strokeWidth={2} />
            </span>
            <div>
              <div className="text-2xl font-semibold tabular-nums">
                {loaded ? s.value : "—"}
              </div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{t("recentSends")}</h2>
          <button
            type="button"
            onClick={() => router.push(`${base}/logs`)}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {t("viewLogs")}
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" strokeWidth={2} />
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {loaded ? t("noSends") : "…"}
          </p>
        ) : (
          <ul className="divide-y">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <HugeiconsIcon
                  icon={r.status === "failed" ? AlertCircleIcon : CheckmarkCircle02Icon}
                  className={
                    "size-4 shrink-0 " +
                    (r.status === "failed" ? "text-red-500" : "text-emerald-500")
                  }
                  strokeWidth={2}
                />
                <span className="font-medium">{r.to}</span>
                <span className="ms-auto text-xs text-muted-foreground">
                  {r.createdAt?.slice(0, 16).replace("T", " ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
