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
import { ProfileShell } from "@workspace/console/components/profile/profile-shell"
import { CompanyFeed } from "@workspace/console/components/social/company-feed"
import { OsLinkBridge } from "@workspace/console/components/social/os-link-bridge"
import { cn } from "@workspace/ui/lib/utils"

interface CompanyProfile {
  id: string
  slug: string
  name: string
  avatarUrl: string | null
  coverImageUrl: string | null
  description: string | null
  memberCount: number
  canManage: boolean
}

interface CompanyProfileContentProps {
  profile: CompanyProfile
  lang: string
  viewer: {
    id: string
    name: string | null
    image: string | null
  } | null
}

/**
 * Facebook-page style company profile. Wide cover photo + overlapping
 * avatar tile + identity row + post feed. The feed reuses the same
 * `CompanyFeed` mounted on `/d/[company]/posts` — no duplicate logic;
 * the only difference is the surrounding chrome (ProfileShell instead
 * of the dashboard sidebar).
 *
 * Cover photo upload lives in `/d/[company]/settings → Branding`; this
 * page only renders. A "Manage" button takes admins/owners directly to
 * the settings page so they don't have to context-switch.
 */
export function CompanyProfileContent({
  profile,
  lang,
  viewer,
}: CompanyProfileContentProps) {
  const t = useTranslations("companyProfile")

  return (
    <ProfileShell mode="owner" slug={null}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
        <motion.section
          layout
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden rounded-2xl border bg-card shadow-sm"
        >
          <CoverImage url={profile.coverImageUrl} />

          <div className="flex flex-col gap-4 px-5 pb-5 pt-3 sm:px-6 sm:pb-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="flex items-end gap-4">
                <CompanyAvatar
                  url={profile.avatarUrl}
                  name={profile.name}
                  className="relative z-10 -mt-12 md:-mt-14"
                />
                <div className="flex min-w-0 flex-col gap-0.5 pb-1">
                  <h1 className="truncate text-2xl font-semibold leading-tight">
                    {profile.name}
                  </h1>
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
                  href={`/${lang}/d/${profile.slug}/posts`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {t("openFeed")}
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

        <OsLinkBridge>
          <CompanyFeed lang={lang} viewer={viewer} />
        </OsLinkBridge>
      </div>
    </ProfileShell>
  )
}

function CoverImage({ url }: { url: string | null }) {
  return (
    <div className="relative h-28 w-full bg-gradient-to-br from-primary/15 via-muted/30 to-primary/5 sm:h-36">
      {url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={url}
          alt=""
          className="absolute inset-0 size-full object-cover"
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
        "flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-card bg-muted shadow-md md:size-24",
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
