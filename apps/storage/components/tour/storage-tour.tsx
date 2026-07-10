"use client"

import { useCallback, useEffect } from "react"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import {
  TourOverlay,
  useTourStore,
  type TourStep,
} from "@workspace/console/components/tour"

/** İlk-giriş turunun bir-kez flag'i. */
export const STORAGE_TOUR_KEY = "storage-tour-done"

type T = ReturnType<typeof useTranslations>

/** Buckets sayfası turu: "İlk bucket'ını oluştur" (Create bucket spotlight) →
 *  dosya yükleme alanını tanıt (bucket açıldıktan sonra, ortalı bilgi adımı). */
function bucketSteps(t: T): TourStep[] {
  return [
    {
      title: t("steps.bucketCreate.title"),
      body: t("steps.bucketCreate.body"),
      targetSelector: "[data-tour='create-bucket']",
      placement: "bottom",
    },
    {
      title: t("steps.upload.title"),
      body: t("steps.upload.body"),
      placement: "center",
    },
  ]
}

/** Buckets sayfasındaki "?" tekrar-başlat butonu bunu kullanır. */
export function useStorageTour() {
  const t = useTranslations("tour")
  const start = useTourStore((s) => s.start)
  const startBucketTour = useCallback(() => start(bucketSteps(t)), [start, t])
  return { startBucketTour }
}

/**
 * Storage app in-app onboarding turu — layout'ta bir kez mount edilir.
 * Overlay'i render eder + buckets sayfasında ilk-giriş otomatiğini yürütür.
 * localStorage flag'iyle bir kez; ikinci girişte sessiz.
 */
export function StorageTour() {
  const t = useTranslations("tour")
  const pathname = usePathname()
  const { startBucketTour } = useStorageTour()

  useEffect(() => {
    if (!pathname.endsWith("/buckets")) return
    let done = false
    try {
      done = localStorage.getItem(STORAGE_TOUR_KEY) === "1"
    } catch {
      /* ignore */
    }
    if (done) return
    const id = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_TOUR_KEY, "1")
      } catch {
        /* ignore */
      }
      startBucketTour()
    }, 800)
    return () => clearTimeout(id)
  }, [pathname, startBucketTour])

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
