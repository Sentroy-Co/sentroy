"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { motion, AnimatePresence } from "framer-motion"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Link01Icon,
  Settings05Icon,
  Download04Icon,
  ArrowRight01Icon,
  ArrowDown01Icon,
} from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"

const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
}

/**
 * Kompakt "nasıl indirilir" — hero altındaki 25svh banda sığar. 3 adım yatay
 * dizi, hover'da renklenen ikonlar, aralarında ok bağlayıcı.
 */
export function HowItWorks() {
  const t = useTranslations("d")
  const steps = [
    { icon: Link01Icon, title: t("how1Title") },
    { icon: Settings05Icon, title: t("how2Title") },
    { icon: Download04Icon, title: t("how3Title") },
  ]
  return (
    <motion.div
      {...reveal}
      className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4"
    >
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/70">
        {t("howTitle")}
      </span>
      <div className="flex w-full items-center justify-center gap-2 sm:gap-4">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2 sm:gap-4">
            <div className="group flex flex-col items-center gap-2 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-all duration-300 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground sm:size-14">
                <HugeiconsIcon icon={s.icon} strokeWidth={2} className="size-5 sm:size-6" />
              </span>
              <span className="max-w-24 text-xs font-medium leading-tight text-muted-foreground sm:max-w-32 sm:text-sm">
                {s.title}
              </span>
            </div>
            {i < steps.length - 1 ? (
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={2}
                className="size-4 shrink-0 text-muted-foreground/30 sm:size-5"
              />
            ) : null}
          </div>
        ))}
      </div>
    </motion.div>
  )
}

export function FaqSection() {
  const t = useTranslations("d")
  const faqs = [
    { q: t("faq1Q"), a: t("faq1A") },
    { q: t("faq2Q"), a: t("faq2A") },
    { q: t("faq3Q"), a: t("faq3A") },
    { q: t("faq4Q"), a: t("faq4A") },
  ]
  const [open, setOpen] = useState<number | null>(0)
  return (
    <motion.section {...reveal} className="w-full py-12">
      <h2 className="mb-8 text-center text-2xl font-bold tracking-tight sm:text-3xl">
        {t("faqTitle")}
      </h2>
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        {faqs.map((f, i) => {
          const active = open === i
          return (
            <div
              key={i}
              className={cn(
                "overflow-hidden rounded-2xl border transition-colors",
                active ? "border-primary/40 bg-card" : "bg-card/40 hover:bg-card/70",
              )}
            >
              <button
                type="button"
                onClick={() => setOpen(active ? null : i)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left font-medium"
              >
                {f.q}
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  strokeWidth={2}
                  className={cn(
                    "size-5 shrink-0 text-muted-foreground transition-transform",
                    active && "rotate-180 text-primary",
                  )}
                />
              </button>
              <AnimatePresence initial={false}>
                {active ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <p className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground">
                      {f.a}
                    </p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </motion.section>
  )
}
