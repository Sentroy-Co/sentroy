"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import { useCookieConsent } from "@workspace/console/stores/cookie-consent"

function useHasHydrated(): boolean {
  return useSyncExternalStore(
    (cb) => useCookieConsent.persist.onFinishHydration(cb),
    () => useCookieConsent.persist.hasHydrated(),
    () => false,
  )
}

export function CookieConsent() {
  const t = useTranslations("landing")
  const consent = useCookieConsent((s) => s.consent)
  const preferencesOpen = useCookieConsent((s) => s.preferencesOpen)
  const acceptAll = useCookieConsent((s) => s.acceptAll)
  const rejectAll = useCookieConsent((s) => s.rejectAll)
  const save = useCookieConsent((s) => s.save)
  const openPreferences = useCookieConsent((s) => s.openPreferences)
  const closePreferences = useCookieConsent((s) => s.closePreferences)
  const hydrated = useHasHydrated()
  // Sentroy OS embed modunda (iframe/?embed) consent banner'ı gösterme — host
  // sayfa zaten kendi consent'ini yönetir, çift banner UX kirliliği olur.
  // `[data-embedded]` UIProviders script'i paint'ten önce set eder.
  const [embedded, setEmbedded] = useState(false)
  useEffect(() => {
    setEmbedded(document.documentElement.dataset.embedded === "1")
  }, [])

  // Footer'dan tetiklenen "open preferences" event'i
  useEffect(() => {
    const onOpen = () => openPreferences()
    window.addEventListener("open-cookie-preferences", onOpen)
    return () => window.removeEventListener("open-cookie-preferences", onOpen)
  }, [openPreferences])

  if (!hydrated || embedded) return null

  const showBanner = !consent

  return (
    <>
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 120, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4 sm:bottom-4 sm:px-6"
          >
            <div className="mx-auto flex max-w-4xl flex-col gap-4 rounded-2xl border bg-background/95 p-5 shadow-2xl backdrop-blur-md sm:flex-row sm:items-center sm:gap-6 sm:p-6">
              <div className="flex-1">
                <p className="text-sm font-semibold">{t("cookieTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("cookieDescription")}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openPreferences()}
                >
                  {t("cookiePreferences")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => rejectAll()}
                >
                  {t("cookieReject")}
                </Button>
                <Button size="sm" onClick={() => acceptAll()}>
                  {t("cookieAccept")}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog
        open={preferencesOpen}
        onOpenChange={(o) => (o ? null : closePreferences())}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("cookiePreferencesTitle")}</DialogTitle>
            <DialogDescription>
              {t("cookiePreferencesDescription")}
            </DialogDescription>
          </DialogHeader>
          {preferencesOpen && (
            <PreferencesForm
              initialAnalytics={consent?.analytics ?? true}
              initialMarketing={consent?.marketing ?? false}
              onReject={() => rejectAll()}
              onCancel={() => closePreferences()}
              onSave={(analytics, marketing) => save({ analytics, marketing })}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function PreferencesForm({
  initialAnalytics,
  initialMarketing,
  onReject,
  onCancel,
  onSave,
}: {
  initialAnalytics: boolean
  initialMarketing: boolean
  onReject: () => void
  onCancel: () => void
  onSave: (analytics: boolean, marketing: boolean) => void
}) {
  const t = useTranslations("landing")
  const [analytics, setAnalytics] = useState(initialAnalytics)
  const [marketing, setMarketing] = useState(initialMarketing)

  return (
    <>
      <div className="flex flex-col gap-3">
        <CookieRow
          title={t("cookieNecessaryTitle")}
          description={t("cookieNecessaryDesc")}
          checked={true}
          disabled
        />
        <CookieRow
          title={t("cookieAnalyticsTitle")}
          description={t("cookieAnalyticsDesc")}
          checked={analytics}
          onChange={setAnalytics}
        />
        <CookieRow
          title={t("cookieMarketingTitle")}
          description={t("cookieMarketingDesc")}
          checked={marketing}
          onChange={setMarketing}
        />
      </div>

      <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={onReject}>
          {t("cookieReject")}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-4" />
            {t("cookieCancel")}
          </Button>
          <Button onClick={() => onSave(analytics, marketing)}>
            {t("cookieSave")}
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}

function CookieRow({
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  title: string
  description: string
  checked: boolean
  onChange?: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-start gap-4 rounded-xl border p-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  )
}
