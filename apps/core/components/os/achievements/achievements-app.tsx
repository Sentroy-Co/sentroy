"use client"

import { useMemo } from "react"
import { motion } from "framer-motion"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon, CheckmarkBadge02Icon, RefreshIcon, Idea01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { useOsStore } from "../os-store"
import { useTourStore, type TourStep } from "@workspace/console/components/tour"
import { WIDGET_VIEW_EVENT } from "../widgets/widget-events"
import {
  ACHIEVEMENT_GROUPS,
  ACHIEVEMENT_TOTAL,
  countDone,
  countGroupDone,
  type AchievementDef,
} from "./catalog"
import { useAchievements } from "./use-achievements"
import { ProgressRing } from "./progress-ring"

const POLL_MS = 60_000

/**
 * Sentroy OS — Başarımlar penceresi (native WindowFrame children).
 * Üstte büyük genel ilerleme halkası, altında ürün bölümleri: grup başlığı
 * (marka ikonu + grup progress + tamamlanmışsa rozet) ve başarım satırları.
 * Tamamlanmamış satırlarda kısa açıklama + küçük CTA ("Open Mail" →
 * os-store.openApp; pencere zaten açıksa öne getirir). Kutlama abartısı yok —
 * Apple tadında sade.
 */
export function AchievementsApp({
  slug,
  availableAppIds,
}: {
  slug: string
  /** stageApps id'leri — kullanıcıda olmayan app'in CTA'sı gösterilmez. */
  availableAppIds: string[]
}) {
  const t = useTranslations("os")
  const { done, failed, refreshing, refresh } = useAchievements(slug, { pollMs: POLL_MS })
  const openApp = useOsStore((s) => s.openApp)
  const openSettings = useOsStore((s) => s.openSettings)
  const startTour = useTourStore((s) => s.start)
  const availableIds = useMemo(() => new Set(availableAppIds), [availableAppIds])

  const doneCount = done ? countDone(done) : 0

  function ctaFor(item: AchievementDef): { label: string; run: () => void } | null {
    if (item.ctaSettingsCategory) {
      const category = item.ctaSettingsCategory
      return {
        label: t(`achievements.ctas.${item.ctaKey ?? "settings"}`),
        run: () => openSettings(category),
      }
    }
    if (item.ctaAction === "open-activity") {
      // Post composer, Activity widget panel'inde — sentroy-os dinler.
      return {
        label: t(`achievements.ctas.${item.ctaKey ?? "post"}`),
        run: () => window.dispatchEvent(new CustomEvent(WIDGET_VIEW_EVENT, { detail: "activity" })),
      }
    }
    if (item.ctaAppId && availableIds.has(item.ctaAppId)) {
      const appId = item.ctaAppId
      return {
        label: t(`achievements.ctas.${item.ctaKey ?? appId}`),
        run: () => openApp(appId),
      }
    }
    return null
  }

  /** Başarım satırındaki ampul → tek adımlık mini tur (özelliği tanıtır +
   *  varsa "Show me" CTA'sı). tipTarget "dock" → dock region spotlight; CSS
   *  seçici → element spotlight; yoksa ortalı kart. */
  function openTip(item: AchievementDef) {
    const cta = ctaFor(item)
    const step: TourStep = {
      title: t(item.labelKey),
      body: t(`achievements.tips.${item.id}`),
      placement: item.tipTarget ? "auto" : "center",
      ...(item.tipTarget === "dock"
        ? { region: "dock" as const }
        : item.tipTarget
          ? { targetSelector: item.tipTarget }
          : {}),
      ...(cta ? { action: cta } : {}),
    }
    startTour([step])
  }

  if (failed) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{t("achievements.window.loadFailed")}</p>
        <Button size="sm" variant="outline" onClick={refresh}>
          {t("achievements.window.retry")}
        </Button>
      </div>
    )
  }

  if (!done) {
    return (
      <div className="flex size-full items-center justify-center">
        <span className="animate-pulse text-sm text-muted-foreground">
          {t("loadingWorkspace")}
        </span>
      </div>
    )
  }

  return (
    <div className="size-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-2xl px-6 py-8">
        {/* Genel ilerleme + refresh */}
        <div className="flex items-center gap-5">
          <ProgressRing value={doneCount / ACHIEVEMENT_TOTAL} size={72} stroke={6} className="text-primary">
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {doneCount}/{ACHIEVEMENT_TOTAL}
            </span>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-foreground">
              {t("achievements.window.completedOf", { done: doneCount, total: ACHIEVEMENT_TOTAL })}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t("achievements.window.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            aria-label={t("achievements.window.refresh")}
            title={t("achievements.window.refresh")}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground disabled:pointer-events-none"
          >
            <HugeiconsIcon
              icon={RefreshIcon}
              strokeWidth={2}
              className={"size-4 " + (refreshing ? "animate-spin" : "")}
            />
          </button>
        </div>

        {/* Ürün bölümleri */}
        <div className="mt-8 space-y-8">
          {ACHIEVEMENT_GROUPS.map((group) => {
            const gDone = countGroupDone(group, done)
            const complete = gDone === group.items.length
            return (
              <section key={group.productId}>
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-black/10 dark:ring-white/10"
                    style={{ background: group.color }}
                  >
                    <HugeiconsIcon icon={group.icon} className="size-3.5 text-white" strokeWidth={2} />
                  </span>
                  <h2 className="text-sm font-semibold text-foreground">{t(group.labelKey)}</h2>
                  {complete ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{ background: `${group.color}1a`, color: group.color }}
                    >
                      <HugeiconsIcon icon={CheckmarkBadge02Icon} className="size-3" strokeWidth={2} />
                      {t("achievements.window.complete")}
                    </span>
                  ) : null}
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                    {gDone}/{group.items.length}
                  </span>
                </div>

                <ul className="mt-3 space-y-1">
                  {group.items.map((item) => {
                    const isDone = Boolean(done[item.id])
                    const cta = isDone ? null : ctaFor(item)
                    return (
                      <li
                        key={item.id}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/50"
                      >
                        {isDone ? (
                          <motion.span
                            initial={{ scale: 0.4, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 420, damping: 22 }}
                            className="flex size-5 shrink-0 items-center justify-center rounded-full"
                            style={{ background: group.color }}
                          >
                            <HugeiconsIcon icon={Tick02Icon} className="size-3 text-white" strokeWidth={3} />
                          </motion.span>
                        ) : (
                          <span className="size-5 shrink-0 rounded-full border-2 border-muted-foreground/30" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-foreground">{t(item.labelKey)}</div>
                          {!isDone ? (
                            <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                              {t(item.descriptionKey)}
                            </div>
                          ) : null}
                        </div>
                        {/* İpucu (ampul) — özelliği tanıtan mini tur. */}
                        {item.hasTip ? (
                          <button
                            type="button"
                            onClick={() => openTip(item)}
                            aria-label={t("achievements.window.tip")}
                            title={t("achievements.window.tip")}
                            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-foreground/10 hover:text-amber-500"
                          >
                            <HugeiconsIcon icon={Idea01Icon} className="size-4" strokeWidth={2} />
                          </button>
                        ) : null}
                        {cta ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 shrink-0 px-2.5 text-xs"
                            onClick={cta.run}
                          >
                            {cta.label}
                          </Button>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
