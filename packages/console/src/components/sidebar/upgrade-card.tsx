"use client"

import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { SparklesIcon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import type { Company } from "@workspace/db/types"

/**
 * Free (aktif ücretli aboneliği olmayan) company'ler için sidebar footer
 * upsell kartı. Tüm app'lerde paylaşılır; yükseltme her zaman CORE app'in
 * billing sayfasına yönlendirir — `billingHref` caller'da hesaplanır
 * (core'da relative, diğer subdomain'lerde core'un absolute URL'i).
 *
 * Aktif/trialing abonelik varsa hiç render edilmez. Sidebar icon-collapsed
 * modunda gizlenir (`group-data-[collapsible=icon]:hidden`).
 */
export function SidebarUpgradeCard({
  company,
  billingHref,
}: {
  company: Company
  billingHref: string
}) {
  const t = useTranslations("upgradeCard")
  const status = company.subscription?.status
  if (status === "active" || status === "trialing") return null

  return (
    <div className="px-1 pb-1 group-data-[collapsible=icon]:hidden">
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-3">
        <div className="pointer-events-none absolute -top-5 -right-5 size-16 rounded-full bg-primary/15 blur-2xl" />
        <div className="flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <HugeiconsIcon
              icon={SparklesIcon}
              strokeWidth={2}
              className="size-4"
            />
          </span>
          <span className="text-sm font-semibold">{t("title")}</span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {t("subtitle")}
        </p>
        <Button
          size="sm"
          className="mt-2.5 w-full"
          render={<a href={billingHref} />}
        >
          {t("cta")}
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            strokeWidth={2}
            className="size-3.5"
          />
        </Button>
      </div>
    </div>
  )
}
