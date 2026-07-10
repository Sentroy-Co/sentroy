"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { SparklesIcon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"

/**
 * Masaüstü upsell widget'ı — core sidebar'daki SidebarUpgradeCard'ın OS karşılığı.
 * Aktif şirketin ücretli aboneliği yoksa (status active/trialing değil) sol-altta
 * cam bir kart gösterir; "Upgrade" → System Settings penceresi Billing sekmesi.
 * Pencerelerin arkasında durur (masaüstü widget'ı); boş masaüstünde görünür.
 */
export function DesktopUpgradeCard({ slug, onUpgrade }: { slug: string | null; onUpgrade: () => void }) {
  const t = useTranslations("upgradeCard")
  const [status, setStatus] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    setStatus(undefined)
    ;(async () => {
      try {
        const r = await fetch(`/api/companies/${slug}`)
        const j = await r.json()
        if (!cancelled) setStatus((j?.data?.subscription?.status as string | null) ?? null)
      } catch {
        if (!cancelled) setStatus(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  if (status === undefined || status === "active" || status === "trialing") return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, type: "spring", stiffness: 300, damping: 28 }}
      className="pointer-events-auto absolute bottom-4 left-4 z-[5] w-72 select-none"
    >
      <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-background/80 p-4 shadow-[0_16px_50px_-12px_rgba(0,0,0,0.5)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10">
        <div className="pointer-events-none absolute -right-6 -top-6 size-20 rounded-full bg-primary/20 blur-2xl" />
        <div className="flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} className="size-4" />
          </span>
          <span className="text-sm font-semibold text-foreground">{t("title")}</span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{t("subtitle")}</p>
        <Button size="sm" className="mt-2.5 w-full gap-1.5" onClick={onUpgrade}>
          {t("cta")}
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3.5" />
        </Button>
      </div>
    </motion.div>
  )
}
