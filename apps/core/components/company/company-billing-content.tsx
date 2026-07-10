"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Loading03Icon,
  Alert02Icon,
  Tick02Icon,
  SparklesIcon,
  ArrowRight01Icon,
  Settings02Icon,
} from "@hugeicons/core-free-icons"

import { PageTransition } from "@workspace/console/components/shared"
import { pickLocalized } from "@workspace/db/types"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"
import { useCompanyDashboard } from "./core-company-dashboard-shell"

type LocalizedString = Record<string, string>
type SubStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"

interface SubscriptionView {
  status: SubStatus
  interval: "month" | "year"
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  planId: string
}

interface CurrentPlan {
  id: string
  name: LocalizedString
  description: LocalizedString
  price: number
  yearlyPrice: number | null
}

interface PlanListItem {
  id: string
  name: LocalizedString
  description: LocalizedString
  features: LocalizedString[]
  price: number
  yearlyPrice?: number
  maxDomainsPerCompany: number
  maxMembersPerCompany: number
  maxMailboxesPerCompany: number
  maxContacts: number
  monthlyEmailLimit: number
  storageLimit: number
  isDefault: boolean
  checkoutAvailable: boolean
}

const STATUS_BADGE: Record<SubStatus, { key: string; className: string }> = {
  active: {
    key: "statusActive",
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  trialing: {
    key: "statusTrialing",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  past_due: {
    key: "statusPastDue",
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  unpaid: {
    key: "statusUnpaid",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  canceled: {
    key: "statusCanceled",
    className: "border-muted bg-muted text-muted-foreground",
  },
  incomplete: {
    key: "statusIncomplete",
    className: "border-muted bg-muted text-muted-foreground",
  },
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    sizes.length - 1,
  )
  const val = bytes / Math.pow(k, i)
  return `${Number.isInteger(val) ? val : val.toFixed(1)} ${sizes[i]}`
}

export function CompanyBillingContent({
  slug,
  lang,
}: {
  slug: string
  lang: string
}) {
  const t = useTranslations("billing")
  const tp = useTranslations("pricing")
  const { membership } = useCompanyDashboard()
  const canManage = membership.role === "owner" || membership.role === "admin"

  const [loading, setLoading] = useState(true)
  const [plan, setPlan] = useState<CurrentPlan | null>(null)
  const [subscription, setSubscription] = useState<SubscriptionView | null>(null)
  const [plans, setPlans] = useState<PlanListItem[]>([])
  const [cycle, setCycle] = useState<"month" | "year">("month")
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [billingRes, plansRes] = await Promise.all([
        fetch(`/api/companies/${slug}/billing`),
        fetch(`/api/public/plans`),
      ])
      const billingJson = await billingRes.json()
      const plansJson = await plansRes.json()
      if (billingRes.ok) {
        setPlan(billingJson.data?.plan ?? null)
        setSubscription(billingJson.data?.subscription ?? null)
      }
      if (plansRes.ok && Array.isArray(plansJson.data)) {
        setPlans(plansJson.data)
      }
    } catch {
      toast.error(t("loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [slug, t])

  // Toggle'ı mevcut aboneliğin gerçek interval'ına senkronla — yıllık abone
  // sayfayı açınca "Aylık" seçili + aylık fiyat görmesin. Yalnız
  // subscription.interval değişince çalışır; manuel toggle seçimini ezmez.
  useEffect(() => {
    if (subscription?.interval) setCycle(subscription.interval)
  }, [subscription?.interval])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (typeof window === "undefined") return
    const sp = new URLSearchParams(window.location.search)
    if (sp.get("checkout") === "success") {
      toast.success(t("checkoutSuccess"))
      const timer = setTimeout(() => load(), 2500)
      return () => clearTimeout(timer)
    }
  }, [load, t])

  const hasPaid = plans.some((p) => p.price > 0)
  const savePercent = (() => {
    const ref = plans.find((p) => p.price > 0 && (p.yearlyPrice ?? 0) > 0)
    if (!ref || !ref.yearlyPrice) return 0
    const pct = Math.round((1 - ref.yearlyPrice / (ref.price * 12)) * 100)
    return pct > 0 ? pct : 0
  })()
  // Önerilen (popular) plan: en ucuz ücretli plan.
  const popularId = plans
    .filter((p) => p.price > 0)
    .sort((a, b) => a.price - b.price)[0]?.id

  async function subscribe(planId: string, interval: "month" | "year") {
    setBusy(planId)
    try {
      const res = await fetch(`/api/companies/${slug}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, interval, lang }),
      })
      const json = await res.json()
      if (!res.ok || !json.data?.url) {
        throw new Error(json.error || t("actionFailed"))
      }
      window.location.href = json.data.url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("actionFailed"))
      setBusy(null)
    }
  }

  async function openPortal() {
    setBusy("portal")
    try {
      const res = await fetch(`/api/companies/${slug}/billing/portal`, {
        method: "POST",
      })
      const json = await res.json()
      if (!res.ok || !json.data?.url) {
        throw new Error(json.error || t("actionFailed"))
      }
      window.location.href = json.data.url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("actionFailed"))
      setBusy(null)
    }
  }

  function formatDate(iso: string | null): string {
    if (!iso) return ""
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(lang)
  }

  function planLimits(p: PlanListItem): string[] {
    const num = (v: number) =>
      v < 0 ? t("unlimited") : v.toLocaleString(lang)
    return [
      tp("limitMembers", { count: num(p.maxMembersPerCompany) }),
      tp("limitDomains", { count: num(p.maxDomainsPerCompany) }),
      tp("limitMailboxes", { count: num(p.maxMailboxesPerCompany) }),
      tp("limitContacts", { count: num(p.maxContacts) }),
      tp("limitEmails", { count: num(p.monthlyEmailLimit) }),
      tp("limitStorage", {
        size: p.storageLimit < 0 ? t("unlimited") : formatBytes(p.storageLimit),
      }),
    ]
  }

  if (loading) {
    return (
      <PageTransition className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-36 w-full rounded-2xl" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-96 w-full rounded-2xl" />
          ))}
        </div>
      </PageTransition>
    )
  }

  const badge = subscription ? STATUS_BADGE[subscription.status] : null
  // Yenileme/iptal bilgisi yalnız canlı (terminal olmayan) abonelikte anlamlı;
  // canceled/unpaid/incomplete'te "renewsOn …" göstermek yanıltıcı (erişim
  // bitmiş). Bu durumlarda yalnız status rozeti kalır.
  const isLiveSub =
    !!subscription &&
    (subscription.status === "active" ||
      subscription.status === "trialing" ||
      subscription.status === "past_due")

  return (
    <PageTransition className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("dashTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("dashSubtitle")}</p>
      </div>

      {subscription?.status === "past_due" && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
          <HugeiconsIcon
            icon={Alert02Icon}
            strokeWidth={2}
            className="mt-0.5 size-4 shrink-0"
          />
          <span>{t("pastDueWarning")}</span>
        </div>
      )}

      {/* Mevcut plan — gradient vurgulu kart */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6">
        <div className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-primary">
              <HugeiconsIcon
                icon={SparklesIcon}
                strokeWidth={2}
                className="size-3.5"
              />
              {t("currentPlanEyebrow")}
            </span>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold tracking-tight">
                {plan ? pickLocalized(plan.name, lang) : t("noPlan")}
              </h2>
              {badge && (
                <Badge variant="outline" className={badge.className}>
                  {t(badge.key)}
                </Badge>
              )}
            </div>
            {plan && (
              <p className="max-w-md text-sm text-muted-foreground">
                {pickLocalized(plan.description, lang)}
              </p>
            )}
            {isLiveSub && subscription && (
              <p className="mt-1 text-sm text-muted-foreground">
                {subscription.cancelAtPeriodEnd
                  ? t("cancelScheduled", {
                      date: formatDate(subscription.currentPeriodEnd),
                    })
                  : subscription.currentPeriodEnd
                    ? t("renewsOn", {
                        date: formatDate(subscription.currentPeriodEnd),
                      })
                    : null}
              </p>
            )}
          </div>

          {canManage && subscription && (
            <Button
              variant="outline"
              className="shrink-0 bg-background/60 backdrop-blur"
              disabled={busy !== null}
              onClick={openPortal}
            >
              {busy === "portal" ? (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <HugeiconsIcon
                  icon={Settings02Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
              )}
              {t("manageSubscription")}
            </Button>
          )}
        </div>
      </div>

      {/* Plan değiştir */}
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            {t("changePlanTitle")}
          </h2>
          {hasPaid && (
            <div className="inline-flex items-center rounded-full border bg-muted/40 p-0.5">
              {(["month", "year"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCycle(c)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                    cycle === c
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c === "month" ? t("billingMonthly") : t("billingYearly")}
                  {c === "year" && savePercent > 0 && (
                    <span className="ms-1.5 text-xs opacity-80">
                      {t("saveBadge", { percent: savePercent })}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p, i) => {
            const isCurrent = plan?.id === p.id
            const isFree = p.price === 0
            const yearlyAvailable = (p.yearlyPrice ?? 0) > 0
            const useYearly = cycle === "year" && yearlyAvailable
            const amount = useYearly ? p.yearlyPrice! : p.price
            const isPopular = p.id === popularId && !isCurrent
            const interval: "month" | "year" = useYearly ? "year" : "month"

            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.06 }}
                className={cn(
                  "relative flex h-full flex-col gap-4 rounded-2xl border bg-background p-6 transition-shadow hover:shadow-md",
                  isPopular && "border-primary shadow-lg ring-1 ring-primary/20",
                  isCurrent && "border-primary/40 ring-1 ring-primary/20",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold">
                    {pickLocalized(p.name, lang)}
                  </h3>
                  {isCurrent ? (
                    <Badge variant="outline" className="border-primary/40 text-primary">
                      {t("currentBadge")}
                    </Badge>
                  ) : isPopular ? (
                    <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
                      {tp("popular")}
                    </span>
                  ) : null}
                </div>

                <p className="line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
                  {pickLocalized(p.description, lang)}
                </p>

                <div className="flex items-baseline gap-1">
                  {isFree ? (
                    <span className="text-3xl font-bold tracking-tight">
                      {t("free")}
                    </span>
                  ) : (
                    <>
                      <span className="text-3xl font-bold tracking-tight">
                        ${amount.toLocaleString(lang)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {useYearly ? t("perYear") : t("perMonth")}
                      </span>
                    </>
                  )}
                </div>
                {!isFree && cycle === "year" && !yearlyAvailable && (
                  <p className="-mt-2 text-xs text-muted-foreground">
                    {t("billedMonthly")}
                  </p>
                )}

                {/* CTA */}
                {isCurrent ? (
                  <Button variant="outline" disabled className="cursor-default">
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    {t("currentBadge")}
                  </Button>
                ) : isFree ? (
                  <Button variant="outline" disabled className="cursor-default">
                    {t("free")}
                  </Button>
                ) : canManage ? (
                  p.checkoutAvailable ? (
                    <Button
                      variant={isPopular ? "default" : "outline"}
                      disabled={busy !== null}
                      onClick={() => subscribe(p.id, interval)}
                    >
                      {busy === p.id ? (
                        <HugeiconsIcon
                          icon={Loading03Icon}
                          strokeWidth={2}
                          className="animate-spin"
                          data-icon="inline-start"
                        />
                      ) : null}
                      {subscription ? t("switchPlan") : t("subscribe")}
                      {!busy && (
                        <HugeiconsIcon
                          icon={ArrowRight01Icon}
                          strokeWidth={2}
                          className="size-3.5"
                        />
                      )}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      disabled
                      className="cursor-not-allowed"
                    >
                      {t("checkoutUnavailable")}
                    </Button>
                  )
                ) : null}

                {/* Neler dahil */}
                <div className="mt-1 flex flex-col gap-2.5 border-t pt-4">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {t("included")}
                  </span>
                  {planLimits(p).map((line, idx) => (
                    <div
                      key={`l-${idx}`}
                      className="flex items-start gap-2 text-sm"
                    >
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        strokeWidth={2.5}
                        className="mt-0.5 size-4 shrink-0 text-primary"
                      />
                      <span className="text-muted-foreground">{line}</span>
                    </div>
                  ))}
                  {p.features.map((feat, idx) => {
                    const label = pickLocalized(feat, lang)
                    if (!label) return null
                    return (
                      <div
                        key={`f-${idx}`}
                        className="flex items-start gap-2 text-sm"
                      >
                        <HugeiconsIcon
                          icon={Tick02Icon}
                          strokeWidth={2.5}
                          className="mt-0.5 size-4 shrink-0 text-primary"
                        />
                        <span className="text-muted-foreground">{label}</span>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Admin'e neden satın alınamadığını açıkla. */}
        {canManage &&
          plans.some(
            (p) => !p.isDefault && p.price > 0 && !p.checkoutAvailable,
          ) && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
              <HugeiconsIcon
                icon={Alert02Icon}
                strokeWidth={2}
                className="mt-0.5 size-4 shrink-0"
              />
              <span>{t("billingSetupHint")}</span>
            </p>
          )}

        {/* Yıllık faturalama hiç yapılandırılmamışsa admin'e ipucu. */}
        {canManage && hasPaid && savePercent === 0 && (
          <p className="text-xs text-muted-foreground">{t("yearlyHint")}</p>
        )}
      </div>
    </PageTransition>
  )
}
