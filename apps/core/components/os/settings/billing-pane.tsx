"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, ArrowRight01Icon, Tick02Icon, StarIcon } from "@hugeicons/core-free-icons"
import { t as l10n } from "@workspace/console/lib/locale"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { Pane, PaneTitle, SectionLabel, Group, Row, PaneLoading } from "./ui"

interface PlanItem {
  id: string
  name: Record<string, string>
  description: Record<string, string>
  features: Record<string, string>[]
  price: number
  yearlyPrice?: number
  storageLimit: number
  monthlyEmailLimit: number
  maxDomainsPerCompany: number
  maxMembersPerCompany: number
  maxMailboxesPerCompany: number
  isDefault: boolean
  checkoutAvailable: boolean
}
interface CurrentPlan {
  id: string
  name: Record<string, string>
}
interface Sub {
  status: string
  interval: "month" | "year"
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  planId: string
}

function fmtBytes(n: number): string {
  if (!n) return "0"
  const u = ["B", "KB", "MB", "GB", "TB"]
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}
function money(n: number): string {
  return n === 0 ? "Free" : `$${n}`
}

export function BillingPane({ lang, slug }: { lang: string; slug: string }) {
  const t = useTranslations("os")
  const [current, setCurrent] = useState<CurrentPlan | null>(null)
  const [sub, setSub] = useState<Sub | null>(null)
  const [plans, setPlans] = useState<PlanItem[]>([])
  const [cycle, setCycle] = useState<"month" | "year">("month")
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [b, p] = await Promise.all([
          fetch(`/api/companies/${slug}/billing`).then((r) => r.json()),
          fetch(`/api/public/plans`).then((r) => r.json()),
        ])
        if (cancelled) return
        setCurrent(b?.data?.plan ?? null)
        setSub(b?.data?.subscription ?? null)
        setPlans((b ? (p?.data ?? p ?? []) : []) as PlanItem[])
        if (b?.data?.subscription?.interval) setCycle(b.data.subscription.interval)
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  async function checkout(planId: string) {
    setBusy(true)
    try {
      const r = await fetch(`/api/companies/${slug}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, interval: cycle, lang }),
      })
      const j = await r.json()
      if (!r.ok || !j?.data?.url) {
        toast.error(j.error || t("billingPane.checkoutUnavailable"))
        return
      }
      window.open(j.data.url, "_blank", "noopener,noreferrer")
    } catch {
      toast.error(t("common.somethingWrong"))
    } finally {
      setBusy(false)
    }
  }
  async function portal() {
    setBusy(true)
    try {
      const r = await fetch(`/api/companies/${slug}/billing/portal`, { method: "POST" })
      const j = await r.json()
      if (j?.data?.url) window.open(j.data.url, "_blank", "noopener,noreferrer")
      else toast.error(j.error || t("billingPane.notAvailable"))
    } catch {
      toast.error(t("common.somethingWrong"))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <PaneLoading />

  const hasYearly = plans.some((p) => typeof p.yearlyPrice === "number" && (p.yearlyPrice ?? 0) > 0)
  const detail = selected ? plans.find((p) => p.id === selected) ?? null : null

  function priceOf(p: PlanItem): number {
    return cycle === "year" ? (p.yearlyPrice ?? p.price * 12) : p.price
  }

  return (
    <div className="relative h-full overflow-hidden">
      {/* LISTE */}
      <Pane>
        <PaneTitle>{t("billingPane.title")}</PaneTitle>

        <Group>
          <Row
            label={t("billingPane.currentPlan")}
            right={<span className="font-medium text-foreground">{current ? l10n(current.name, lang) : "Free"}</span>}
          />
          {sub ? (
            <Row
              label={t("billingPane.status")}
              right={
                <span className="capitalize">
                  {sub.cancelAtPeriodEnd ? t("billingPane.canceling") : sub.status}
                  {sub.currentPeriodEnd ? ` · ${t("billingPane.renews", { date: new Date(sub.currentPeriodEnd).toLocaleDateString(lang) })}` : ""}
                </span>
              }
            />
          ) : null}
          {sub ? <Row label={t("billingPane.manageSubscription")} onClick={portal} /> : null}
        </Group>

        <div className="mb-2 mt-6 flex items-center justify-between">
          <p className="px-1 text-xs font-medium text-muted-foreground">{t("billingPane.plans")}</p>
          {hasYearly ? (
            <div className="flex items-center gap-0.5 rounded-full bg-muted p-0.5">
              {(["month", "year"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCycle(c)}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                    cycle === c ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {c === "month" ? t("billingPane.monthly") : t("billingPane.yearly")}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          {plans.map((p) => {
            const isCurrent = current?.id === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl bg-card p-4 text-left ring-1 transition",
                  isCurrent ? "ring-primary" : "ring-border/60 hover:ring-foreground/25",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{l10n(p.name, lang)}</span>
                    {p.isDefault ? (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                        <HugeiconsIcon icon={StarIcon} className="size-3" strokeWidth={2} />
                        {t("billingPane.popular")}
                      </span>
                    ) : null}
                    {isCurrent ? (
                      <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{t("billingPane.current")}</span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{l10n(p.description, lang)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-semibold text-foreground">{money(priceOf(p))}</div>
                  {priceOf(p) > 0 ? (
                    <div className="text-[11px] text-muted-foreground">{cycle === "year" ? t("billingPane.perYear") : t("billingPane.perMonth")}</div>
                  ) : null}
                </div>
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 shrink-0 text-muted-foreground/50" strokeWidth={2} />
              </button>
            )
          })}
        </div>
      </Pane>

      {/* DETAY (stack — sağdan kayar) */}
      <AnimatePresence>
        {detail ? (
          <motion.div
            key={detail.id}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            className="absolute inset-0 bg-background"
          >
            <PlanDetail
              plan={detail}
              lang={lang}
              cycle={cycle}
              isCurrent={current?.id === detail.id}
              price={priceOf(detail)}
              busy={busy}
              onBack={() => setSelected(null)}
              onSubscribe={() => checkout(detail.id)}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function PlanDetail({
  plan,
  lang,
  cycle,
  isCurrent,
  price,
  busy,
  onBack,
  onSubscribe,
}: {
  plan: PlanItem
  lang: string
  cycle: "month" | "year"
  isCurrent: boolean
  price: number
  busy: boolean
  onBack: () => void
  onSubscribe: () => void
}) {
  const t = useTranslations("os")
  const limits: { label: string; value: string }[] = [
    { label: t("companyPane.domains"), value: limitStr(plan.maxDomainsPerCompany) },
    { label: t("billingPane.teamMembers"), value: limitStr(plan.maxMembersPerCompany) },
    { label: t("companyPane.mailboxes"), value: limitStr(plan.maxMailboxesPerCompany) },
    { label: t("companyPane.storage"), value: plan.storageLimit > 0 ? fmtBytes(plan.storageLimit) : t("billingPane.unlimited") },
    { label: t("billingPane.emailsMonth"), value: limitStr(plan.monthlyEmailLimit) },
  ]

  return (
    <div className="flex h-full select-none flex-col bg-muted/20">
      <button
        type="button"
        onClick={onBack}
        className="flex shrink-0 items-center gap-0.5 px-3 py-2.5 text-sm font-medium text-primary"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" strokeWidth={2} />
        {t("billingPane.title")}
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        <div className="mb-5 text-center">
          <h2 className="text-2xl font-bold text-foreground">{l10n(plan.name, lang)}</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{l10n(plan.description, lang)}</p>
          <div className="mt-3">
            <span className="text-3xl font-bold text-foreground">{money(price)}</span>
            {price > 0 ? <span className="text-sm text-muted-foreground"> {cycle === "year" ? t("billingPane.perYear") : t("billingPane.perMonth")}</span> : null}
          </div>
        </div>

        {plan.features.length ? (
          <>
            <SectionLabel>{t("billingPane.whatsIncluded")}</SectionLabel>
            <Group>
              {plan.features.map((f, i) => (
                <div key={i} className="flex items-center gap-3 px-3.5 py-2.5">
                  <HugeiconsIcon icon={Tick02Icon} className="size-4 shrink-0 text-emerald-500" strokeWidth={2.5} />
                  <span className="text-sm text-foreground">{l10n(f, lang)}</span>
                </div>
              ))}
            </Group>
          </>
        ) : null}

        <SectionLabel>{t("billingPane.limits")}</SectionLabel>
        <Group>
          {limits.map((l) => (
            <Row key={l.label} label={l.label} right={<span className="text-foreground">{l.value}</span>} />
          ))}
        </Group>

        <div className="mt-6">
          {isCurrent ? (
            <Button className="w-full" disabled>
              {t("billingPane.currentPlanBtn")}
            </Button>
          ) : !plan.checkoutAvailable ? (
            <Button className="w-full" disabled>
              {price === 0 ? t("billingPane.defaultPlan") : t("billingPane.notAvailable")}
            </Button>
          ) : (
            <Button className="w-full" onClick={onSubscribe} disabled={busy}>
              {busy ? t("billingPane.openingCheckout") : price === 0 ? t("billingPane.switchPlan") : t("billingPane.subscribe")}
            </Button>
          )}
          {!plan.checkoutAvailable && price > 0 ? (
            <p className="mt-2 text-center text-xs text-muted-foreground">{t("billingPane.notConfigured")}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function limitStr(n: number): string {
  return n < 0 ? "Unlimited" : String(n)
}
