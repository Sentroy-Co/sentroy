"use client"

import { useCallback } from "react"
import { useTranslations } from "next-intl"
import { useTourStore, type TourStep } from "@workspace/console/components/tour"

export const OS_TOUR_DONE_KEY = "os-tour-done"

type T = ReturnType<typeof useTranslations>

/**
 * OS tanıtım turu adımları — menü bar → dock → pencereler → widget'lar/sağ-tık
 * → başarımlar. i18n `os.tour.app.*`. data-tour hedefleri: menubar-company,
 * (dock: region), achievements (widget veya menü pill). Pencere/widget adımları
 * ortalı (spotlight'lanacak sabit element yok).
 */
export function buildOsTour(t: T): TourStep[] {
  return [
    {
      title: t("tour.app.menubar.title"),
      body: t("tour.app.menubar.body"),
      targetSelector: "[data-tour='menubar-company']",
      placement: "bottom",
    },
    {
      title: t("tour.app.dock.title"),
      body: t("tour.app.dock.body"),
      region: "dock",
      placement: "top",
    },
    {
      title: t("tour.app.windows.title"),
      body: t("tour.app.windows.body"),
      placement: "center",
    },
    {
      title: t("tour.app.widgets.title"),
      body: t("tour.app.widgets.body"),
      placement: "center",
    },
    {
      title: t("tour.app.achievements.title"),
      body: t("tour.app.achievements.body"),
      targetSelector: "[data-tour='achievements']",
      placement: "auto",
    },
  ]
}

/** OS turunu başlatan callback — menü bar ve ilk-giriş otomatiği kullanır. */
export function useOsTour() {
  const t = useTranslations("os")
  const start = useTourStore((s) => s.start)
  return useCallback(() => start(buildOsTour(t)), [start, t])
}
