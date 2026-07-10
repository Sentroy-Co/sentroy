"use client"

import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon, CheckmarkBadge02Icon, Alert02Icon } from "@hugeicons/core-free-icons"
import {
  ACHIEVEMENT_GROUPS,
  ACHIEVEMENT_TOTAL,
  countDone,
  countGroupDone,
} from "./catalog"
import { useAchievements } from "./use-achievements"
import { ProgressRing } from "./progress-ring"

const SLIDE_MS = 5500
const POLL_MS = 120_000

/**
 * Başarımlar masaüstü widget İÇERİĞİ — widget platformunun (widgets/widget-layer)
 * "achievements" tipi. Konumlandırma/sürükleme/kaldırma chrome'u WidgetShell'de;
 * burada yalnız kart içeriği: başlıkta yüzdeli genel-ilerleme halkası, ürün
 * grupları arasında otomatik dönen carousel (hover'da durur), nokta
 * göstergeleri. Kartın herhangi bir yerine tıklama → native Achievements
 * penceresi. Hata → küçük hata durumu (gizlenme yok — kullanıcı ✕ ile kaldırır).
 */
export function AchievementsWidgetContent({
  slug,
  onOpen,
}: {
  slug: string | null
  /** Achievements penceresini aç (openApp("achievements", descriptor)). */
  onOpen: () => void
}) {
  const t = useTranslations("os")
  const { done, failed } = useAchievements(slug, { pollMs: POLL_MS })
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  const groups = ACHIEVEMENT_GROUPS
  const doneCount = done ? countDone(done) : 0
  const allDone = done ? doneCount >= ACHIEVEMENT_TOTAL : false
  const percent = Math.round((doneCount / ACHIEVEMENT_TOTAL) * 100)

  // Otomatik slayt — hover'da / veri yokken / hepsi bittiğinde durur.
  useEffect(() => {
    if (paused || !done || allDone) return
    const id = setInterval(() => setIndex((i) => (i + 1) % groups.length), SLIDE_MS)
    return () => clearInterval(id)
  }, [paused, done, allDone, groups.length])

  const slide = useMemo(() => {
    const group = groups[index % groups.length]!
    const gDone = done ? countGroupDone(group, done) : 0
    const next = done ? group.items.find((i) => !done[i.id]) : undefined
    return { group, gDone, next }
  }, [groups, index, done])

  if (failed) {
    return (
      <div className="flex h-[120px] flex-col items-center justify-center gap-1.5 p-4 text-center">
        <HugeiconsIcon icon={Alert02Icon} className="size-4 text-muted-foreground/70" strokeWidth={2} />
        <p className="text-xs text-muted-foreground">{t("widgetsHub.loadError")}</p>
      </div>
    )
  }

  if (!done) {
    return (
      <div className="flex h-[120px] items-center justify-center p-4">
        <span className="size-5 animate-spin rounded-full border-2 border-muted border-t-foreground/40" />
      </div>
    )
  }

  const { group, gDone, next } = slide

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={t("achievements.appName")}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen()
        }
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative cursor-pointer p-4 outline-none"
    >
      {/* Köşe halo — aktif slaytın marka rengiyle. */}
      <div
        className="pointer-events-none absolute -right-6 -top-6 size-20 rounded-full blur-2xl transition-colors duration-500"
        style={{ background: `${group.color}33` }}
      />

      {/* Başlık — yüzdeli genel-ilerleme halkası başlıkla entegre. */}
      <div className="flex items-center gap-3">
        <ProgressRing value={doneCount / ACHIEVEMENT_TOTAL} size={40} stroke={3.5} className="text-primary">
          <span className="text-[10px] font-semibold tabular-nums text-foreground">{percent}%</span>
        </ProgressRing>
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight text-foreground">
            {t("achievements.widget.title")}
          </div>
          <div className="text-xs tabular-nums text-muted-foreground">
            {doneCount}/{ACHIEVEMENT_TOTAL}
          </div>
        </div>
      </div>

      {allDone ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <HugeiconsIcon icon={CheckmarkBadge02Icon} className="size-4 text-emerald-500" strokeWidth={2} />
          {t("achievements.widget.allDone")}
        </p>
      ) : (
        <>
          {/* Carousel gövdesi */}
          <div className="relative mt-3 h-[74px]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={group.productId}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="absolute inset-0"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-white/25 dark:ring-white/10"
                    style={{ background: group.color }}
                  >
                    <HugeiconsIcon icon={group.icon} className="size-4 text-white" strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {t(group.labelKey)}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {gDone}/{group.items.length}
                      </span>
                    </div>
                    {/* İnce grup progress barı */}
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-foreground/10">
                      <div
                        className="h-full rounded-full transition-[width] duration-500 ease-out"
                        style={{
                          width: `${Math.round((gDone / group.items.length) * 100)}%`,
                          background: group.color,
                        }}
                      />
                    </div>
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {next ? (
                    t("achievements.widget.next", { name: t(next.labelKey) })
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-emerald-500" strokeWidth={2.5} />
                      {t("achievements.widget.groupDone")}
                    </span>
                  )}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Nokta göstergeleri */}
          <div className="mt-1 flex items-center justify-center gap-1.5">
            {groups.map((g, i) => (
              <button
                key={g.productId}
                type="button"
                aria-label={t(g.labelKey)}
                onClick={(e) => {
                  e.stopPropagation()
                  setIndex(i)
                }}
                className={
                  "size-1.5 rounded-full transition-all duration-300 " +
                  (i === index % groups.length
                    ? "w-3 bg-foreground/70"
                    : "bg-foreground/25 hover:bg-foreground/45")
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
