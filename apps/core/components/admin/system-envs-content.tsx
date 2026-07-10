"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft02Icon,
  CheckmarkCircle02Icon,
  Alert02Icon,
  Cancel01Icon,
  HelpCircleIcon,
  ArrowRight01Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons"
import { PageTransition } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Sentroy system envs diagnostic — admin'e migrated env'lerin hangi
 * kaynaktan (vault / process.env / missing) okunduğunu gösterir.
 *
 * `/api/admin/env-vault/system-envs` çağırır; row başına source badge'i
 * + "Open in vault" linki render eder. Edit/Add işlemleri normal
 * env-vault UI'sında yapılır — bu sayfa salt-okunur diagnostic.
 */

interface SystemEnvStatus {
  key: string
  projectSlug: string
  projectId: string | null
  description: string
  usedIn: string
  visibleFromCore: boolean
  inVault: boolean
  inProcessEnv: boolean
  source: "vault" | "process.env" | "missing" | "unknown"
  vaultMaskedValue: string | null
  vaultDecryptError: boolean
  vaultUpdatedAt: string | null
  vaultEnvironment: string | null
}

interface SystemEnvResponse {
  entries: SystemEnvStatus[]
  summary: {
    total: number
    inVault: number
    processEnv: number
    missing: number
    unknown: number
  }
  projects: { slug: string; name: string; id: string | null }[]
}

const SOURCE_STYLES: Record<
  SystemEnvStatus["source"],
  { label: keyof typeof labelKeys; icon: typeof CheckmarkCircle02Icon; className: string }
> = {
  vault: {
    label: "sourceVault",
    icon: CheckmarkCircle02Icon,
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  "process.env": {
    label: "sourceProcessEnv",
    icon: Alert02Icon,
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  missing: {
    label: "sourceMissing",
    icon: Cancel01Icon,
    className:
      "border-destructive/30 bg-destructive/10 text-destructive",
  },
  unknown: {
    label: "sourceUnknown",
    icon: HelpCircleIcon,
    className: "border-muted-foreground/20 bg-muted/30 text-muted-foreground",
  },
}

// satisfy TS — nested object key reference
const labelKeys = {
  sourceVault: "sourceVault",
  sourceProcessEnv: "sourceProcessEnv",
  sourceMissing: "sourceMissing",
  sourceUnknown: "sourceUnknown",
} as const

export function SystemEnvsContent() {
  const t = useTranslations("vault.systemEnvs")
  const params = useParams<{ lang: string }>()
  const lang = params.lang ?? "en"
  const [data, setData] = useState<SystemEnvResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/admin/env-vault/system-envs")
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || t("loadFailed"))
        if (!cancelled) setData(json.data)
      } catch (err) {
        if (!cancelled)
          toast.error(err instanceof Error ? err.message : t("loadFailed"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [t])

  return (
    <PageTransition>
      <div className="flex h-[calc(100vh-4rem)] min-w-0 flex-col gap-4">
        {/* Header */}
        <div className="flex min-w-0 items-start justify-between gap-3 border-b pb-4">
          <div className="flex flex-col gap-1">
            <Link
              href={`/${lang}/admin/env-vault`}
              className="-ml-1 inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon
                icon={ArrowLeft02Icon}
                strokeWidth={2}
                className="size-3"
              />
              {t("backLink")}
            </Link>
            <h1 className="text-xl font-semibold">{t("title")}</h1>
            <p className="max-w-2xl text-xs text-muted-foreground">
              {t("description")}
            </p>
          </div>
          {data ? (
            <div className="shrink-0 rounded-lg border bg-muted/30 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
              {t("summary", {
                total: data.summary.total,
                inVault: data.summary.inVault,
                processEnv: data.summary.processEnv,
                missing: data.summary.missing,
              })}
            </div>
          ) : null}
        </div>

        {/* Table */}
        <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="min-w-0 pe-3">
            {loading ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : !data || data.entries.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                {t("loadFailed")}
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">
                        {t("thKey")}
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        {t("thProject")}
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        {t("thSource")}
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        {t("thValue")}
                      </th>
                      <th className="px-3 py-2 text-right font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.map((s) => {
                      const style = SOURCE_STYLES[s.source]
                      return (
                        <tr
                          key={`${s.projectSlug}/${s.key}`}
                          className="border-t"
                        >
                          <td className="px-3 py-2 align-top">
                            <code className="font-mono text-[12.5px] font-medium">
                              {s.key}
                            </code>
                            <div className="mt-0.5 max-w-md text-[11px] text-muted-foreground">
                              {s.description}
                            </div>
                            <div className="mt-0.5 max-w-md truncate font-mono text-[10px] text-muted-foreground">
                              {s.usedIn}
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                              {s.projectSlug}
                            </code>
                            {s.vaultEnvironment ? (
                              <span className="ms-1 text-[10px] text-muted-foreground">
                                /{s.vaultEnvironment}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 align-top">
                            <Badge
                              variant="outline"
                              className={cn(
                                "gap-1 border font-mono text-[10px]",
                                style.className,
                              )}
                              title={
                                s.source === "unknown"
                                  ? t("tooltipUnknown")
                                  : undefined
                              }
                            >
                              <HugeiconsIcon
                                icon={style.icon}
                                strokeWidth={2}
                                className="size-3"
                              />
                              {t(style.label)}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 align-top">
                            {s.vaultDecryptError ? (
                              <Badge
                                variant="destructive"
                                className="text-[10px]"
                              >
                                {t("decryptError")}
                              </Badge>
                            ) : s.vaultMaskedValue ? (
                              <code className="font-mono text-[11px] text-muted-foreground">
                                {s.vaultMaskedValue}
                              </code>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">
                                —
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right align-top">
                            {s.projectId ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                render={
                                  <Link
                                    href={`/${lang}/admin/env-vault?project=${s.projectId}`}
                                  />
                                }
                              >
                                {t("openInVault")}
                                <HugeiconsIcon
                                  icon={ArrowRight01Icon}
                                  strokeWidth={2}
                                  className="size-3"
                                />
                              </Button>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">
                                {t("noProject")}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </PageTransition>
  )
}

// re-export to silence TS6133 if Loading03Icon ever gets added later
export type { SystemEnvStatus, SystemEnvResponse }
void Loading03Icon
