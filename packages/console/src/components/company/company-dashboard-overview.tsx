"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { motion } from "framer-motion"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  BuildingIcon,
  Settings02Icon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons"
import { buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

export interface CompanyDashboardOverviewProfile {
  slug: string
  name: string
  avatarUrl: string | null
  coverImageUrl: string | null
  description: string | null
  memberCount: number
  canManage: boolean
}

/**
 * Core `/d/[company]` anasayfası — şirket profil kartı (kapak, avatar, üye
 * sayısı, feed / ayarlar / halka açık profil linkleri). `/profile/c/...`
 * sayfasındaki görünümle uyumlu, feed olmadan.
 */
export function CompanyDashboardOverview({
  profile,
  lang,
}: {
  profile: CompanyDashboardOverviewProfile
  lang: string
}) {
  const t = useTranslations("companyProfile")

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="w-full overflow-hidden rounded-2xl border bg-card shadow-sm"
    >
      <CoverImage url={profile.coverImageUrl} />

      <div className="flex flex-col gap-4 px-5 pb-5 pt-3 sm:px-6 sm:pb-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex items-end gap-4">
            <CompanyAvatar
              url={profile.avatarUrl}
              name={profile.name}
              className="-mt-12 md:-mt-14"
            />
            <div className="flex min-w-0 flex-col gap-0.5 pb-1">
              <h2 className="truncate text-xl font-semibold leading-tight md:text-2xl">
                {profile.name}
              </h2>
              <p className="truncate font-mono text-xs text-muted-foreground">
                /profile/c/{profile.slug}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pb-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs">
              <HugeiconsIcon
                icon={UserMultipleIcon}
                strokeWidth={2}
                className="size-3.5"
              />
              {t("memberCount", { count: profile.memberCount })}
            </span>
            <Link
              href={`/${lang}/profile/c/${profile.slug}`}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              {t("openProfilePage")}
            </Link>
            {profile.canManage && (
              <Link
                href={`/${lang}/d/${profile.slug}/settings`}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                <HugeiconsIcon
                  icon={Settings02Icon}
                  strokeWidth={2}
                  className="size-3.5"
                  data-icon="inline-start"
                />
                {t("manage")}
              </Link>
            )}
          </div>
        </div>

        {profile.description && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {profile.description}
          </p>
        )}
      </div>
    </motion.section>
  )
}

function CoverImage({ url }: { url: string | null }) {
  return (
    <div className="relative aspect-[6/1] w-full bg-gradient-to-br from-primary/15 via-muted/30 to-primary/5 sm:aspect-[8/1]">
      {url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : null}
    </div>
  )
}

function CompanyAvatar({
  url,
  name,
  className,
}: {
  url: string | null
  name: string
  className?: string
}) {
  const [errored, setErrored] = useState(false)
  useEffect(() => {
    setErrored(false)
  }, [url])
  const showImage = !!url && !errored
  return (
    <span
      className={cn(
        "relative z-10 flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-card bg-muted shadow-md md:size-24",
        className,
      )}
      title={name}
    >
      {showImage ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={url ?? undefined}
          alt={name}
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <HugeiconsIcon
          icon={BuildingIcon}
          strokeWidth={1.5}
          className="size-10 text-muted-foreground/50"
        />
      )}
    </span>
  )
}
