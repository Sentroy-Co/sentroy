"use client"

import { useCallback, useEffect } from "react"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import {
  TourOverlay,
  useTourStore,
  type TourStep,
} from "@workspace/console/components/tour"
import { useCompanyDataStore } from "@workspace/console/stores/company-data"

/** İlk-giriş turlarının bir-kez flag'leri. Aşama-farkında: domain gate
 *  kalkmadan (verified domain yokken) sadece Aşama A; domain aktif olunca
 *  Aşama B (mailbox). */
export const MAIL_TOUR_DOMAIN_KEY = "mail-tour-domain-done"
export const MAIL_TOUR_MAILBOX_KEY = "mail-tour-mailbox-done"

type T = ReturnType<typeof useTranslations>

/** Aşama A — domain kaydı: "İlk domain'ini ekle" (Add domain spotlight) +
 *  DNS doğrulama adımını tanıt. */
function domainSteps(t: T): TourStep[] {
  return [
    {
      title: t("steps.domainAdd.title"),
      body: t("steps.domainAdd.body"),
      targetSelector: "[data-tour='add-domain']",
      placement: "bottom",
    },
    {
      title: t("steps.domainVerify.title"),
      body: t("steps.domainVerify.body"),
      placement: "center",
    },
  ]
}

/** Aşama B — mailbox: "İlk mailbox'ını oluştur" (Create mailbox spotlight). */
function mailboxSteps(t: T): TourStep[] {
  return [
    {
      title: t("steps.mailboxCreate.title"),
      body: t("steps.mailboxCreate.body"),
      targetSelector: "[data-tour='add-mailbox']",
      placement: "bottom",
    },
  ]
}

/** Domains/Mailboxes sayfalarındaki "?" tekrar-başlat butonları bunu kullanır. */
export function useMailTour() {
  const t = useTranslations("tour")
  const start = useTourStore((s) => s.start)
  const startDomainTour = useCallback(() => start(domainSteps(t)), [start, t])
  const startMailboxTour = useCallback(() => start(mailboxSteps(t)), [start, t])
  return { startDomainTour, startMailboxTour }
}

/**
 * Mail app in-app onboarding turu — layout'ta bir kez mount edilir.
 * Overlay'i render eder + durum-farkında ilk-giriş otomatiğini yürütür.
 *
 * Domain gate: `useCompanyDataStore` (sidebar'ın `requiresDomain` gate'i ile
 * aynı kaynak). `hasVerifiedDomain` false → Aşama A (domains sayfası),
 * true → Aşama B (mailboxes sayfası). Her aşama kendi localStorage flag'iyle
 * bir kez; ikinci girişte sessiz.
 */
export function MailTour() {
  const t = useTranslations("tour")
  const pathname = usePathname()
  const { startDomainTour, startMailboxTour } = useMailTour()
  const domainsLoaded = useCompanyDataStore((s) => s.domainsLoaded)
  const hasVerifiedDomain = useCompanyDataStore((s) => s.hasVerifiedDomain)

  // Aşama A — verified domain YOKKEN, domains sayfasında bir kez.
  useEffect(() => {
    if (!domainsLoaded || hasVerifiedDomain) return
    if (!pathname.endsWith("/domains")) return
    let done = false
    try {
      done = localStorage.getItem(MAIL_TOUR_DOMAIN_KEY) === "1"
    } catch {
      /* ignore */
    }
    if (done) return
    const id = setTimeout(() => {
      try {
        localStorage.setItem(MAIL_TOUR_DOMAIN_KEY, "1")
      } catch {
        /* ignore */
      }
      startDomainTour()
    }, 800)
    return () => clearTimeout(id)
  }, [domainsLoaded, hasVerifiedDomain, pathname, startDomainTour])

  // Aşama B — verified domain VARKEN (guard kalkınca), mailboxes sayfasında bir kez.
  useEffect(() => {
    if (!domainsLoaded || !hasVerifiedDomain) return
    if (!pathname.endsWith("/mailboxes")) return
    let done = false
    try {
      done = localStorage.getItem(MAIL_TOUR_MAILBOX_KEY) === "1"
    } catch {
      /* ignore */
    }
    if (done) return
    const id = setTimeout(() => {
      try {
        localStorage.setItem(MAIL_TOUR_MAILBOX_KEY, "1")
      } catch {
        /* ignore */
      }
      startMailboxTour()
    }, 800)
    return () => clearTimeout(id)
  }, [domainsLoaded, hasVerifiedDomain, pathname, startMailboxTour])

  return (
    <TourOverlay
      labels={{
        next: t("next"),
        back: t("back"),
        skip: t("skip"),
        done: t("done"),
      }}
    />
  )
}
