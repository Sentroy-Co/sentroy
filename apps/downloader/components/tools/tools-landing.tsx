import { getTranslations } from "next-intl/server"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Pdf01Icon,
  Image01Icon,
  VideoReplayIcon,
  MusicNote01Icon,
  WrenchIcon,
  SourceCodeIcon,
  SparklesIcon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons"
import type { Locale } from "@/i18n/routing"
import {
  toolsByCategory,
  categoryLabel,
  toolPath,
  localeOf,
  type ToolCategory,
} from "@/lib/tools/registry"

const CATEGORY_ICON: Record<ToolCategory, typeof Pdf01Icon> = {
  pdf: Pdf01Icon,
  image: Image01Icon,
  audio: MusicNote01Icon,
  video: VideoReplayIcon,
  utility: WrenchIcon,
  developer: SourceCodeIcon,
}

// Her kategoriye ayrı renk — ikon rozeti + kart hover'ında kullanılır.
const CATEGORY_COLOR: Record<ToolCategory, string> = {
  image: "#38bdf8", // sky
  pdf: "#f43f5e", // rose
  audio: "#a78bfa", // violet
  video: "#fb923c", // orange
  utility: "#34d399", // emerald
  developer: "#818cf8", // indigo
}

/**
 * tools.sentroy.com ana sayfa içeriği — hero + kategori kategori araç gridi.
 * İndexlenebilir (her araç sayfasına iç bağlantı). "soon" araçlar rozetli.
 */
export async function ToolsLanding({ lang }: { lang: Locale }) {
  const t = await getTranslations({ locale: lang, namespace: "d" })
  const groups = toolsByCategory(lang)

  return (
    <main className="relative mx-auto w-full max-w-6xl px-4 pb-24">
      {/* Hero */}
      <section className="relative flex flex-col items-center gap-5 pt-20 pb-16 text-center sm:pt-28">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
          <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} className="size-3.5" />
          {t("toolsHeroBadge")}
        </span>
        <h1 className="max-w-3xl bg-gradient-to-b from-foreground to-foreground/55 bg-clip-text pb-1 text-4xl font-bold tracking-tight text-transparent sm:text-6xl">
          {t("toolsHeroTitle")}
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          {t("toolsHeroSubtitle")}
        </p>
      </section>

      {/* Kategori kategori araçlar */}
      <div className="flex flex-col gap-14">
        {groups.map((g) => {
          const color = CATEGORY_COLOR[g.category]
          return (
          <section key={g.category} id={g.category} className="scroll-mt-20">
            <div className="mb-5 flex items-center gap-3">
              <span
                className="flex size-9 items-center justify-center rounded-xl"
                style={{ color, backgroundColor: color + "1f" }}
              >
                <HugeiconsIcon
                  icon={CATEGORY_ICON[g.category]}
                  strokeWidth={2}
                  className="size-5"
                />
              </span>
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                {categoryLabel(g.category, lang)}
              </h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.tools.map((tool) => {
                const loc = localeOf(tool, lang)!
                const soon = tool.status === "soon"
                return (
                  <a
                    key={tool.id}
                    href={toolPath(lang, loc.slug)}
                    style={{ ["--cat" as string]: color }}
                    className="group flex flex-col gap-1.5 rounded-2xl border bg-card p-5 transition-colors hover:border-[var(--cat)]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold transition-colors group-hover:text-[var(--cat)]">
                        {loc.title}
                      </span>
                      {soon ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("toolSoon")}
                        </span>
                      ) : null}
                      {tool.paid ? (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ color, backgroundColor: color + "1f" }}
                        >
                          {t("toolPaid")}
                        </span>
                      ) : null}
                      <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        strokeWidth={2}
                        className="ms-auto size-4 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-[var(--cat)]"
                      />
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {loc.description}
                    </p>
                  </a>
                )
              })}
            </div>
          </section>
          )
        })}
      </div>
    </main>
  )
}
