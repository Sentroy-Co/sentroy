"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useInView } from "framer-motion"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon } from "@hugeicons/core-free-icons"

import {
  MarketingHeader,
  MarketingFooter,
} from "@workspace/console/components/marketing"
import { pickLocalized } from "@workspace/db/types"
import { Button } from "@workspace/ui/components/button"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@workspace/ui/components/accordion"
import { cn } from "@workspace/ui/lib/utils"

type LocalizedString = Record<string, string>

interface PlanView {
  id: string
  name: LocalizedString
  description: LocalizedString
  features: LocalizedString[]
  price: number
  yearlyPrice?: number
  maxCompanies: number
  maxDomainsPerCompany: number
  maxMembersPerCompany: number
  maxMailboxesPerCompany: number
  maxContacts: number
  monthlyEmailLimit: number
  storageLimit: number
  isDefault: boolean
  checkoutAvailable: boolean
}

type BillingCycle = "monthly" | "yearly"

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: "-60px" })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 32 }}
      transition={{ duration: 0.5, delay, ease: [0.25, 0.1, 0.25, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

function StaggerContainer({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: "-40px" })
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 24 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

function formatStorage(bytes: number, lang: string): string {
  // storageLimit BYTES cinsinde (admin BytesInput ile girilir). Doğru birime
  // indir — eskiden değer MB sanılıp /1024 yapılıyordu (ör. 50 GB → "48828125
  // GB" gibi saçma çıktı).
  if (bytes <= 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    sizes.length - 1,
  )
  const val = bytes / Math.pow(k, i)
  const num = Number.isInteger(val) ? val.toLocaleString(lang) : val.toFixed(1)
  return `${num} ${sizes[i]}`
}

export function PricingPage({ lang }: { lang: string }) {
  const t = useTranslations("pricing")

  const [plans, setPlans] = useState<PlanView[]>([])
  const [loading, setLoading] = useState(true)
  const [cycle, setCycle] = useState<BillingCycle>("monthly")

  useEffect(() => {
    let active = true
    fetch("/api/public/plans")
      .then((r) => r.json())
      .then((json) => {
        if (active) setPlans(Array.isArray(json.data) ? json.data : [])
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const hasYearly = plans.some((p) => (p.yearlyPrice ?? 0) > 0)
  const savePercent = (() => {
    const ref = plans.find((p) => p.price > 0 && (p.yearlyPrice ?? 0) > 0)
    if (!ref || !ref.yearlyPrice) return 0
    const pct = Math.round((1 - ref.yearlyPrice / (ref.price * 12)) * 100)
    return pct > 0 ? pct : 0
  })()

  const faqs = [
    { q: t("faqBillingQ"), a: t("faqBillingA") },
    { q: t("faqChangeQ"), a: t("faqChangeA") },
    { q: t("faqCancelQ"), a: t("faqCancelA") },
  ]

  function limitLines(plan: PlanView): string[] {
    // -1 = sınırsız sentinel → ham "-1" yerine "Unlimited"/"Sınırsız".
    const n = (v: number) => (v < 0 ? t("unlimited") : v.toLocaleString(lang))
    return [
      t("limitCompanies", { count: n(plan.maxCompanies) }),
      t("limitDomains", { count: n(plan.maxDomainsPerCompany) }),
      t("limitMembers", { count: n(plan.maxMembersPerCompany) }),
      t("limitMailboxes", { count: n(plan.maxMailboxesPerCompany) }),
      t("limitEmails", { count: n(plan.monthlyEmailLimit) }),
      t("limitStorage", {
        size:
          plan.storageLimit < 0
            ? t("unlimited")
            : formatStorage(plan.storageLimit, lang),
      }),
    ]
  }

  return (
    <div id="top" className="flex min-h-dvh flex-col">
      <MarketingHeader
        lang={lang}
        logoHref={`/${lang}`}
        navItems={[
          { id: "features", label: t("navFeatures"), href: `/${lang}#features` },
          { id: "pricing", label: t("navPricing"), href: `/${lang}/pricing` },
          { id: "faq", label: t("navFaq"), href: `/${lang}/pricing#faq` },
        ]}
        enableSectionTracking={false}
        signedInCta={{ label: t("navDashboard"), href: `/${lang}/d` }}
        signedOutCtas={[
          {
            label: t("signIn"),
            href: `/${lang}/login`,
            variant: "ghost",
            hideOnMobile: true,
          },
          { label: t("getStarted"), href: `/${lang}/signup` },
        ]}
      />

      <main className="flex-1 pt-28">
        {/* Hero */}
        <section className="border-b">
          <div className="mx-auto max-w-6xl px-6 py-16 text-center">
            <Reveal>
              <p className="mb-3 text-sm font-medium tracking-wider text-primary uppercase">
                {t("eyebrow")}
              </p>
            </Reveal>
            <Reveal delay={0.08}>
              <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl lg:text-5xl">
                {t("title")}
              </h1>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mx-auto mt-4 max-w-2xl text-balance text-muted-foreground">
                {t("subtitle")}
              </p>
            </Reveal>

            {hasYearly && (
              <Reveal delay={0.24}>
                <div className="mt-8 inline-flex items-center rounded-full border p-0.5">
                  {(["monthly", "yearly"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCycle(c)}
                      className={cn(
                        "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                        cycle === c
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {c === "monthly" ? t("billingMonthly") : t("billingYearly")}
                      {c === "yearly" && savePercent > 0 && (
                        <span className="ml-1.5 text-xs opacity-80">
                          {t("saveBadge", { percent: savePercent })}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </Reveal>
            )}
          </div>
        </section>

        {/* Plans */}
        <section className="border-b">
          <div className="mx-auto max-w-6xl px-6 py-20">
            {loading ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-96 animate-pulse rounded-2xl border bg-muted/30"
                  />
                ))}
              </div>
            ) : plans.length === 0 ? (
              <p className="text-center text-muted-foreground">{t("empty")}</p>
            ) : (
              <StaggerContainer
                className={cn(
                  "grid gap-6",
                  plans.length >= 3
                    ? "md:grid-cols-2 lg:grid-cols-3"
                    : "md:grid-cols-2",
                )}
              >
                {plans.map((plan) => {
                  const isFree = plan.price === 0
                  const yearly = cycle === "yearly" && (plan.yearlyPrice ?? 0) > 0
                  const amount = yearly ? plan.yearlyPrice! : plan.price
                  const period = yearly ? t("perYear") : t("perMonth")
                  const highlight = plan.isDefault
                  return (
                    <StaggerItem key={plan.id}>
                      <div
                        className={cn(
                          "flex h-full flex-col gap-5 rounded-2xl border bg-background p-6",
                          highlight &&
                            "border-primary shadow-lg ring-1 ring-primary/20",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold">
                            {pickLocalized(plan.name, lang)}
                          </h3>
                          {highlight && (
                            <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
                              {t("popular")}
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-muted-foreground">
                          {pickLocalized(plan.description, lang)}
                        </p>

                        <div className="flex items-baseline gap-1">
                          {isFree ? (
                            <span className="text-4xl font-bold tracking-tight">
                              {t("free")}
                            </span>
                          ) : (
                            <>
                              <span className="text-4xl font-bold tracking-tight">
                                ${amount.toLocaleString(lang)}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {period}
                              </span>
                            </>
                          )}
                        </div>

                        <Button
                          variant={highlight ? "default" : "outline"}
                          render={
                            <a href={isFree ? `/${lang}/signup` : `/${lang}/d`} />
                          }
                        >
                          {isFree ? t("ctaGetStarted") : t("ctaSubscribe")}
                        </Button>

                        <div className="mt-1 flex flex-col gap-2 border-t pt-4">
                          {limitLines(plan).map((line, i) => (
                            <div
                              key={`limit-${i}`}
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
                          {plan.features.map((feat, i) => {
                            const label = pickLocalized(feat, lang)
                            if (!label) return null
                            return (
                              <div
                                key={`feat-${i}`}
                                className="flex items-start gap-2 text-sm"
                              >
                                <HugeiconsIcon
                                  icon={Tick02Icon}
                                  strokeWidth={2.5}
                                  className="mt-0.5 size-4 shrink-0 text-primary"
                                />
                                <span className="text-muted-foreground">
                                  {label}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </StaggerItem>
                  )
                })}
              </StaggerContainer>
            )}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-b">
          <div className="mx-auto max-w-3xl px-6 py-20">
            <Reveal>
              <h2 className="mb-8 text-center text-2xl font-bold tracking-tight sm:text-3xl">
                {t("faqTitle")}
              </h2>
            </Reveal>
            <Reveal delay={0.08}>
              <Accordion className="bg-background">
                {faqs.map((faq, i) => (
                  <AccordionItem key={i} value={`faq-${i}`}>
                    <AccordionTrigger className="text-left text-foreground">
                      {faq.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {faq.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Reveal>
          </div>
        </section>
      </main>

      <MarketingFooter
        lang={lang}
        tagline={t("footerTagline")}
        columns={[
          {
            heading: "Sentroy",
            items: [
              { href: `/${lang}#features`, label: t("navFeatures") },
              { href: `/${lang}/pricing`, label: t("navPricing") },
              { href: "/docs", label: "Docs" },
            ],
          },
        ]}
        copyright={`© ${new Date().getFullYear()} Sentroy`}
        bottomLinks={[
          { label: t("navPricing"), href: `/${lang}/pricing` },
        ]}
      />
    </div>
  )
}
