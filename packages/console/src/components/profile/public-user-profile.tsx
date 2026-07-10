"use client"

import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Location01Icon,
  GlobalIcon,
  Calendar03Icon,
  NewTwitterIcon,
  GithubIcon,
  Linkedin01Icon,
  InstagramIcon,
  YoutubeIcon,
  FacebookIcon,
  MastodonIcon,
  Mail01Icon,
  Link01Icon,
} from "@hugeicons/core-free-icons"
import { ProfileShell } from "@workspace/console/components/profile/profile-shell"
import { UserProfileFeed } from "@workspace/console/components/social/user-profile-feed"

interface SocialLink {
  type: string
  url: string
}

interface PublicUser {
  id: string
  name: string
  image: string | null
  profileSlug: string
  bio: string | null
  headline: string | null
  location: string | null
  website: string | null
  coverImage: string | null
  socialLinks: SocialLink[]
  createdAt: Date | null
}

const SOCIAL_ICON_MAP: Record<string, typeof NewTwitterIcon> = {
  twitter: NewTwitterIcon,
  github: GithubIcon,
  linkedin: Linkedin01Icon,
  instagram: InstagramIcon,
  youtube: YoutubeIcon,
  facebook: FacebookIcon,
  mastodon: MastodonIcon,
  email: Mail01Icon,
  other: Link01Icon,
}

const SOCIAL_LABELS: Record<string, string> = {
  twitter: "Twitter / X",
  github: "GitHub",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
  mastodon: "Mastodon",
  email: "Email",
  other: "Link",
}

function normalizeUrl(type: string, url: string): string {
  if (type === "email") {
    return url.startsWith("mailto:") ? url : `mailto:${url}`
  }
  return url.startsWith("http") ? url : `https://${url}`
}

/**
 * Public profile page — LinkedIn benzeri compact layout.
 * Üstte minimal Sentroy navbar, ortada profil kartı (avatar + meta + bio +
 * social), altta footer. Cover banner + avatar overlap, ama avatar
 * boyutu daha mütevazı (24×24 = 96px) — eski 32 büyük geliyordu.
 */
export function PublicUserProfile({
  user,
  lang,
  viewer,
}: {
  user: PublicUser
  lang?: string
  viewer?: {
    id: string
    name: string | null
    image: string | null
  } | null
}) {
  const t = useTranslations("publicProfile")

  const initials = (user.name || user.profileSlug || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("")

  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
      })
    : null

  const websiteHref = user.website
    ? user.website.startsWith("http")
      ? user.website
      : `https://${user.website}`
    : null
  const websiteLabel = user.website
    ? user.website.replace(/^https?:\/\//, "").replace(/\/+$/, "")
    : null

  const validSocials = user.socialLinks.filter(
    (s) => s.url && s.url.trim().length > 0,
  )

  return (
    <ProfileShell mode="public" slug={user.profileSlug}>
      {/* ── Profile content ─────────────────────────────────────────────── */}
      <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 pb-10 pt-6">
          {/* Profile header — cover banner + avatar overlap (tek kart) */}
          <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
            {/* Cover */}
            <div className="relative h-28 w-full bg-gradient-to-br from-primary/10 via-muted/40 to-primary/5 sm:h-36">
              {user.coverImage && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={user.coverImage} alt="" className="absolute inset-0 size-full object-cover" />
              )}
            </div>

            {/* Header content */}
            <div className="flex flex-col gap-3 px-5 pb-5 sm:px-6">
              <div className="flex flex-col items-start gap-4 md:flex-row md:items-end md:justify-between">
                <div className="flex items-end gap-4">
                  <div className="relative z-10 -mt-10 flex size-20 items-center justify-center overflow-hidden rounded-full border-4 border-card bg-muted text-2xl font-semibold uppercase text-muted-foreground shadow-sm md:-mt-12 md:size-24 md:text-3xl">
                    {user.image ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={user.image} alt={user.name} className="size-full object-cover" />
                    ) : (
                      <span>{initials}</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5 pb-1">
                    <h1 className="text-xl font-bold leading-tight md:text-2xl">{user.name}</h1>
                    {user.headline && (
                      <p className="text-sm text-muted-foreground md:text-base">{user.headline}</p>
                    )}
                  </div>
                </div>

                {/* Social icons cluster — küçük, header sağında */}
                {validSocials.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {validSocials.map((s, i) => {
                      const icon = SOCIAL_ICON_MAP[s.type] ?? Link01Icon
                      return (
                        <a
                          key={i}
                          href={normalizeUrl(s.type, s.url)}
                          target="_blank"
                          rel="noreferrer noopener"
                          title={SOCIAL_LABELS[s.type] ?? s.type}
                          className="inline-flex size-8 items-center justify-center rounded-full border bg-muted/30 text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted hover:text-foreground"
                        >
                          <HugeiconsIcon icon={icon} strokeWidth={2} className="size-3.5" />
                        </a>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Meta chips */}
              {(user.location || websiteHref || memberSince) && (
                <div className="flex flex-wrap items-center gap-3 border-t pt-3 text-xs text-muted-foreground">
                  {user.location && (
                    <span className="inline-flex items-center gap-1">
                      <HugeiconsIcon icon={Location01Icon} strokeWidth={2} className="size-3.5" />
                      {user.location}
                    </span>
                  )}
                  {websiteHref && (
                    <a
                      href={websiteHref}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <HugeiconsIcon icon={GlobalIcon} strokeWidth={2} className="size-3.5" />
                      {websiteLabel}
                    </a>
                  )}
                  {memberSince && (
                    <span className="inline-flex items-center gap-1">
                      <HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} className="size-3.5" />
                      {t("memberSince", { date: memberSince })}
                    </span>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Bio */}
          {user.bio && (
            <section className="flex flex-col gap-2 rounded-xl border bg-card p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("about")}
              </h2>
              <p className="whitespace-pre-line text-sm leading-relaxed">
                {user.bio}
              </p>
            </section>
          )}

          {/* Activity feed — intranet posts shared with the viewer */}
          {lang && (
            <UserProfileFeed
              profileSlug={user.profileSlug}
              lang={lang}
              viewer={viewer ?? null}
            />
          )}

          {/* Connect — tam social listesi */}
          {validSocials.length > 0 && (
            <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("connect")}
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {validSocials.map((s, i) => {
                  const icon = SOCIAL_ICON_MAP[s.type] ?? Link01Icon
                  return (
                    <a
                      key={i}
                      href={normalizeUrl(s.type, s.url)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="group flex items-center gap-3 rounded-lg border bg-muted/20 p-3 transition-colors hover:border-foreground/20 hover:bg-muted/40"
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-background">
                        <HugeiconsIcon
                          icon={icon}
                          strokeWidth={2}
                          className="size-4"
                        />
                      </div>
                      <div className="flex min-w-0 flex-col">
                        <span className="text-xs font-medium">
                          {SOCIAL_LABELS[s.type] ?? s.type}
                        </span>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {s.url
                            .replace(/^https?:\/\//, "")
                            .replace(/^mailto:/, "")}
                        </span>
                      </div>
                    </a>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      </ProfileShell>
  )
}
