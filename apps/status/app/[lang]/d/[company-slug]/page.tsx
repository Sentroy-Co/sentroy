import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { HugeiconsIcon } from "@hugeicons/react"
import { ChartBarLineIcon, ArrowRight01Icon } from "@hugeicons/core-free-icons"

/**
 * status.sentroy.com dashboard overview — basit landing, "Open status page
 * management" ile tek-tıkla Phase 3.3 yönetim sayfasına yönlendirir.
 * (Phase 5+'da incident, maintenance, subscriber widget'ları eklenir.)
 */
export default async function StatusOverviewPage({
  params,
}: {
  params: Promise<{ "company-slug": string; lang: string }>
}) {
  const { "company-slug": slug, lang } = await params
  const basePath = `/${lang}/d/${slug}`
  const t = await getTranslations({ locale: lang, namespace: "statusDashboard" })

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("overviewTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("overviewDescription")}
        </p>
      </div>

      <Link
        href={`${basePath}/status`}
        className="group flex items-center justify-between gap-4 rounded-xl border bg-card p-5 transition-colors hover:border-foreground/30 hover:bg-muted/40"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <HugeiconsIcon
              icon={ChartBarLineIcon}
              strokeWidth={2}
              className="size-5"
            />
          </div>
          <div>
            <h2 className="text-base font-semibold">{t("mgmtCardTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("mgmtCardDescription")}
            </p>
          </div>
        </div>
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          strokeWidth={2}
          className="size-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5"
        />
      </Link>
    </div>
  )
}
