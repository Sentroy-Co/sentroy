"use client"

import { useEffect } from "react"
import { useTranslations } from "next-intl"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@workspace/ui/components/tooltip"
import { useDesktopWidgets } from "../widgets/widget-store"
import { ACHIEVEMENT_GROUPS, ACHIEVEMENT_TOTAL, countDone } from "./catalog"
import { useAchievements } from "./use-achievements"
import { ProgressRing } from "./progress-ring"

const POLL_MS = 120_000

/**
 * Menü-bar Başarımlar pill'i — saat bölgesinin SOLUNDA kompakt gösterge.
 * Yalnız masaüstünde achievements widget'ı YOKKEN (✕ ile kaldırılmış) VE
 * ilerleme <%100 iken görünür: mini progress halkası + yüzde; hover
 * tooltip'inde sıradaki başarım; tıklama → Achievements penceresi.
 *
 * Widget durumu paylaşılan zustand store'dan (widget-store) okunur — ✕ ile
 * kaldırma pill'e AYNI render döngüsünde yansır (localStorage event beklemez).
 */
export function AchievementsMenuPill({
  slug,
  onOpen,
}: {
  slug: string | null
  onOpen: () => void
}) {
  const loaded = useDesktopWidgets((s) => s.loaded)
  const storeSlug = useDesktopWidgets((s) => s.slug)
  const hasWidget = useDesktopWidgets((s) =>
    s.widgets.some((w) => w.type === "achievements"),
  )
  const load = useDesktopWidgets((s) => s.load)

  // Widget layer henüz yüklemediyse (mount sırası) idempotent yükle.
  useEffect(() => {
    if (slug) load(slug)
  }, [slug, load])

  if (!slug || !loaded || storeSlug !== slug || hasWidget) return null
  return <PillInner slug={slug} onOpen={onOpen} />
}

/** Ayrı bileşen: fetch yalnız pill gerçekten aday olduğunda çalışsın. */
function PillInner({ slug, onOpen }: { slug: string; onOpen: () => void }) {
  const t = useTranslations("os")
  const { done, failed } = useAchievements(slug, { pollMs: POLL_MS })

  if (failed || !done) return null
  const doneCount = countDone(done)
  if (doneCount >= ACHIEVEMENT_TOTAL) return null
  const percent = Math.round((doneCount / ACHIEVEMENT_TOTAL) * 100)

  // Sıradaki başarım — katalog sırasında ilk tamamlanmamış.
  const next = ACHIEVEMENT_GROUPS.flatMap((g) => g.items).find((i) => !done[i.id])

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            data-tour="achievements"
            onClick={onOpen}
            aria-label={t("achievements.appName")}
            className="flex h-7 items-center gap-1.5 rounded-full px-2 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <ProgressRing value={doneCount / ACHIEVEMENT_TOTAL} size={16} stroke={2.5} className="text-primary" />
            <span className="text-xs font-medium tabular-nums">{percent}%</span>
          </button>
        }
      />
      <TooltipContent side="bottom">
        {next
          ? t("achievements.pill.next", { name: t(next.labelKey) })
          : t("achievements.appName")}
      </TooltipContent>
    </Tooltip>
  )
}
